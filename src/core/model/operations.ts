import type {
  CircuitDocument,
  ComponentInstance,
  Point,
  PortRef,
  Rotation,
  Wire,
} from "./types";
import { generateId } from "./types";
import { getComponentDefinition } from "../library/registry";
import { defaultProperties, type PortDefinition } from "../library/types";
import { addPoints, rotatePoint, rotateDirection, snapPoint, type Direction } from "../geometry";
import { computeOrthogonalRoute } from "../routing";

/**
 * 문서 변경 함수들. 모두 불변 — 새 문서를 반환한다 (undo 스냅숏 전제).
 * 유효하지 않은 조작은 예외 대신 원본 문서를 그대로 반환하고,
 * 사용자 피드백이 필요한 검증은 사전 검사 함수(canConnect 등)로 제공한다.
 */

export function addComponent(
  doc: CircuitDocument,
  type: string,
  position: Point,
): { doc: CircuitDocument; component: ComponentInstance } {
  const def = getComponentDefinition(type);
  const component: ComponentInstance = {
    id: generateId("c"),
    type,
    position: snapPoint(position),
    rotation: 0,
    properties: defaultProperties(def),
  };
  return { doc: { ...doc, components: [...doc.components, component] }, component };
}

/**
 * 부품 복제 (Phase 16-3). 타입·회전·속성을 그대로 옮기고 새 id와 위치를 부여한다.
 * 배선은 복제하지 않는다 — 어느 포트로 이어야 할지는 회로마다 다르므로 사용자가 잇는다.
 */
export function duplicateComponent(
  doc: CircuitDocument,
  source: ComponentInstance,
  position: Point,
): { doc: CircuitDocument; component: ComponentInstance } {
  const component: ComponentInstance = {
    id: generateId("c"),
    type: source.type,
    position: snapPoint(position),
    rotation: source.rotation,
    properties: { ...source.properties },
  };
  return { doc: { ...doc, components: [...doc.components, component] }, component };
}

/** 복사·붙여넣기 스냅숏 (Phase 18) — 부품들과 그 사이의 내부 배선 */
export interface ComponentGroup {
  components: ComponentInstance[];
  wires: Wire[];
}

/**
 * 선택된 부품들과 **양끝이 모두 선택 안에 있는 배선**만 스냅숏으로 뽑는다 (Phase 18).
 * 한쪽 끝이 선택 밖인 배선을 함께 복사하면 붙여넣은 사본이 원본 회로에 끼어들어
 * 의도치 않은 연결을 만든다.
 */
export function extractGroup(doc: CircuitDocument, componentIds: string[]): ComponentGroup {
  const ids = new Set(componentIds);
  const components = doc.components
    .filter((c) => ids.has(c.id))
    .map((c) => ({ ...c, properties: { ...c.properties } }));
  const wires = doc.wires.filter(
    (w) => ids.has(w.from.componentId) && ids.has(w.to.componentId),
  );
  return { components, wires };
}

/**
 * 스냅숏을 offset만큼 옮겨 붙여넣는다 (Phase 18). 부품은 새 id를 받고,
 * 내부 배선은 새 id로 다시 이어 붙이며 경로를 재계산한다.
 */
export function pasteGroup(
  doc: CircuitDocument,
  group: ComponentGroup,
  offset: Point,
): { doc: CircuitDocument; componentIds: string[] } {
  const idMap = new Map<string, string>();
  let next = doc;
  const componentIds: string[] = [];
  for (const source of group.components) {
    const result = duplicateComponent(next, source, {
      x: source.position.x + offset.x,
      y: source.position.y + offset.y,
    });
    next = result.doc;
    idMap.set(source.id, result.component.id);
    componentIds.push(result.component.id);
  }
  for (const wire of group.wires) {
    const fromId = idMap.get(wire.from.componentId);
    const toId = idMap.get(wire.to.componentId);
    if (!fromId || !toId) continue;
    next = autoWire(
      next,
      { componentId: fromId, portId: wire.from.portId },
      { componentId: toId, portId: wire.to.portId },
    );
  }
  return { doc: next, componentIds };
}

/** 부품의 월드 좌표 AABB (회전 반영) — 영역 선택 판정용 (Phase 18) */
export function getComponentWorldBounds(comp: ComponentInstance): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const b = getComponentDefinition(comp.type).bounds;
  const corners: Point[] = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x, y: b.y + b.height },
    { x: b.x + b.width, y: b.y + b.height },
  ].map((p) => addPoints(comp.position, rotatePoint(p, comp.rotation)));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** 사각 영역과 겹치는 부품 id 목록 (Phase 18 — 영역 선택) */
export function componentsInRect(
  doc: CircuitDocument,
  rect: { minX: number; minY: number; maxX: number; maxY: number },
): string[] {
  return doc.components
    .filter((c) => {
      const b = getComponentWorldBounds(c);
      return b.minX <= rect.maxX && b.maxX >= rect.minX && b.minY <= rect.maxY && b.maxY >= rect.minY;
    })
    .map((c) => c.id);
}

export function moveComponent(
  doc: CircuitDocument,
  componentId: string,
  position: Point,
): CircuitDocument {
  return {
    ...doc,
    components: doc.components.map((c) =>
      c.id === componentId ? { ...c, position: snapPoint(position) } : c,
    ),
  };
}

export function rotateComponent(doc: CircuitDocument, componentId: string): CircuitDocument {
  return {
    ...doc,
    components: doc.components.map((c) =>
      c.id === componentId ? { ...c, rotation: (((c.rotation + 90) % 360) as Rotation) } : c,
    ),
  };
}

/** 부품 삭제 시 연결된 배선·장비 배치·PLC 매핑도 함께 삭제 (codex-review M4) */
export function deleteComponent(doc: CircuitDocument, componentId: string): CircuitDocument {
  let equipmentLayout = doc.equipmentLayout;
  if (equipmentLayout && componentId in equipmentLayout) {
    equipmentLayout = { ...equipmentLayout };
    delete equipmentLayout[componentId];
  }
  const ioMap = doc.ioMap?.some((e) => e.componentId === componentId)
    ? doc.ioMap.filter((e) => e.componentId !== componentId)
    : doc.ioMap;
  return {
    ...doc,
    components: doc.components.filter((c) => c.id !== componentId),
    wires: doc.wires.filter(
      (w) => w.from.componentId !== componentId && w.to.componentId !== componentId,
    ),
    equipmentLayout,
    ioMap,
  };
}

/** 장비 뷰 자유 배치 좌표 설정 (그리드 스냅) */
export function moveEquipment(
  doc: CircuitDocument,
  componentId: string,
  position: Point,
): CircuitDocument {
  return {
    ...doc,
    equipmentLayout: { ...(doc.equipmentLayout ?? {}), [componentId]: snapPoint(position) },
  };
}

/** 부품의 장비 뷰 표시 좌표 (자유 배치 없으면 회로도 좌표) */
/**
 * 리밋 스위치 장치 표시 오프셋 (Phase 19-4).
 *
 * 실기 도면은 리밋 스위치를 **두 자리에 나눠** 그린다 — 전기 배선 자리(사다리)의 접점과,
 * 실린더 옆의 장치 몸체. 이전에는 장비 뷰에서 스위치 부품 자체를 실린더에 부착했는데,
 * 그러면 (1) 전기 배선이 패널에서 실린더까지 길게 가로지르고 (2) 같은 끝단을 감지하는
 * 스위치 여러 개가 한 점에 겹쳐 쌓여 화면이 뭉개졌다. 이제 부품은 제자리에 두고,
 * 실린더 옆에는 **표시 전용 장치 마커**만 덧그린다.
 *
 * 좌표 기준: 회로도 실린더 기호의 로드 끝은 후진 x=44 · 전진 x=84,
 * 장비 뷰 실린더 스프라이트의 로드 캠은 후진 x=48 · 전진 x=88을 왕복한다.
 */
const LIMIT_MARKER_SCHEMATIC: Record<"retracted" | "extended", Point> = {
  retracted: { x: 44, y: -42 },
  extended: { x: 84, y: -42 },
};
const LIMIT_MARKER_EQUIPMENT: Record<"retracted" | "extended", Point> = {
  retracted: { x: 48, y: -30 },
  extended: { x: 88, y: -30 },
};

export function getEquipmentPosition(doc: CircuitDocument, comp: ComponentInstance): Point {
  return doc.equipmentLayout?.[comp.id] ?? comp.position;
}

/** 이름표로 실린더를 찾는다 (리밋 스위치의 감지 대상 매칭) */
function findCylinderByLabel(doc: CircuitDocument, label: string): ComponentInstance | undefined {
  if (!label) return undefined;
  return doc.components.find(
    (c) =>
      getComponentDefinition(c.type).behavior?.role === "cylinder" &&
      String(c.properties.label ?? "") === label,
  );
}

export interface LimitSwitchMarker {
  /** 렌더 키 — 실린더 + 끝단 조합 */
  key: string;
  /** 이 자리를 공유하는 리밋 스위치 부품 id들 (같은 끝단을 여러 개가 감지할 수 있다) */
  switchIds: string[];
  /** 회로도 좌표 */
  position: Point;
  /** 장비 뷰 좌표 (실린더의 장비 배치를 따른다) */
  equipmentPosition: Point;
  rotation: Rotation;
  /** 표시할 이름 — 같은 자리에 여러 개면 쉼표로 잇는다 */
  names: string;
  atRetracted: boolean;
  /** 대표 스위치의 b접점 여부 — 접점 상태에서 눌림을 되짚는 데 쓴다 */
  isNC: boolean;
}

/**
 * 리밋 스위치 장치 표시 목록 (Phase 19-3, 그룹화 19-4).
 *
 * 감지 대상 실린더를 찾은 스위치만 대상이며, **같은 실린더의 같은 끝단**을 감지하는
 * 스위치들은 하나로 묶는다 — A+B+A−B− 예제처럼 같은 이름의 스위치가 여러 렁에 쓰이면
 * 마커가 한 점에 겹쳐 쌓이기 때문이다.
 */
export function getLimitSwitchMarkers(doc: CircuitDocument): LimitSwitchMarker[] {
  const groups = new Map<
    string,
    { host: ComponentInstance; atRetracted: boolean; ids: string[]; names: string[]; isNC: boolean }
  >();
  for (const comp of doc.components) {
    const behavior = getComponentDefinition(comp.type).behavior;
    if (behavior?.role !== "elec-contact" || behavior.source !== "limit") continue;
    const host = findCylinderByLabel(doc, String(comp.properties.cylinderLabel ?? ""));
    if (!host) continue;
    const atRetracted = comp.properties.triggerAt === "retracted";
    const key = `${host.id}:${atRetracted ? "retracted" : "extended"}`;
    let group = groups.get(key);
    if (!group) {
      group = { host, atRetracted, ids: [], names: [], isNC: comp.properties.contactType === "NC" };
      groups.set(key, group);
    }
    group.ids.push(comp.id);
    const name = String(comp.properties.name ?? "");
    if (name && !group.names.includes(name)) group.names.push(name);
  }

  return [...groups.entries()].map(([key, group]) => {
    const end = group.atRetracted ? "retracted" : "extended";
    const hostEquipment = doc.equipmentLayout?.[group.host.id] ?? group.host.position;
    return {
      key,
      switchIds: group.ids,
      position: addPoints(
        group.host.position,
        rotatePoint(LIMIT_MARKER_SCHEMATIC[end], group.host.rotation),
      ),
      equipmentPosition: addPoints(
        hostEquipment,
        rotatePoint(LIMIT_MARKER_EQUIPMENT[end], group.host.rotation),
      ),
      rotation: group.host.rotation,
      names: group.names.join(","),
      atRetracted: group.atRetracted,
      isNC: group.isNC,
    };
  });
}

export function deleteWire(doc: CircuitDocument, wireId: string): CircuitDocument {
  return { ...doc, wires: doc.wires.filter((w) => w.id !== wireId) };
}

export function updateComponentProperty(
  doc: CircuitDocument,
  componentId: string,
  key: string,
  value: unknown,
): CircuitDocument {
  return {
    ...doc,
    components: doc.components.map((c) =>
      c.id === componentId ? { ...c, properties: { ...c.properties, [key]: value } } : c,
    ),
  };
}

// --- 포트 조회 ---

export function getComponent(doc: CircuitDocument, componentId: string): ComponentInstance | undefined {
  return doc.components.find((c) => c.id === componentId);
}

export function getPortDefinition(component: ComponentInstance, portId: string): PortDefinition | undefined {
  return getComponentDefinition(component.type).ports.find((p) => p.id === portId);
}

/** 포트의 월드 좌표 (부품 위치 + 회전 적용) */
export function getPortWorldPosition(component: ComponentInstance, port: PortDefinition): Point {
  return addPoints(component.position, rotatePoint(port.offset, component.rotation));
}

/** 포트가 월드 기준으로 향하는 방향 */
export function getPortWorldDirection(component: ComponentInstance, port: PortDefinition): Direction {
  return rotateDirection(port.direction, component.rotation);
}

function portRefEquals(a: PortRef, b: PortRef): boolean {
  return a.componentId === b.componentId && a.portId === b.portId;
}

export function isPortWired(doc: CircuitDocument, ref: PortRef): boolean {
  return doc.wires.some((w) => portRefEquals(w.from, ref) || portRefEquals(w.to, ref));
}

// --- 배선 ---

export interface ConnectCheck {
  ok: boolean;
  reason?: string;
}

/** 두 포트를 연결할 수 있는지 사전 검사. UI가 거부 사유를 표시하는 데 사용. */
export function canConnect(doc: CircuitDocument, from: PortRef, to: PortRef): ConnectCheck {
  if (portRefEquals(from, to)) return { ok: false, reason: "같은 포트입니다." };

  const fromComp = getComponent(doc, from.componentId);
  const toComp = getComponent(doc, to.componentId);
  if (!fromComp || !toComp) return { ok: false, reason: "부품을 찾을 수 없습니다." };

  const fromPort = getPortDefinition(fromComp, from.portId);
  const toPort = getPortDefinition(toComp, to.portId);
  if (!fromPort || !toPort) return { ok: false, reason: "포트를 찾을 수 없습니다." };

  if (fromPort.kind !== toPort.kind) {
    return { ok: false, reason: "종류가 다른 포트는 연결할 수 없습니다 (공압관 ↔ 전기선)." };
  }

  // 유체 포트는 배관 1개만 허용 (분기는 T 분기 부품으로)
  if (fromPort.kind !== "electric") {
    if (isPortWired(doc, from)) return { ok: false, reason: "이미 배관이 연결된 포트입니다." };
    if (isPortWired(doc, to)) return { ok: false, reason: "이미 배관이 연결된 포트입니다." };
  }

  const duplicate = doc.wires.some(
    (w) =>
      (portRefEquals(w.from, from) && portRefEquals(w.to, to)) ||
      (portRefEquals(w.from, to) && portRefEquals(w.to, from)),
  );
  if (duplicate) return { ok: false, reason: "이미 연결되어 있습니다." };

  return { ok: true };
}

/** 배선 한 개의 경유점을 현재 포트 위치 기준으로 재계산 */
export function rerouteWire(doc: CircuitDocument, wire: Wire): Wire {
  const fromComp = getComponent(doc, wire.from.componentId);
  const toComp = getComponent(doc, wire.to.componentId);
  if (!fromComp || !toComp) return wire;
  const fromPort = getPortDefinition(fromComp, wire.from.portId);
  const toPort = getPortDefinition(toComp, wire.to.portId);
  if (!fromPort || !toPort) return wire;

  const waypoints = computeOrthogonalRoute(
    getPortWorldPosition(fromComp, fromPort),
    getPortWorldDirection(fromComp, fromPort),
    getPortWorldPosition(toComp, toPort),
    getPortWorldDirection(toComp, toPort),
  );
  return { ...wire, waypoints };
}

/** 부품 이동/회전 후 그 부품에 연결된 모든 배선을 재라우팅 */
export function rerouteAttachedWires(doc: CircuitDocument, componentId: string): CircuitDocument {
  return {
    ...doc,
    wires: doc.wires.map((w) =>
      w.from.componentId === componentId || w.to.componentId === componentId
        ? rerouteWire(doc, w)
        : w,
    ),
  };
}

/** 두 포트를 자동 직교 라우팅으로 연결. 연결 불가면 원본 문서 반환 */
export function autoWire(doc: CircuitDocument, from: PortRef, to: PortRef): CircuitDocument {
  const check = canConnect(doc, from, to);
  if (!check.ok) return doc;
  const fromComp = getComponent(doc, from.componentId)!;
  const toComp = getComponent(doc, to.componentId)!;
  const fromPort = getPortDefinition(fromComp, from.portId)!;
  const toPort = getPortDefinition(toComp, to.portId)!;
  const waypoints = computeOrthogonalRoute(
    getPortWorldPosition(fromComp, fromPort),
    getPortWorldDirection(fromComp, fromPort),
    getPortWorldPosition(toComp, toPort),
    getPortWorldDirection(toComp, toPort),
  );
  return addWire(doc, from, to, waypoints);
}

export function addWire(
  doc: CircuitDocument,
  from: PortRef,
  to: PortRef,
  waypoints: Point[],
): CircuitDocument {
  const check = canConnect(doc, from, to);
  if (!check.ok) return doc;

  const fromComp = getComponent(doc, from.componentId)!;
  const fromPort = getPortDefinition(fromComp, from.portId)!;

  const wire: Wire = {
    id: generateId("w"),
    kind: fromPort.kind,
    from,
    to,
    waypoints,
  };
  return { ...doc, wires: [...doc.wires, wire] };
}
