import type { CircuitDocument } from "../model/types";
import { getComponentDefinition } from "../library/registry";
import { portKey } from "./types";

/**
 * 전기 솔버 — 연결성 해석 (ARCHITECTURE 4.2).
 *
 * 1. 전기 배선으로 이어진 포트를 넷으로 병합
 * 2. 닫힌 접점 = 간선. 부하(코일·램프·솔레노이드)는 전류를 통과시키지 않는다
 * 3. 24V에서 도달 가능한 넷 집합(P), 0V에서 도달 가능한 넷 집합(N) 계산
 * 4. 부하의 양단이 각각 P와 N에 속하면 통전
 *
 * 접점 개폐는 호출자가 제공한다 (수동 입력·디바이스 출력·실린더 위치는 엔진 소관).
 */

export interface ElectricSolveResult {
  /** componentId → 부하 통전 여부 */
  energized: Map<string, boolean>;
  /** wireId → 활선(24V측) 여부 (배선 색상용) */
  wireHot: Map<string, boolean>;
  /**
   * wireId → 귀로 전류가 흐르는 배선인지 (통전 부하 → 0V). Phase 20.
   * 활선(wireHot)은 24V 전위만 보여 주므로 부하를 지난 전류가 0V로 돌아가는 길이
   * 보이지 않았다. 통전된 부하마다 0V까지의 최단 귀로를 표시한다.
   */
  wireReturn: Map<string, boolean>;
  /** portKey → 활선 여부 */
  portHot: Map<string, boolean>;
}

export function solveElectric(
  doc: CircuitDocument,
  isContactClosed: (componentId: string) => boolean,
): ElectricSolveResult {
  // --- 넷 구성 (union-find) ---
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
      if (port.kind !== "electric") continue;
      const k = portKey(comp.id, port.id);
      allPortKeys.push(k);
      parent.set(k, k);
    }
  }
  for (const wire of doc.wires) {
    if (wire.kind !== "electric") continue;
    union(portKey(wire.from.componentId, wire.from.portId), portKey(wire.to.componentId, wire.to.portId));
  }

  const netIndex = new Map<string, number>();
  const netOfPort = new Map<string, number>();
  for (const k of allPortKeys) {
    const root = find(k);
    if (!netIndex.has(root)) netIndex.set(root, netIndex.size);
    netOfPort.set(k, netIndex.get(root)!);
  }
  const netCount = netIndex.size;
  const net = (compId: string, pid: string) => netOfPort.get(portKey(compId, pid))!;

  // --- 간선(닫힌 접점)·터미널·부하 수집 ---
  const adj: number[][] = Array.from({ length: netCount }, () => []);
  const positive: number[] = [];
  const negative: number[] = [];
  const loads: { id: string; a: number; b: number }[] = [];

  for (const comp of doc.components) {
    const behavior = getComponentDefinition(comp.type).behavior;
    if (!behavior) continue;
    if (behavior.role === "elec-supply") {
      (behavior.polarity === "positive" ? positive : negative).push(net(comp.id, behavior.port));
    } else if (behavior.role === "elec-contact") {
      if (isContactClosed(comp.id)) {
        const a = net(comp.id, behavior.portA);
        const b = net(comp.id, behavior.portB);
        adj[a].push(b);
        adj[b].push(a);
      }
    } else if (behavior.role === "elec-load") {
      loads.push({ id: comp.id, a: net(comp.id, behavior.portA), b: net(comp.id, behavior.portB) });
    }
  }

  const reach = (starts: number[]): boolean[] => {
    const seen = new Array<boolean>(netCount).fill(false);
    const queue = [...starts];
    for (const s of starts) seen[s] = true;
    while (queue.length > 0) {
      const n = queue.pop()!;
      for (const m of adj[n]) {
        if (!seen[m]) {
          seen[m] = true;
          queue.push(m);
        }
      }
    }
    return seen;
  };

  const inP = reach(positive);
  const inN = reach(negative);

  const energized = new Map<string, boolean>();
  for (const load of loads) {
    energized.set(
      load.id,
      (inP[load.a] && inN[load.b]) || (inP[load.b] && inN[load.a]),
    );
  }

  const portHot = new Map<string, boolean>();
  for (const k of allPortKeys) {
    portHot.set(k, inP[netOfPort.get(k)!]);
  }
  const wireHot = new Map<string, boolean>();
  for (const wire of doc.wires) {
    if (wire.kind !== "electric") continue;
    wireHot.set(wire.id, portHot.get(portKey(wire.from.componentId, wire.from.portId)) ?? false);
  }

  const wireReturn = traceReturnPaths(doc, isContactClosed, netOfPort, inP, inN, energized);

  return { energized, wireHot, wireReturn, portHot };
}

/**
 * 귀로 전류 경로 (Phase 20).
 *
 * 0V 측 넷(0V에서 도달 가능하고 24V에서는 도달 불가)의 **포트 그래프**에서, 0V 단자로부터
 * 다중 시작 BFS 트리를 만든 뒤 통전된 부하의 0V 측 단자마다 부모를 거슬러 올라가며
 * 지나는 배선을 표시한다. 넷 단위로 칠하면 0V 모선 전체가 늘 칠해져 "어느 부하의
 * 전류인지"가 보이지 않으므로, 실제로 전류가 지나는 배선만 고른다.
 */
function traceReturnPaths(
  doc: CircuitDocument,
  isContactClosed: (componentId: string) => boolean,
  netOfPort: Map<string, number>,
  inP: boolean[],
  inN: boolean[],
  energized: Map<string, boolean>,
): Map<string, boolean> {
  const wireReturn = new Map<string, boolean>();
  for (const wire of doc.wires) if (wire.kind === "electric") wireReturn.set(wire.id, false);

  const returnSide = (k: string): boolean => {
    const n = netOfPort.get(k);
    return n !== undefined && inN[n] && !inP[n];
  };

  // 포트 그래프: 배선(간선에 wireId) + 닫힌 접점 내부 연결(wireId 없음)
  const adj = new Map<string, { to: string; wireId?: string }[]>();
  const link = (a: string, b: string, wireId?: string) => {
    if (!returnSide(a) || !returnSide(b)) return;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, wireId });
    adj.get(b)!.push({ to: a, wireId });
  };
  for (const wire of doc.wires) {
    if (wire.kind !== "electric") continue;
    link(
      portKey(wire.from.componentId, wire.from.portId),
      portKey(wire.to.componentId, wire.to.portId),
      wire.id,
    );
  }

  const sources: string[] = [];
  const targets: string[] = [];
  for (const comp of doc.components) {
    const behavior = getComponentDefinition(comp.type).behavior;
    if (!behavior) continue;
    if (behavior.role === "elec-supply" && behavior.polarity === "negative") {
      sources.push(portKey(comp.id, behavior.port));
    } else if (behavior.role === "elec-contact" && isContactClosed(comp.id)) {
      link(portKey(comp.id, behavior.portA), portKey(comp.id, behavior.portB));
    } else if (behavior.role === "elec-load" && energized.get(comp.id)) {
      for (const pid of [behavior.portA, behavior.portB]) {
        const k = portKey(comp.id, pid);
        if (returnSide(k)) targets.push(k);
      }
    }
  }
  if (targets.length === 0) return wireReturn;

  // 0V 단자들에서 시작하는 BFS 트리 — 각 포트가 0V 쪽으로 어느 간선을 타고 가는지
  const parent = new Map<string, { from: string; wireId?: string } | null>();
  const queue: string[] = [];
  for (const s of sources) {
    if (!parent.has(s)) {
      parent.set(s, null);
      queue.push(s);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    for (const edge of adj.get(node) ?? []) {
      if (parent.has(edge.to)) continue;
      parent.set(edge.to, { from: node, wireId: edge.wireId });
      queue.push(edge.to);
    }
  }

  for (const target of targets) {
    let node: string | undefined = target;
    while (node !== undefined) {
      const step = parent.get(node);
      if (!step) break; // 0V 단자에 도달했거나 트리 밖
      if (step.wireId) wireReturn.set(step.wireId, true);
      node = step.from;
    }
  }
  return wireReturn;
}
