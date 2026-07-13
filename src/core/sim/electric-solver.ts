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

  return { energized, wireHot, portHot };
}
