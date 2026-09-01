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
 * 리밋 스위치 부착 위치 (Phase 16-5). 실린더 스프라이트 로컬 좌표 기준.
 * CylinderSprite의 로드 캠은 x=48(후진단)~88(전진단)을 왕복하고,
 * LimitSwitchSprite의 롤러는 본체 기준 (-25, -15)에 있다(눌리면 아래로 내려감).
 * 따라서 캠 x + 25에 본체를 두면 롤러가 캠 바로 아래에서 만난다.
 */
const LIMIT_SWITCH_MOUNT: Record<"retracted" | "extended", Point> = {
  retracted: { x: 73, y: 18 },
  extended: { x: 113, y: 18 },
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
  const label = String(comp.properties.cylinderLabel ?? "");
  if (!label) return null;
  const host = doc.components.find(
    (c) =>
      getComponentDefinition(c.type).behavior?.role === "cylinder" &&
      String(c.properties.label ?? "") === label,
  );
  if (!host) return null;
  const offset =
    comp.properties.triggerAt === "retracted"
      ? LIMIT_SWITCH_MOUNT.retracted
      : LIMIT_SWITCH_MOUNT.extended;
  return { host, offset };
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
