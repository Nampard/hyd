import type { CircuitDocument } from "../model/types";
import { getComponentDefinition } from "../library/registry";
import { isPortWired } from "../model/operations";

/**
 * 실행 전 검증 (PRD 5절). 경고만 반환 — 실행은 막지 않는다.
 */
export function validateForSimulation(doc: CircuitDocument): string[] {
  const warnings: string[] = [];

  const hasFluid = doc.components.some((c) =>
    getComponentDefinition(c.type).ports.some((p) => p.kind !== "electric"),
  );
  const hasSource = doc.components.some((c) => {
    const role = getComponentDefinition(c.type).behavior?.role;
    return role === "source" || role === "hydraulic-power-unit";
  });
  if (hasFluid && !hasSource) {
    warnings.push("동력원(공압원/유압 파워유닛)이 없습니다 — 어떤 배관도 가압되지 않습니다.");
  }

  const ioMapped = new Set((doc.ioMap ?? []).map((e) => e.componentId));

  // --- 교차 참조 검사 (이름표 오타의 조용한 실패 방지, codex-review) ---
  const cylinderLabels = new Set<string>();
  const deviceLabels = new Set<string>();
  const solenoidLabels = new Set<string>();
  for (const comp of doc.components) {
    const behavior = getComponentDefinition(comp.type).behavior;
    if (behavior?.role === "cylinder") {
      const label = String(comp.properties.label ?? "");
      if (label) cylinderLabels.add(label);
    }
    if (behavior?.role === "elec-load") {
      const label = String(comp.properties.label ?? "");
      if (!label) continue;
      if (["relay", "timer-on", "timer-off", "counter"].includes(behavior.device)) {
        deviceLabels.add(label);
      }
      if (behavior.device === "solenoid") solenoidLabels.add(label);
    }
  }

  for (const comp of doc.components) {
    const def = getComponentDefinition(comp.type);
    const behavior = def.behavior;

    // 실린더 이름표 참조 (롤러 밸브, 리밋 스위치)
    const usesCylinder =
      (behavior?.role === "valve" &&
        (behavior.left.kind === "roller" || behavior.right.kind === "roller")) ||
      (behavior?.role === "elec-contact" && behavior.source === "limit");
    if (usesCylinder) {
      const label = String(comp.properties.cylinderLabel ?? "");
      if (label && !cylinderLabels.has(label)) {
        warnings.push(`${def.name}이(가) 참조하는 실린더 이름표 "${label}"가 없습니다.`);
      }
    }

    // 디바이스 이름표 참조 (릴레이/타이머/카운터 접점)
    if (behavior?.role === "elec-contact" && behavior.source === "device") {
      const label = String(comp.properties.deviceLabel ?? "");
      if (label && !deviceLabels.has(label)) {
        warnings.push(`${def.name}이(가) 참조하는 디바이스 "${label}"의 코일이 없습니다.`);
      }
    }

    // 솔레노이드 이름표 참조 (솔레노이드 밸브)
    if (behavior?.role === "valve") {
      for (const side of [behavior.left, behavior.right]) {
        if (side.kind !== "solenoid" || !side.solenoidProp) continue;
        const label = String(comp.properties[side.solenoidProp] ?? "");
        if (label && !solenoidLabels.has(label)) {
          warnings.push(`${def.name}의 솔레노이드 "${label}"에 대응하는 전기 부품이 없습니다.`);
        }
      }
    }
  }

  // ioMap 항목: 부품 미지정/유실 검사
  for (const entry of doc.ioMap ?? []) {
    if (!entry.componentId || !doc.components.some((c) => c.id === entry.componentId)) {
      warnings.push(`PLC 매핑 ${entry.device}에 부품이 지정되지 않았습니다.`);
    }
  }

  // PLC 매핑 부품은 배선 없이 동작하므로 전원·배선 검사에서 제외
  const electricComponents = doc.components.filter(
    (c) =>
      !ioMapped.has(c.id) &&
      getComponentDefinition(c.type).ports.some((p) => p.kind === "electric"),
  );
  if (electricComponents.length > 0) {
    const supplies = doc.components
      .map((c) => getComponentDefinition(c.type).behavior)
      .filter((b) => b?.role === "elec-supply");
    if (!supplies.some((b) => b?.role === "elec-supply" && b.polarity === "positive"))
      warnings.push("+24V 전원이 없습니다 — 전기 회로가 통전되지 않습니다.");
    if (!supplies.some((b) => b?.role === "elec-supply" && b.polarity === "negative"))
      warnings.push("0V 전원이 없습니다 — 전기 회로가 통전되지 않습니다.");
  }

  for (const comp of doc.components) {
    const def = getComponentDefinition(comp.type);
    const behavior = def.behavior;
    const exhaustPorts = new Set<string>(
      behavior?.role === "valve"
        ? behavior.exhaustPorts
        : behavior?.role === "quick-exhaust"
          ? [behavior.exhaustR]
          : behavior?.role === "hydraulic-power-unit"
            ? [behavior.tankPort] // 파워유닛 자체가 탱크 — 미배선 허용
            : [],
    );
    for (const port of def.ports) {
      if (port.kind !== "electric" && exhaustPorts.has(port.id)) continue; // 배기 포트는 미배선이 정상
      // PLC 매핑 부품은 전기 배선이 불필요하지만, 유체 포트(압력 스위치 등)는 여전히 배관이 필요 (M11)
      if (port.kind === "electric" && ioMapped.has(comp.id)) continue;
      if (!isPortWired(doc, { componentId: comp.id, portId: port.id })) {
        warnings.push(`${def.name}의 ${port.label ?? port.id} 포트가 연결되지 않았습니다.`);
      }
    }
  }

  return warnings;
}
