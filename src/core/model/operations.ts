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
 * 리밋 스위치 부착 위치 (Phase 16-5, 좌표 정정 Phase 19).
 * CylinderSprite의 로드 캠은 x=48(후진단)~88(전진단)을 왕복한다.
 * LimitSwitchSprite는 실기 도면처럼 몸체 아래로 플런저가 내려오므로(발 끝 y≈+28),
 * 캠 바로 **위쪽**에 본체를 두어 로드가 끝에 닿을 때 플런저를 누르게 한다.
 */
const LIMIT_SWITCH_MOUNT: Record<"retracted" | "extended", Point> = {
  retracted: { x: 48, y: -30 },
  extended: { x: 88, y: -30 },
};

/**
 * 장비 뷰에서 다른 부품에 부착돼 위치가 계산되는 부품인지 판정한다 (Phase 16-5).
 * 리밋 스위치는 `cylinderLabel`이 가리키는 실린더의 `triggerAt` 끝단에 붙는다 —
 * 실기 장비처럼 "어느 실린더의 어느 끝을 감지하는지"가 그림에서 보이도록.
 * 대상 실린더를 찾지 못하면 null을 돌려 기존 자유 배치로 폴백한다.
 */
export function getEquipmentAttachment(
  doc: CircuitDocument,
  comp: ComponentInstance,
): { host: ComponentInstance; offset: Point } | null {
  const behavior = getComponentDefinition(comp.type).behavior;
  if (behavior?.role !== "elec-contact" || behavior.source !== "limit") return null;
  const host = findCylinderByLabel(doc, String(comp.properties.cylinderLabel ?? ""));
  if (!host) return null;
  const offset =
    comp.properties.triggerAt === "retracted"
      ? LIMIT_SWITCH_MOUNT.retracted
      : LIMIT_SWITCH_MOUNT.extended;
  return { host, offset };
}

/** 이름표로 실린더를 찾는다 (리밋 스위치·롤러 밸브의 감지 대상 매칭) */
function findCylinderByLabel(doc: CircuitDocument, label: string): ComponentInstance | undefined {
  if (!label) return undefined;
  return doc.components.find(
    (c) =>
      getComponentDefinition(c.type).behavior?.role === "cylinder" &&
      String(c.properties.label ?? "") === label,
  );
}

/**
 * 회로도에 덧그릴 리밋 스위치 장치 표시 위치 (Phase 19-3).
 * 실기 도면은 회로도에서도 실린더 위에 리밋 스위치 몸체를 그려 "어디에 달렸는지"를
 * 보여준다. 회로도 실린더 기호의 로드 끝은 후진 x=44 · 전진 x=84이므로 그 위에 둔다.
 */
const SCHEMATIC_LIMIT_MARKER: Record<"retracted" | "extended", Point> = {
  retracted: { x: 44, y: -42 },
  extended: { x: 84, y: -42 },
};

export interface LimitSwitchMarker {
  /** 리밋 스위치 부품 id — 런타임 상태(눌림) 조회용 */
  switchId: string;
  position: Point;
  rotation: Rotation;
  name: string;
  atRetracted: boolean;
  /** b접점 여부 — 눌림 상태를 접점 상태에서 되짚는 데 쓴다 */
  isNC: boolean;
}

/** 회로도용 리밋 스위치 장치 표시 목록 (감지 대상 실린더를 찾은 것만) */
export function getLimitSwitchMarkers(doc: CircuitDocument): LimitSwitchMarker[] {
  const markers: LimitSwitchMarker[] = [];
  for (const comp of doc.components) {
    const behavior = getComponentDefinition(comp.type).behavior;
    if (behavior?.role !== "elec-contact" || behavior.source !== "limit") continue;
    const host = findCylinderByLabel(doc, String(comp.properties.cylinderLabel ?? ""));
    if (!host) continue;
    const atRetracted = comp.properties.triggerAt === "retracted";
    const offset = atRetracted
      ? SCHEMATIC_LIMIT_MARKER.retracted
      : SCHEMATIC_LIMIT_MARKER.extended;
    markers.push({
      switchId: comp.id,
      position: addPoints(host.position, rotatePoint(offset, host.rotation)),
      rotation: host.rotation,
      name: String(comp.properties.name ?? ""),
      atRetracted,
      isNC: comp.properties.contactType === "NC",
    });
  }
  return markers;
}

export function getEquipmentPosition(doc: CircuitDocument, comp: ComponentInstance): Point {
  const attachment = getEquipmentAttachment(doc, comp);
  if (attachment) {
    const { host, offset } = attachment;
    const hostPos = doc.equipmentLayout?.[host.id] ?? host.position;
    return addPoints(hostPos, rotatePoint(offset, host.rotation));
  }
  return doc.equipmentLayout?.[comp.id] ?? comp.position;
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
