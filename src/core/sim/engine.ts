import type { CircuitDocument, ComponentInstance } from "../model/types";
import { getComponentDefinition } from "../library/registry";
import type { Behavior, ValveSide } from "../library/types";
import type { ComponentRuntime, PressureState, SimulationSnapshot } from "./types";
import { solveFluid } from "./fluid-solver";
import { solveElectric } from "./electric-solver";
import { PlcRunner, type PlcMonitor } from "../plc/scanner";

/** 릴레이·타이머·카운터 디바이스 상태 (이름표로 접점과 연결) */
interface DeviceState {
  kind: "relay" | "timer-on" | "timer-off" | "counter";
  preset: number;
  /** 이번 틱 코일 통전 */
  coil: boolean;
  /** 접점이 참조하는 출력 */
  output: boolean;
  elapsed: number;
  count: number;
  prevCoil: boolean;
}

/**
 * 롤러 리밋 감지 허용 오차. 행정 끝에 도달했을 때만 트리거 —
 * 넓은 창을 쓰면 전 행정을 완료하기 전에 반전이 시작된다 (실물은 스트로크 끝에서 캠 접촉).
 */
const ROLLER_EPS = 1e-6;

/**
 * 시뮬레이션 엔진 (ARCHITECTURE 4.1).
 * React 무관 — 고정 틱으로 tick(dt)을 호출하면 상태를 갱신하고 스냅숏을 만든다.
 * 틱 순서: 밸브 전환(직전 틱 압력 기준) → 유체 솔브 → 실린더 적분.
 */
export class SimulationEngine {
  private doc: CircuitDocument;
  private runtimes = new Map<string, ComponentRuntime>();
  private devices = new Map<string, DeviceState>();
  /** 이번 틱 통전된 솔레노이드 이름표 */
  private energizedSolenoids = new Set<string>();
  private plcRunner: PlcRunner | null = null;
  private plcMonitor: PlcMonitor | null = null;
  /** PLC 출력이 강제한 부하 통전 (componentId → on). 전기 고정점에서 회로 통전과 OR 결합 */
  private plcForced = new Map<string, boolean>();
  private time = 0;
  private listeners = new Set<(snap: SimulationSnapshot) => void>();
  /** 최근 솔브 수렴 여부 (발진 회로 진단, review-2 P0) */
  private electricConverged = true;
  private fluidConverged = true;

  constructor(doc: CircuitDocument) {
    this.doc = doc;
    for (const comp of doc.components) {
      const behavior = getComponentDefinition(comp.type).behavior;
      const runtime: ComponentRuntime = { portState: {} };
      if (behavior?.role === "valve") {
        runtime.valvePosition = initialValvePosition(comp, behavior);
        runtime.manualActive = false;
      }
      if (behavior?.role === "cylinder") {
        runtime.cylinderPos = comp.properties.initialPosition === "extended" ? 1 : 0;
      }
      if (behavior?.role === "motor") {
        runtime.motorAngle = 0;
      }
      if (behavior?.role === "elec-contact") {
        runtime.manualActive = false;
        runtime.contactClosed = false;
      }
      if (behavior?.role === "elec-load") {
        runtime.energized = false;
        // 디바이스 등록 — key는 "종류:이름표" (typed identity, codex-review-3 P0).
        // 같은 종류·이름표 코일은 하나의 디바이스로 병합되고, preset 충돌은
        // 문서 순서와 무관하게 결정적으로 max를 취한다 (충돌은 실행 전 검증이 경고)
        const label = String(comp.properties.label ?? "");
        if (label && ["relay", "timer-on", "timer-off", "counter"].includes(behavior.device)) {
          const kind = deviceKind(behavior.device, comp);
          const key = `${kind}:${label}`;
          const preset = Number(comp.properties.preset ?? 0);
          const existing = this.devices.get(key);
          if (existing) {
            existing.preset = Math.max(existing.preset, preset);
          } else {
            this.devices.set(key, {
              kind,
              preset,
              coil: false,
              output: false,
              elapsed: 0,
              count: 0,
              prevCoil: false,
            });
          }
        }
      }
      this.runtimes.set(comp.id, runtime);
    }
    if (doc.plcProgram && doc.plcProgram.rungs.length > 0) {
      this.plcRunner = new PlcRunner(doc.plcProgram);
    }

    // 초기 상태 확정 (t=0): 유체 먼저 풀어야 압력 스위치 접점이 올바른 초기값을 가진다
    this.solveAndStore();
    this.solveElectricFixpoint();
    this.solveAndStore();
  }

  subscribe(listener: (snap: SimulationSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 수동 조작 입력 (푸시버튼 누름/뗌, 레버 토글 결과) */
  setManual(componentId: string, active: boolean): void {
    const runtime = this.runtimes.get(componentId);
    if (runtime) runtime.manualActive = active;
  }

  getManual(componentId: string): boolean {
    return this.runtimes.get(componentId)?.manualActive ?? false;
  }

  tick(dt: number): SimulationSnapshot {
    this.time += dt;

    // 1. 전기 솔브 (릴레이 체인 고정점) + 타이머/카운터 갱신
    this.solveElectricFixpoint();
    this.updateDevices(dt);

    // 1.5 PLC 스캔 — 입력 이미지(접점 상태) → 스캔 → 출력을 부하에 강제 반영
    this.runPlcScan(dt);

    // 2. 밸브 전환 (솔레노이드: 이번 틱 전기 결과, 파일럿: 직전 유체 솔브 기준)
    for (const comp of this.doc.components) {
      const behavior = getComponentDefinition(comp.type).behavior;
      if (behavior?.role !== "valve") continue;
      const runtime = this.runtimes.get(comp.id)!;
      runtime.valvePosition = this.resolveValvePosition(comp, behavior, runtime);
    }

    // 3. 유체 솔브
    const solve = this.solveAndStore();

    // 4. 실린더 적분
    for (const comp of this.doc.components) {
      const behavior = getComponentDefinition(comp.type).behavior;
      if (behavior?.role !== "cylinder") continue;
      const runtime = this.runtimes.get(comp.id)!;
      const strokeTime = Math.max(0.2, Number(comp.properties.strokeTime ?? 1));
      const baseSpeed = 1 / strokeTime;

      const head = runtime.portState[behavior.headPort] ?? "blocked";
      const headSupply = solve.supplyFactor.get(key(comp.id, behavior.headPort)) ?? 0;
      const headExhaust = solve.exhaustFactor.get(key(comp.id, behavior.headPort)) ?? 0;

      let velocity = 0;
      if (behavior.singleActing) {
        if (head === "pressurized") velocity = baseSpeed * headSupply;
        else if (head === "exhausted") velocity = -baseSpeed * headExhaust;
      } else if (behavior.rodPort) {
        const rod = runtime.portState[behavior.rodPort] ?? "blocked";
        const rodSupply = solve.supplyFactor.get(key(comp.id, behavior.rodPort)) ?? 0;
        const rodExhaust = solve.exhaustFactor.get(key(comp.id, behavior.rodPort)) ?? 0;
        if (head === "pressurized" && rod === "exhausted")
          velocity = baseSpeed * Math.min(headSupply, rodExhaust);
        else if (rod === "pressurized" && head === "exhausted")
          velocity = -baseSpeed * Math.min(rodSupply, headExhaust);
      }

      runtime.cylinderPos = clamp01((runtime.cylinderPos ?? 0) + velocity * dt);
    }

    // 5. 모터 적분 (A 가압·B 배출 → 정회전, 반대 → 역회전)
    for (const comp of this.doc.components) {
      const behavior = getComponentDefinition(comp.type).behavior;
      if (behavior?.role !== "motor") continue;
      const runtime = this.runtimes.get(comp.id)!;
      const a = runtime.portState[behavior.portA] ?? "blocked";
      const b = runtime.portState[behavior.portB] ?? "blocked";
      const rps = Math.max(0.1, Number(comp.properties.speed ?? 1));
      let direction = 0;
      if (a === "pressurized" && b === "exhausted") direction = 1;
      else if (b === "pressurized" && a === "exhausted") direction = -1;
      runtime.motorAngle = (runtime.motorAngle ?? 0) + direction * 360 * rps * dt;
    }

    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
    return snap;
  }

  /** 솔브 실행 후 포트 상태를 런타임에 반영 */
  private solveAndStore() {
    const solve = solveFluid(this.doc, this.runtimes);
    for (const comp of this.doc.components) {
      const runtime = this.runtimes.get(comp.id)!;
      const def = getComponentDefinition(comp.type);
      const portState: Record<string, PressureState> = {};
      const portLevel: Record<string, number> = {};
      for (const port of def.ports) {
        const st = solve.portState.get(key(comp.id, port.id));
        if (st) portState[port.id] = st;
        const lv = solve.supplyLevel.get(key(comp.id, port.id));
        if (lv !== undefined) portLevel[port.id] = lv;
      }
      runtime.portState = portState;
      runtime.portLevel = portLevel;
      const relief = solve.reliefActive.get(comp.id);
      if (relief !== undefined) runtime.reliefActive = relief;
    }
    this.lastWireState = solve.wireState;
    this.fluidConverged = solve.converged !== false;
    return solve;
  }

  private lastWireState = new Map<string, PressureState>();
  private lastElectricWireHot = new Map<string, boolean>();

  /**
   * 전기 연결성 해석. 릴레이 접점이 회로 자신을 바꾸므로
   * 통전 결과가 안정될 때까지 반복 (≤5회, ARCHITECTURE 4.2).
   * PLC 출력이 강제한 부하(plcForced)는 회로 통전과 OR로 결합되어
   * 릴레이·타이머·카운터 코일 집계에 함께 반영된다 (codex-review H2).
   * 타이머·카운터의 시간/에지 전이는 updateDevices에서 dt 기반으로 갱신된다.
   */
  private solveElectricFixpoint(): void {
    // 릴레이 체인 길이에 비례한 반복 상한 (디바이스 하나당 1단계 전파)
    const maxIter = Math.max(5, this.devices.size + 3);
    this.electricConverged = false;
    for (let iter = 0; iter < maxIter; iter++) {
      // 접점 상태 확정 (현재 디바이스 출력·수동 입력·실린더 위치 기준)
      for (const comp of this.doc.components) {
        const behavior = getComponentDefinition(comp.type).behavior;
        if (behavior?.role !== "elec-contact") continue;
        this.runtimes.get(comp.id)!.contactClosed = this.isContactClosed(comp);
      }

      const result = solveElectric(this.doc, (id) => this.runtimes.get(id)?.contactClosed ?? false);

      let changed = false;
      // 코일 집계는 "종류:이름표" 채널로 분리 — 솔레노이드 K1이 릴레이 K1을
      // 구동하는 등의 종류 간 오염을 막는다 (review-2 P0: 이름표 네임스페이스)
      const coilByChannel = new Map<string, boolean>();
      const solenoidByLabel = new Map<string, boolean>();
      for (const comp of this.doc.components) {
        const behavior = getComponentDefinition(comp.type).behavior;
        if (behavior?.role !== "elec-load") continue;
        const runtime = this.runtimes.get(comp.id)!;
        const on = (result.energized.get(comp.id) ?? false) || (this.plcForced.get(comp.id) ?? false);
        if (runtime.energized !== on) changed = true;
        runtime.energized = on;

        const label = String(comp.properties.label ?? "");
        if (!label) continue;
        if (behavior.device === "solenoid") {
          // 솔레노이드는 label별 OR로 집계 — 순회 순서에 따른 신호 소실 방지 (M2)
          solenoidByLabel.set(label, (solenoidByLabel.get(label) ?? false) || on);
        } else if (["relay", "timer-on", "timer-off", "counter"].includes(behavior.device)) {
          const kind = deviceKind(behavior.device, comp);
          const ch = `${kind}:${label}`;
          coilByChannel.set(ch, (coilByChannel.get(ch) ?? false) || on);
        }
      }

      const nextSolenoids = new Set<string>();
      for (const [label, on] of solenoidByLabel) if (on) nextSolenoids.add(label);
      this.energizedSolenoids = nextSolenoids;

      // 릴레이는 즉시 반응: coil → output. 타이머/카운터 코일 상태만 기록.
      for (const [key, device] of this.devices) {
        device.coil = coilByChannel.get(key) ?? false;
        if (device.kind === "relay") {
          if (device.output !== device.coil) changed = true;
          device.output = device.coil;
        }
      }

      this.lastElectricWireHot = result.wireHot;
      if (!changed) {
        this.electricConverged = true;
        break;
      }
    }
  }

  /**
   * 타이머·카운터의 시간/에지 기반 상태 갱신 (틱당 1회).
   * 출력이 바뀌면 접점이 같은 틱에 반영되도록 전기 고정점을 재실행한다.
   */
  private updateDevices(dt: number): void {
    let outputChanged = false;
    // 카운터 리셋 코일 수집
    const resetLabels = new Set<string>();
    for (const comp of this.doc.components) {
      const behavior = getComponentDefinition(comp.type).behavior;
      if (behavior?.role === "elec-load" && behavior.device === "counter-reset") {
        if (this.runtimes.get(comp.id)?.energized) {
          resetLabels.add(String(comp.properties.label ?? ""));
        }
      }
    }

    for (const [key, device] of this.devices) {
      const label = key.slice(key.indexOf(":") + 1);
      const prevOutput = device.output;
      switch (device.kind) {
        case "relay":
          break;
        case "timer-on":
          if (device.coil) {
            device.elapsed += dt;
            device.output = device.elapsed >= device.preset;
          } else {
            device.elapsed = 0;
            device.output = false;
          }
          break;
        case "timer-off":
          if (device.coil) {
            device.output = true;
            device.elapsed = 0;
          } else if (device.output) {
            device.elapsed += dt;
            if (device.elapsed >= device.preset) device.output = false;
          }
          break;
        case "counter":
          if (device.coil && !device.prevCoil) device.count += 1;
          if (resetLabels.has(label)) device.count = 0;
          device.output = device.count >= device.preset;
          break;
      }
      device.prevCoil = device.coil;
      if (device.output !== prevOutput) outputChanged = true;
    }

    if (outputChanged) this.solveElectricFixpoint();
  }

  /** PLC 스캔: ioMap 입력 → 스캔 → 출력 부품 통전 강제 */
  private runPlcScan(dt: number): void {
    if (!this.plcRunner) return;
    const ioMap = this.doc.ioMap ?? [];

    const inputs = new Map<string, boolean>();
    for (const entry of ioMap) {
      if (entry.direction !== "input") continue;
      inputs.set(entry.device, this.runtimes.get(entry.componentId)?.contactClosed ?? false);
    }

    const outputs = this.plcRunner.scan(dt, inputs);
    this.plcMonitor = this.plcRunner.getMonitor();

    // 출력은 plcForced에만 기록하고, 전기 고정점 재실행으로 부하 통전·디바이스 코일·
    // 솔레노이드 집계·후속 접점까지 일관되게 반영한다 (H2: PLC→릴레이/타이머/카운터 연동)
    let changed = false;
    for (const entry of ioMap) {
      if (entry.direction !== "output") continue;
      if (!this.runtimes.has(entry.componentId)) continue;
      const on = outputs.get(entry.device) ?? false;
      if ((this.plcForced.get(entry.componentId) ?? false) !== on) changed = true;
      this.plcForced.set(entry.componentId, on);
    }
    if (changed) {
      this.solveElectricFixpoint();
      this.updateDevices(0); // 시간 경과 없이 에지/출력 전이만 반영
    }
  }

  /** 접점 닫힘 판정 (NC 반전 포함) */
  private isContactClosed(comp: ComponentInstance): boolean {
    const behavior = getComponentDefinition(comp.type).behavior;
    if (behavior?.role !== "elec-contact") return false;
    let raw = false;
    switch (behavior.source) {
      case "manual":
        raw = this.runtimes.get(comp.id)?.manualActive ?? false;
        break;
      case "device": {
        const label = String(comp.properties.deviceLabel ?? "");
        raw = this.deviceOutputByLabel(label);
        break;
      }
      case "limit": {
        const label = String(comp.properties.cylinderLabel ?? "");
        const target = comp.properties.triggerAt === "retracted" ? 0 : 1;
        const cylinder = this.findCylinderByLabel(label);
        if (cylinder) {
          const pos = this.runtimes.get(cylinder.id)?.cylinderPos ?? 0;
          raw = Math.abs(pos - target) <= ROLLER_EPS;
        }
        break;
      }
      case "pressure": {
        // 압력 스위치: 유체 포트 레벨이 설정값 이상이면 동작 (직전 유체 솔브 기준)
        const port = behavior.pressurePort ?? "P";
        const threshold = Number(comp.properties.threshold ?? 3);
        const runtime = this.runtimes.get(comp.id);
        raw =
          runtime?.portState[port] === "pressurized" &&
          (runtime.portLevel?.[port] ?? 0) >= threshold;
        break;
      }
    }
    return comp.properties.contactType === "NC" ? !raw : raw;
  }

  /** 밸브 위치 결정: 왼쪽 활성 → 0, 오른쪽 활성 → 마지막, 무신호 → 스프링/유지 */
  private resolveValvePosition(
    comp: ComponentInstance,
    behavior: Extract<Behavior, { role: "valve" }>,
    runtime: ComponentRuntime,
  ): number {
    const last = behavior.positions.length - 1;
    const current = runtime.valvePosition ?? behavior.initial;

    const leftActive = this.sideActive(comp, behavior.left, runtime);
    const rightActive = this.sideActive(comp, behavior.right, runtime);

    if (leftActive && !rightActive) return 0;
    if (rightActive && !leftActive) return last;
    if (leftActive && rightActive) return current; // 임펄스 충돌 — 유지

    // 무신호: 스프링 복귀
    if (behavior.springCentered) return Math.floor(behavior.positions.length / 2); // 5/3 중립
    const leftSpring = behavior.left.kind === "spring";
    const rightSpring = behavior.right.kind === "spring";
    if (leftSpring && rightSpring) return Math.floor(behavior.positions.length / 2);
    if (leftSpring) return 0;
    if (rightSpring) return last;
    return current; // 양측 파일럿/솔레노이드 (메모리)
  }

  /** 한쪽 조작이 활성인지 (스프링은 강신호가 아니므로 false) */
  private sideActive(
    comp: ComponentInstance,
    side: ValveSide,
    runtime: ComponentRuntime,
  ): boolean {
    switch (side.kind) {
      case "manual":
        return runtime.manualActive === true;
      case "pilot": {
        if (!side.pilotPort) return false;
        return runtime.portState[side.pilotPort] === "pressurized";
      }
      case "solenoid": {
        if (!side.solenoidProp) return false;
        const label = String(comp.properties[side.solenoidProp] ?? "");
        return label !== "" && this.energizedSolenoids.has(label);
      }
      case "roller": {
        const label = String(comp.properties.cylinderLabel ?? "");
        const target = comp.properties.triggerAt === "retracted" ? 0 : 1;
        const cylinder = this.findCylinderByLabel(label);
        if (!cylinder) return false;
        const pos = this.runtimes.get(cylinder.id)?.cylinderPos ?? 0;
        return Math.abs(pos - target) <= ROLLER_EPS;
      }
      case "spring":
      case "none":
        return false;
    }
  }

  /** 이름표로 디바이스 출력 조회 — 종류(kind)별 채널의 OR. 문서 순서와 무관하게 결정적 */
  private deviceOutputByLabel(label: string): boolean {
    if (!label) return false;
    for (const kind of ["relay", "timer-on", "timer-off", "counter"] as const) {
      if (this.devices.get(`${kind}:${label}`)?.output) return true;
    }
    return false;
  }

  private findCylinderByLabel(label: string): ComponentInstance | undefined {
    if (!label) return undefined;
    return this.doc.components.find((c) => {
      const behavior = getComponentDefinition(c.type).behavior;
      return behavior?.role === "cylinder" && String(c.properties.label ?? "") === label;
    });
  }

  snapshot(): SimulationSnapshot {
    const components: SimulationSnapshot["components"] = {};
    for (const [id, runtime] of this.runtimes) {
      components[id] = {
        valvePosition: runtime.valvePosition,
        cylinderPos: runtime.cylinderPos,
        manualActive: runtime.manualActive,
        energized: runtime.energized,
        contactClosed: runtime.contactClosed,
        portState: { ...runtime.portState },
        portLevel: runtime.portLevel ? { ...runtime.portLevel } : undefined,
        motorAngle: runtime.motorAngle,
        reliefActive: runtime.reliefActive,
      };
    }
    const wires: Record<string, PressureState> = {};
    for (const [wireId, st] of this.lastWireState) wires[wireId] = st;
    for (const [wireId, hot] of this.lastElectricWireHot) {
      wires[wireId] = hot ? "pressurized" : "blocked";
    }
    return {
      time: this.time,
      components,
      wires,
      plc: this.plcMonitor ?? undefined,
      diagnostics: {
        electricConverged: this.electricConverged,
        fluidConverged: this.fluidConverged,
      },
    };
  }
}

/** 부하의 실효 디바이스 종류 (timer-on + off-delay 모드 → timer-off) */
function deviceKind(device: string, comp: ComponentInstance): DeviceState["kind"] {
  return device === "timer-on" && comp.properties.mode === "off-delay"
    ? "timer-off"
    : (device as DeviceState["kind"]);
}

function initialValvePosition(
  comp: ComponentInstance,
  behavior: Extract<Behavior, { role: "valve" }>,
): number {
  // 양측 파일럿 밸브는 initialPosition 속성으로 시작 위치 선택 가능
  if (comp.properties.initialPosition === "left") return 0;
  if (comp.properties.initialPosition === "right") return behavior.positions.length - 1;
  return behavior.initial;
}

function key(componentId: string, portId: string): string {
  return `${componentId}:${portId}`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
