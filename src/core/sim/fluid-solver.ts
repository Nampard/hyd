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
        break;
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
      case "motor": // 실린더처럼 두 포트를 소비 단자로 취급 (가압/배출 조합이 회전 방향)
      case "cylinder":
      case "shuttle":
      case "two-pressure":
      case "pilot-check":
        break;
      case "elec-supply":
      case "elec-contact":
      case "elec-load":
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

  for (let iter = 0; iter < 4; iter++) {
    const edges = [...staticEdges];
    const dynExhaustNets = new Set(exhaustNets);

    for (const comp of doc.components) {
      const behavior = getComponentDefinition(comp.type).behavior;
      if (!behavior) continue;
      const stateOf = (pid: string) => portStatePrev.get(portKey(comp.id, pid)) ?? "blocked";

      if (behavior.role === "shuttle") {
        // 가압된 입력만 출력과 연결 — 비활성 입력은 볼이 막으므로 역급기 금지 (codex-review 셔틀 결함)
        const aOn = stateOf(behavior.inA) === "pressurized";
        const bOn = stateOf(behavior.inB) === "pressurized";
        if (aOn)
          edges.push({ a: net(comp.id, behavior.inA), b: net(comp.id, behavior.out), factorAB: 1, factorBA: 1 });
        if (bOn)
          edges.push({ a: net(comp.id, behavior.inB), b: net(comp.id, behavior.out), factorAB: 1, factorBA: 1 });
        if (!aOn && !bOn) {
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

    // 배기 전파 — 터미널 넷은 공급이 닿아도 대기/탱크 개방(언로딩)이므로 항상 시드.
    // 단, 가압 넷을 "통과"하는 확산은 여전히 금지된다 (relaxExhaust 가드).
    const exhaust = new Array<number>(netCount).fill(0);
    for (const n of dynExhaustNets) exhaust[n] = 1;
    relaxExhaust(exhaust, edges, supply);

    // 압력 레벨 전파 (경로상 최소 캡, 준정량)
    const level = new Array<number>(netCount).fill(0);
    for (const [n, lv] of sourceLevels) level[n] = lv;
    relaxLevel(level, edges);

    // 릴리프 밸브: 탱크 경로가 살아 있고 라인이 설정압을 넘으면
    // 압력 포트가 속한 유로(간선으로 이어진 영역) 전체의 레벨을 설정값으로 제한 (H6)
    for (const relief of reliefs) {
      const tankOk = exhaust[relief.netT] > 0;
      if (!tankOk || level[relief.netP] <= relief.setpoint) continue;
      for (const n of connectedRegion(relief.netP, netCount, edges)) {
        level[n] = Math.min(level[n], relief.setpoint);
      }
    }

    // 결과 조립 — 배기 터미널을 포함한 넷은 공급이 닿아도 언로딩 상태(탱크 귀환)로 본다
    const portState = new Map<string, PressureState>();
    const supplyFactor = new Map<string, number>();
    const exhaustFactor = new Map<string, number>();
    const supplyLevel = new Map<string, number>();
    for (const k of allPortKeys) {
      const n = netOfPort.get(k)!;
      const unloaded = dynExhaustNets.has(n);
      const st: PressureState = unloaded
        ? "exhausted"
        : supply[n] > 0
          ? "pressurized"
          : exhaust[n] > 0
            ? "exhausted"
            : "blocked";
      portState.set(k, st);
      supplyFactor.set(k, unloaded ? 0 : supply[n]);
      exhaustFactor.set(k, unloaded ? 1 : exhaust[n]);
      supplyLevel.set(k, !unloaded && supply[n] > 0 ? level[n] : 0);
    }
    const wireState = new Map<string, PressureState>();
    for (const wire of doc.wires) {
      if (wire.kind === "electric") continue;
      wireState.set(wire.id, portState.get(portKey(wire.from.componentId, wire.from.portId)) ?? "blocked");
    }
    result = { portState, supplyFactor, exhaustFactor, supplyLevel, wireState };

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
    if (!changed) break;
  }

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

/** 압력 레벨 완화: level[n] = max over 인접 (min(level[nb], 간선 레벨 캡)). 계수 0 간선은 통과 불가 */
function relaxLevel(levels: number[], edges: Edge[]): void {
  for (let i = 0; i < levels.length + 1; i++) {
    let changed = false;
    for (const e of edges) {
      if (e.factorAB > 0) {
        const via = Math.min(levels[e.a], e.levelCapAB ?? Infinity);
        if (via > levels[e.b]) {
          levels[e.b] = via;
          changed = true;
        }
      }
      if (e.factorBA > 0) {
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
 * 배기 완화: 배기 흐름은 노드→배기터미널 방향이므로 간선 계수는 전파 방향의 역방향 계수 사용.
 * 가압 넷(supply>0)은 배기 경로로 쓰지 않는다.
 */
function relaxExhaust(values: number[], edges: Edge[], supply: number[]): void {
  for (let i = 0; i < values.length + 1; i++) {
    let changed = false;
    for (const e of edges) {
      // b가 배기에 닿아 있으면 a도 배기 가능 (흐름 a→b: factorAB)
      if (supply[e.a] === 0) {
        const via = Math.min(values[e.b], e.factorAB);
        if (via > values[e.a]) {
          values[e.a] = via;
          changed = true;
        }
      }
      if (supply[e.b] === 0) {
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
