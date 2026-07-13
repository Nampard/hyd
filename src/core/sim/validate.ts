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
    if (ioMapped.has(comp.id)) continue;
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
      if (!isPortWired(doc, { componentId: comp.id, portId: port.id })) {
        warnings.push(`${def.name}의 ${port.label ?? port.id} 포트가 연결되지 않았습니다.`);
      }
    }
  }

  return warnings;
}
