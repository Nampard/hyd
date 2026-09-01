import type { CircuitDocument } from "../model/types";
import { getComponentDefinition } from "../library/registry";
import type { PressureState } from "./types";
import { portKey } from "./types";
import type { ComponentRuntime } from "./types";

/**
 * 유체 솔버 — 압력 상태 전파 (공압/유압 공용, ARCHITECTURE 4.3).
 *
 * 1. 배선으로 이어진 포트들을 넷(net)으로 병합 (union-find)
 * 2. 부품 behavior에서 내부 연결(간선)·소스·배기 터미널 도출
 * 3. 소스에서 가압 전파, 배기에서 배기 전파 (가압 우선)
 *    간선에는 방향별 유량 계수(속도제어밸브 교축)가 있어 경로 계수를 함께 전파
 * 4. 셔틀/2압/급속배기처럼 연결이 압력 상태에 의존하는 부품은 고정점까지 반복 (≤4회)
 */

export interface SolveResult {
  /** portKey → 상태 */
  portState: Map<string, PressureState>;
  /** portKey → 가압 경로의 유량 계수 (0..1, 가압 아닐 때 0) */
  supplyFactor: Map<string, number>;
  /** portKey → 배기 경로의 유량 계수 (0..1, 배기 아닐 때 0) */
  exhaustFactor: Map<string, number>;
  /**
   * portKey → 압력 레벨 (bar). 정량 해석이 아니라 경로상 최소 캡 전파(준정량, Phase 7).
   * 가압 아닌 포트는 0.
   */
  supplyLevel: Map<string, number>;
  /** wireId → 상태 */
  wireState: Map<string, PressureState>;
  /** 동적 연결 반복이 상한 내에 수렴했는지 (발진 회로 진단, review-2) */
  converged?: boolean;
  /** 릴리프 밸브 compId → 이번 솔브에서 릴리빙 중인지 (기호 표시용, review-2 P1) */
  reliefActive: Map<string, boolean>;
  /** 압력 조작 밸브 compId → 열림 여부 (Phase 15, 다음 틱 히스테리시스 입력) */
  pressureValveOpen: Map<string, boolean>;
  /**
   * 어큐뮬레이터 compId → 외부 압력원(자신 제외)이 공급 중인지 (Phase 15).
   * 엔진이 충전/방전 판정에 쓴다.
   */
  accumulatorSupplied: Map<string, boolean>;
}

interface Edge {
  a: number; // net index
  b: number;
  factorAB: number; // a→b 흐름 계수
  factorBA: number;
  /** 압력 레벨 상한 (감압밸브). 기본 무제한 */
  levelCapAB?: number;
  levelCapBA?: number;
}

export function solveFluid(
  doc: CircuitDocument,
  runtimes: Map<string, ComponentRuntime>,
): SolveResult {
  // --- 1. 넷 구성 ---
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(k, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const allPortKeys: string[] = [];
  for (const comp of doc.components) {
    const def = getComponentDefinition(comp.type);
    for (const port of def.ports) {
      if (port.kind !== "pneumatic" && port.kind !== "hydraulic") continue;
      const k = portKey(comp.id, port.id);
      allPortKeys.push(k);
      parent.set(k, k);
    }
  }
  for (const wire of doc.wires) {
    if (wire.kind === "electric") continue;
    union(portKey(wire.from.componentId, wire.from.portId), portKey(wire.to.componentId, wire.to.portId));
  }

  const netIndex = new Map<string, number>(); // root key → net idx
  const netOfPort = new Map<string, number>();
  for (const k of allPortKeys) {
    const root = find(k);
    if (!netIndex.has(root)) netIndex.set(root, netIndex.size);
    netOfPort.set(k, netIndex.get(root)!);
  }
  const netCount = netIndex.size;

  const wiredPorts = new Set<string>();
  for (const wire of doc.wires) {
    wiredPorts.add(portKey(wire.from.componentId, wire.from.portId));
    wiredPorts.add(portKey(wire.to.componentId, wire.to.portId));
  }

  // --- 2. 고정 요소: 소스/배기 터미널, 정적 간선 ---
  const sourceNets = new Set<number>();
  /** 소스 넷별 공급 압력 레벨 (bar) */
  const sourceLevels = new Map<number, number>();
  const exhaustNets = new Set<number>();
  const staticEdges: Edge[] = [];
  /** 릴리프 밸브 목록 (활성 시 유로 레벨 상한) */
  const reliefs: { compId: string; netP: number; netT: number; setpoint: number }[] = [];
  /**
   * 부하압이 설정된 실린더 (Phase 15). 아직 행정이 남은 방향으로 실제 이동 가능하면
   * 공급 유로 전체의 레벨을 부하압으로 제한한다 — 운동 중에는 라인 압력이 부하압까지
   * 낮아지고 행정 완료(정지)에서 소스 압력까지 상승하는 거동.
   */
  const loadCylinders: {
    compId: string;
    headPort: string;
    rodPort?: string;
    netHead: number;
    netRod?: number;
    load: number;
  }[] = [];
  /** 어큐뮬레이터 (Phase 15) — 잔량이 있으면 보조 압력원 */
  const accumulators: { compId: string; net: number }[] = [];
  /** 압력원 중 어큐뮬레이터를 제외한 실제 소스 (충전/방전 판정용) */
  const realSourceNets = new Set<number>();

  const net = (compId: string, pid: string) => netOfPort.get(portKey(compId, pid))!;
  const addSource = (n: number, level: number) => {
    sourceNets.add(n);
    sourceLevels.set(n, Math.max(sourceLevels.get(n) ?? 0, level));
  };

  for (const comp of doc.components) {
    const def = getComponentDefinition(comp.type);
    const behavior = def.behavior;
    if (!behavior) continue;
    const runtime = runtimes.get(comp.id);

    switch (behavior.role) {
      case "source":
        addSource(net(comp.id, behavior.port), Number(comp.properties.pressure ?? 6));
        realSourceNets.add(net(comp.id, behavior.port));
        break;
      case "accumulator": {
        accumulators.push({ compId: comp.id, net: net(comp.id, behavior.port) });
        // 잔량이 있으면 보조 압력원 — 방전에 따라 레벨이 함께 낮아진다
        const charge = clamp01(Number(runtime?.accumulatorCharge ?? 0));
        const stored = Number(runtime?.accumulatorLevel ?? 0);
        if (charge > 0 && stored > 0) addSource(net(comp.id, behavior.port), stored * charge);
        break;
      }
      case "reducer":
        // 정방향만 감압 — 역방향 흐름에는 cap을 적용하지 않는다 (codex-review 감압 방향 결함)
        staticEdges.push({
          a: net(comp.id, behavior.portIn),
          b: net(comp.id, behavior.portOut),
          factorAB: 1,
          factorBA: 1,
          levelCapAB: Number(comp.properties.pressure ?? 20),
        });
        break;
      case "pressure-relief":
        // 릴리프는 내부 유로를 만들지 않는다 — 활성 시 레벨 상한만 부여 (아래 반복 해석에서)
        reliefs.push({
          compId: comp.id,
          netP: net(comp.id, behavior.pressurePort),
          netT: net(comp.id, behavior.tankPort),
          setpoint: Number(comp.properties.pressure ?? 50),
        });
        break;
      case "exhaust":
        exhaustNets.add(net(comp.id, behavior.port));
        break;
      case "conduit":
        for (const [x, y] of behavior.connections) {
          staticEdges.push({ a: net(comp.id, x), b: net(comp.id, y), factorAB: 1, factorBA: 1 });
        }
        break;
      case "valve": {
        const pos = runtime?.valvePosition ?? behavior.initial;
        for (const [x, y] of behavior.positions[pos].connections) {
          staticEdges.push({ a: net(comp.id, x), b: net(comp.id, y), factorAB: 1, factorBA: 1 });
        }
        // 미배선 배기 포트 = 대기 개방
        for (const pid of behavior.exhaustPorts) {
          if (!wiredPorts.has(portKey(comp.id, pid))) exhaustNets.add(net(comp.id, pid));
        }
        break;
      }
      case "restrictor": {
        const openness = clamp01(Number(comp.properties.openness ?? 0.5), 0.05);
        staticEdges.push({
          a: net(comp.id, behavior.portA),
          b: net(comp.id, behavior.portB),
          factorAB: 1,
          factorBA: openness,
        });
        break;
      }
      case "hydraulic-power-unit":
        addSource(net(comp.id, behavior.pressurePort), Number(comp.properties.pressure ?? 40));
        realSourceNets.add(net(comp.id, behavior.pressurePort));
        exhaustNets.add(net(comp.id, behavior.tankPort));
        break;
      case "check-valve":
        staticEdges.push({
          a: net(comp.id, behavior.portA),
          b: net(comp.id, behavior.portB),
          factorAB: 1,
          factorBA: 0,
        });
        break;
      case "quick-exhaust":
        if (!wiredPorts.has(portKey(comp.id, behavior.exhaustR))) {
          // R은 배기 전용 — 동적 연결 단계에서 A→R이 열릴 때만 의미 있음
        }
        break;
      case "cylinder": {
        const load = Number(comp.properties.loadPressure ?? 0);
        if (load > 0) {
          loadCylinders.push({
            compId: comp.id,
            headPort: behavior.headPort,
            rodPort: behavior.rodPort,
            netHead: net(comp.id, behavior.headPort),
            netRod: behavior.rodPort ? net(comp.id, behavior.rodPort) : undefined,
            load,
          });
        }
        break;
      }
      case "motor": // 실린더처럼 두 포트를 소비 단자로 취급 (가압/배출 조합이 회전 방향)
      case "shuttle":
      case "two-pressure":
      case "pilot-check":
      case "pressure-pilot-valve": // 개폐가 파일럿 레벨에 의존 — 아래 반복 해석에서
        break;
      case "elec-supply":
      case "elec-contact":
      case "elec-load":
      case "automation-station": // 유체 포트 없음 — MPS 물리는 엔진의 stepAutomationStation이 담당
        break;
    }
  }

  // --- 3+4. 동적 연결 반복 해석 ---
  let portStatePrev = new Map<string, PressureState>();
  let portLevelPrev = new Map<string, number>();
  // 초기 추정: 직전 틱 상태 (셔틀·2압 등이 첫 반복에서 활용)
  for (const comp of doc.components) {
    const runtime = runtimes.get(comp.id);
    if (!runtime) continue;
    for (const [pid, st] of Object.entries(runtime.portState)) {
      portStatePrev.set(portKey(comp.id, pid), st);
    }
    for (const [pid, lv] of Object.entries(runtime.portLevel ?? {})) {
      portLevelPrev.set(portKey(comp.id, pid), lv);
    }
  }

  let result: SolveResult | null = null;

  // 동적 연결 부품 수에 비례한 반복 상한 (긴 셔틀 체인 등도 한 틱에 수렴)
  const dynamicCount =
    doc.components.filter((c) => {
      const role = getComponentDefinition(c.type).behavior?.role;
      return (
        role === "shuttle" ||
        role === "two-pressure" ||
        role === "quick-exhaust" ||
        role === "pilot-check" ||
        role === "pressure-pilot-valve"
      );
    }).length + loadCylinders.length;
  const maxIter = Math.max(4, dynamicCount + 2);
  let converged = false;

  for (let iter = 0; iter < maxIter; iter++) {
    const edges = [...staticEdges];
    const dynExhaustNets = new Set(exhaustNets);
    /** 이번 반복의 압력 조작 밸브 개폐 (Phase 15) */
    const pressureValveOpenNow = new Map<string, boolean>();

    for (const comp of doc.components) {
      const behavior = getComponentDefinition(comp.type).behavior;
      if (!behavior) continue;
      const stateOf = (pid: string) => portStatePrev.get(portKey(comp.id, pid)) ?? "blocked";

      if (behavior.role === "shuttle") {
        // 가압된 입력만 출력과 연결 — 비활성 입력은 볼이 막으므로 역급기 금지 (codex-review 셔틀 결함)
        const aOn = stateOf(behavior.inA) === "pressurized";
        const bOn = stateOf(behavior.inB) === "pressurized";
        if (aOn && bOn) {
          // 양측 가압: 볼은 한쪽에 앉는다 — 높은 압력 입력이 출력을 지배, 동률이면 inA (review-2 P1)
          const levelA = portLevelPrev.get(portKey(comp.id, behavior.inA)) ?? 0;
          const levelB = portLevelPrev.get(portKey(comp.id, behavior.inB)) ?? 0;
          const winner = levelB > levelA ? behavior.inB : behavior.inA;
          edges.push({ a: net(comp.id, winner), b: net(comp.id, behavior.out), factorAB: 1, factorBA: 1 });
        } else if (aOn) {
          edges.push({ a: net(comp.id, behavior.inA), b: net(comp.id, behavior.out), factorAB: 1, factorBA: 1 });
        } else if (bOn) {
          edges.push({ a: net(comp.id, behavior.inB), b: net(comp.id, behavior.out), factorAB: 1, factorBA: 1 });
        } else {
          // 두 입력 모두 무압: 출력이 갇히지 않도록 출력→입력 방향으로만 배기 허용
          edges.push({ a: net(comp.id, behavior.out), b: net(comp.id, behavior.inA), factorAB: 1, factorBA: 0 });
          edges.push({ a: net(comp.id, behavior.out), b: net(comp.id, behavior.inB), factorAB: 1, factorBA: 0 });
        }
      } else if (behavior.role === "two-pressure") {
        const bothOn = stateOf(behavior.inA) === "pressurized" && stateOf(behavior.inB) === "pressurized";
        if (bothOn) {
          // 두 입력 중 낮은 압력이 출력을 지배 (codex-review 2압밸브 레벨 결함)
          const levelA = portLevelPrev.get(portKey(comp.id, behavior.inA)) ?? 0;
          const levelB = portLevelPrev.get(portKey(comp.id, behavior.inB)) ?? 0;
          const lowIn = levelB < levelA ? behavior.inB : behavior.inA;
          edges.push({ a: net(comp.id, lowIn), b: net(comp.id, behavior.out), factorAB: 1, factorBA: 1 });
        } else {
          // 한쪽 이상 무압 — 출력은 무압 입력측으로 연결 (배기 허용)
          const openIn = stateOf(behavior.inA) !== "pressurized" ? behavior.inA : behavior.inB;
          edges.push({ a: net(comp.id, openIn), b: net(comp.id, behavior.out), factorAB: 1, factorBA: 1 });
        }
      } else if (behavior.role === "pilot-check") {
        const pilotOn = stateOf(behavior.pilotPort) === "pressurized";
        edges.push({
          a: net(comp.id, behavior.portA),
          b: net(comp.id, behavior.portB),
          factorAB: 1,
          factorBA: pilotOn ? 1 : 0,
        });
      } else if (behavior.role === "pressure-pilot-valve") {
        // 파일럿 압력이 설정압 이상이면 개방. 한번 열리면 파일럿이 무압이 될 때까지
        // 유지한다 (히스테리시스 — 부하압 캡과의 개폐 채터 방지, Phase 15)
        const pilotPid = behavior.pilotPort ?? behavior.portIn;
        const pilotKey = portKey(comp.id, pilotPid);
        const pilotOn = (portStatePrev.get(pilotKey) ?? "blocked") === "pressurized";
        const pilotLevel = portLevelPrev.get(pilotKey) ?? 0;
        const setpoint = Number(comp.properties.pressure ?? 30);
        const latched = runtimes.get(comp.id)?.pressureValveOpen === true;
        const open = pilotOn && (pilotLevel >= setpoint || latched);
        pressureValveOpenNow.set(comp.id, open);
        edges.push({
          a: net(comp.id, behavior.portIn),
          b: net(comp.id, behavior.portOut),
          factorAB: open ? 1 : 0,
          factorBA: behavior.checkBypass ? 1 : 0,
        });
      } else if (behavior.role === "quick-exhaust") {
        if (stateOf(behavior.inP) === "pressurized") {
          edges.push({ a: net(comp.id, behavior.inP), b: net(comp.id, behavior.outA), factorAB: 1, factorBA: 1 });
        } else {
          edges.push({ a: net(comp.id, behavior.outA), b: net(comp.id, behavior.exhaustR), factorAB: 1, factorBA: 1 });
          if (!wiredPorts.has(portKey(comp.id, behavior.exhaustR)))
            dynExhaustNets.add(net(comp.id, behavior.exhaustR));
        }
      }
    }

    // 가압 전파 (max-min 계수 완화)
    const supply = new Array<number>(netCount).fill(0);
    for (const n of sourceNets) supply[n] = 1;
    relax(supply, edges);

    // 배기(탱크 개방) 전파 — 흐름 방향을 따라 배기 터미널까지 열린 유로 전체를 계산.
    // 공급이 함께 닿은 넷은 관통 유로(언로딩)로 분류된다 (review-2: 오픈/탠덤 센터 무부하)
    const exhaust = new Array<number>(netCount).fill(0);
    for (const n of dynExhaustNets) exhaust[n] = 1;
    relaxExhaust(exhaust, edges);

    /**
     * 언로딩(관통 유로) 넷 — 공급과 탱크 개방이 동시에 닿아 압력이 서지 않는 구간.
     * 결과 조립에서 "배기 0bar"로 보고되는 넷이므로, **레벨 전파에서도 같게 취급**한다
     * (Phase 17). 이 판정을 레벨 전파 뒤에 두면 무부하 펌프의 만압이 체크밸브·감압밸브
     * 너머 하류로 새어, 같은 회로에서 포트는 0bar인데 압력계는 만압인 모순이 생긴다.
     */
    const unloaded = new Array<boolean>(netCount);
    for (let n = 0; n < netCount; n++) unloaded[n] = exhaust[n] > 0 && supply[n] > 0;

    // 압력 레벨 전파 (경로상 최소 캡, 준정량). 언로딩 넷은 시딩에서 제외되고
    // 전파 경로로도 쓰이지 않는다 — 압력이 서지 않는 구간은 하류를 밀어낼 수 없다.
    const level = new Array<number>(netCount).fill(0);
    for (const [n, lv] of sourceLevels) if (!unloaded[n]) level[n] = lv;
    relaxLevel(level, edges, unloaded);

    /**
     * 어큐뮬레이터 충전/방전 판정 (Phase 15, 기준 정정 Phase 17).
     * 어큐뮬레이터를 뺀 **실제 압력원만으로 레벨을 다시 전파**한다. 원시 가압 전파로
     * 판정하면 무부하로 도는 펌프까지 "공급 중"으로 읽혀 방전이 시작되지 않는다.
     */
    let levelExternal: number[] | null = null;
    if (accumulators.length > 0) {
      const supplyExt = new Array<number>(netCount).fill(0);
      for (const n of realSourceNets) supplyExt[n] = 1;
      relax(supplyExt, edges);
      const unloadedExt = new Array<boolean>(netCount);
      for (let n = 0; n < netCount; n++) unloadedExt[n] = exhaust[n] > 0 && supplyExt[n] > 0;
      levelExternal = new Array<number>(netCount).fill(0);
      for (const [n, lv] of sourceLevels) {
        if (realSourceNets.has(n) && !unloadedExt[n]) levelExternal[n] = lv;
      }
      relaxLevel(levelExternal, edges, unloadedExt);
    }
    /** cap 적용 전 레벨 — 릴리프의 "초과분 존재" 판정용 */
    const preCapLevel = [...level];

    // 부하압 캡 (Phase 15): 실제로 움직일 수 있는 실린더는 유량을 소비하므로
    // 공급 유로 전체가 부하압까지 낮아진다. 행정 끝이거나 반대편이 갇혀(클로즈드
    // 센터 등) 움직이지 못하면 캡이 없어 소스 압력까지 상승한다.
    // 릴리프 캡보다 먼저 적용해, 실린더 운동 중에는 릴리프가 열리지 않도록 한다.
    for (const lc of loadCylinders) {
      const pos = runtimes.get(lc.compId)?.cylinderPos ?? 0;
      const stateAt = (pid: string) => portStatePrev.get(portKey(lc.compId, pid)) ?? "blocked";
      const head = stateAt(lc.headPort);
      const rod = lc.rodPort ? stateAt(lc.rodPort) : undefined;
      let capNet: number | null = null;
      if (rod === undefined) {
        // 단동: 가압되면 전진, 배기되면 스프링 복귀 (복귀는 공급 유로가 없음)
        if (head === "pressurized" && pos < 1 - STROKE_EPS) capNet = lc.netHead;
      } else if (head === "pressurized" && rod === "exhausted" && pos < 1 - STROKE_EPS) {
        capNet = lc.netHead;
      } else if (rod === "pressurized" && head === "exhausted" && pos > STROKE_EPS) {
        capNet = lc.netRod ?? null;
      }
      if (capNet === null) continue;
      for (const n of connectedRegion(capNet, netCount, edges)) {
        level[n] = Math.min(level[n], lc.load);
      }
    }

    // 릴리프 밸브: 탱크 경로가 살아 있고 라인이 설정압을 넘으면
    // 압력 포트가 속한 유로(간선으로 이어진 영역) 전체의 레벨을 설정값으로 제한 (H6)
    // 1단계: 모든 릴리프의 cap을 먼저 적용 (다중 릴리프는 낮은 설정압이 최종 상한)
    for (const relief of reliefs) {
      const tankOk = exhaust[relief.netT] > 0;
      if (!tankOk || level[relief.netP] <= relief.setpoint) continue;
      for (const n of connectedRegion(relief.netP, netCount, edges)) {
        level[n] = Math.min(level[n], relief.setpoint);
      }
    }
    // 2단계: 활성 판정은 모든 cap·언로딩 이후의 최종 상태 기준 (codex-review-3 P0):
    // 방출이 실제로 일어나려면 (1) 탱크 경로 존재, (2) P 라인이 언로딩(관통 배기)이 아니고
    // (3) 최종 레벨이 설정압에 도달해 있으며 그 상한이 자신에 의한 것(설정압 초과분 방출)이어야 한다.
    // 정확히 설정압과 같은 공급(초과분 없음)이나 더 낮은 설정압 밸브가 잡은 라인에서는 열리지 않는다.
    const reliefActive = new Map<string, boolean>();
    for (const relief of reliefs) {
      const tankOk = exhaust[relief.netT] > 0;
      const unloadedP = exhaust[relief.netP] > 0 && supply[relief.netP] > 0;
      // 초과분 존재: cap 전 레벨이 설정압을 "초과" (같으면 방출 없음) +
      // 최종 레벨이 설정압까지 잡혀 있음 (더 낮은 설정압 밸브가 잡은 라인이면 미달 → 비활성)
      const active =
        tankOk &&
        !unloadedP &&
        supply[relief.netP] > 0 &&
        preCapLevel[relief.netP] > relief.setpoint &&
        level[relief.netP] >= relief.setpoint;
      reliefActive.set(relief.compId, active);
    }

    // 결과 조립 — 공급과 탱크 개방 유로가 동시에 닿은 넷은 관통(언로딩) 상태:
    // 오픈/탠덤 센터의 펌프 무부하와 실린더 자유 상태를 표현한다
    const portState = new Map<string, PressureState>();
    const supplyFactor = new Map<string, number>();
    const exhaustFactor = new Map<string, number>();
    const supplyLevel = new Map<string, number>();
    for (const k of allPortKeys) {
      const n = netOfPort.get(k)!;
      // 언로딩 구간을 거쳐 온 공급은 압력이 서지 않으므로 유효한 가압이 아니다.
      // (레벨 전파가 언로딩 넷에서 끊기므로 level=0으로 나타난다 — Phase 17)
      const pressurized = !unloaded[n] && supply[n] > 0 && level[n] > 0;
      const st: PressureState = unloaded[n]
        ? "exhausted"
        : pressurized
          ? "pressurized"
          : exhaust[n] > 0
            ? "exhausted"
            : "blocked";
      portState.set(k, st);
      supplyFactor.set(k, pressurized ? supply[n] : 0);
      exhaustFactor.set(k, exhaust[n]);
      supplyLevel.set(k, pressurized ? level[n] : 0);
    }
    const wireState = new Map<string, PressureState>();
    for (const wire of doc.wires) {
      if (wire.kind === "electric") continue;
      wireState.set(wire.id, portState.get(portKey(wire.from.componentId, wire.from.portId)) ?? "blocked");
    }
    const accumulatorSupplied = new Map<string, boolean>();
    for (const acc of accumulators) {
      accumulatorSupplied.set(acc.compId, (levelExternal?.[acc.net] ?? 0) > 0);
    }
    result = {
      portState,
      supplyFactor,
      exhaustFactor,
      supplyLevel,
      wireState,
      reliefActive,
      pressureValveOpen: pressureValveOpenNow,
      accumulatorSupplied,
    };

    // 고정점 검사 (상태 + 레벨)
    let changed = false;
    for (const k of allPortKeys) {
      if (
        (portStatePrev.get(k) ?? "blocked") !== portState.get(k) ||
        (portLevelPrev.get(k) ?? 0) !== supplyLevel.get(k)
      ) {
        changed = true;
        break;
      }
    }
    portStatePrev = portState;
    portLevelPrev = supplyLevel;
    if (!changed) {
      converged = true;
      break;
    }
  }

  result!.converged = converged;
  return result!;
}

/** 시작 넷에서 흐름 가능한 간선(계수>0)으로 이어진 유로 영역 (릴리프 상한 적용 범위) */
function connectedRegion(start: number, netCount: number, edges: Edge[]): Set<number> {
  const seen = new Set<number>([start]);
  const queue = [start];
  void netCount;
  while (queue.length > 0) {
    const n = queue.pop()!;
    for (const e of edges) {
      if (e.a === n && e.factorAB > 0 && !seen.has(e.b)) {
        seen.add(e.b);
        queue.push(e.b);
      }
      if (e.b === n && e.factorBA > 0 && !seen.has(e.a)) {
        seen.add(e.a);
        queue.push(e.a);
      }
    }
  }
  return seen;
}

/** 행정 끝 판정 허용 오차 (부하압 캡 — 끝에 닿으면 압력이 소스까지 상승) */
const STROKE_EPS = 1e-6;

function clamp01(v: number, min = 0): number {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(1, v));
}

/** supply[n] = max over 인접 (min(supply[nb], 간선 계수)) — 안정될 때까지 완화 */
function relax(values: number[], edges: Edge[]): void {
  for (let i = 0; i < values.length + 1; i++) {
    let changed = false;
    for (const e of edges) {
      const viaAB = Math.min(values[e.a], e.factorAB);
      if (viaAB > values[e.b]) {
        values[e.b] = viaAB;
        changed = true;
      }
      const viaBA = Math.min(values[e.b], e.factorBA);
      if (viaBA > values[e.a]) {
        values[e.a] = viaBA;
        changed = true;
      }
    }
    if (!changed) return;
  }
}

/**
 * 압력 레벨 완화: level[n] = max over 인접 (min(level[nb], 간선 레벨 캡)).
 * 계수 0 간선은 통과 불가. `blocked[n]`(언로딩 넷)은 레벨을 받지도 전달하지도 않는다
 * — 관통 배기로 압력이 서지 않는 구간은 하류를 밀어낼 수 없다 (Phase 17).
 */
function relaxLevel(levels: number[], edges: Edge[], blocked: boolean[]): void {
  for (let i = 0; i < levels.length + 1; i++) {
    let changed = false;
    for (const e of edges) {
      if (e.factorAB > 0 && !blocked[e.a] && !blocked[e.b]) {
        const via = Math.min(levels[e.a], e.levelCapAB ?? Infinity);
        if (via > levels[e.b]) {
          levels[e.b] = via;
          changed = true;
        }
      }
      if (e.factorBA > 0 && !blocked[e.a] && !blocked[e.b]) {
        const via = Math.min(levels[e.b], e.levelCapBA ?? Infinity);
        if (via > levels[e.a]) {
          levels[e.a] = via;
          changed = true;
        }
      }
    }
    if (!changed) return;
  }
}

/**
 * 배기(탱크 개방) 완화: 배기 흐름은 노드→배기터미널 방향이므로
 * 간선 계수는 전파 방향의 역방향 계수를 사용한다.
 * 가압 넷도 유로가 열려 있으면 탱크 개방으로 계산되며,
 * 공급∧배기 동시 도달 넷은 결과 조립 단계에서 언로딩으로 분류된다.
 */
function relaxExhaust(values: number[], edges: Edge[]): void {
  for (let i = 0; i < values.length + 1; i++) {
    let changed = false;
    for (const e of edges) {
      // b가 배기에 닿아 있으면 a도 배기 가능 (흐름 a→b: factorAB)
      {
        const via = Math.min(values[e.b], e.factorAB);
        if (via > values[e.a]) {
          values[e.a] = via;
          changed = true;
        }
      }
      {
        const via = Math.min(values[e.a], e.factorBA);
        if (via > values[e.b]) {
          values[e.b] = via;
          changed = true;
        }
      }
    }
    if (!changed) return;
  }
}
