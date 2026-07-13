import type { ReactElement } from "react";
import type { Wire } from "../../core/model/types";
import { getComponent, getPortDefinition, getPortWorldPosition } from "../../core/model/operations";
import type { CircuitDocument } from "../../core/model/types";
import type { PressureState } from "../../core/sim/types";
import { wirePolyline } from "../../core/routing";
import { PORT_COLORS } from "./colors";

interface Props {
  document: CircuitDocument;
  wire: Wire;
  selected: boolean;
  /** 시뮬레이션 중 배관 압력 상태 (실행 중이 아니면 null) */
  pressure: PressureState | null;
  onSelect(): void;
}

export function WireView({ document, wire, selected, pressure, onSelect }: Props): ReactElement | null {
  const fromComp = getComponent(document, wire.from.componentId);
  const toComp = getComponent(document, wire.to.componentId);
  if (!fromComp || !toComp) return null;
  const fromPort = getPortDefinition(fromComp, wire.from.portId);
  const toPort = getPortDefinition(toComp, wire.to.portId);
  if (!fromPort || !toPort) return null;

  const points = wirePolyline(
    getPortWorldPosition(fromComp, fromPort),
    wire.waypoints,
    getPortWorldPosition(toComp, toPort),
  );
  const pointsAttr = points.map((p) => `${p.x},${p.y}`).join(" ");

  let stroke = PORT_COLORS[wire.kind];
  let width = 2;
  if (pressure === "pressurized") {
    // 가압 배관은 진한 파랑, 활선 전기 배선은 진한 빨강
    stroke = wire.kind === "electric" ? "var(--electric)" : "var(--flow-pressurized)";
    width = 3.5;
  } else if (pressure === "exhausted") {
    stroke = "var(--flow-exhaust)";
  } else if (pressure === "blocked") {
    stroke = "var(--flow-blocked)";
  }
  if (selected) {
    stroke = "var(--accent)";
    width = 3;
  }

  return (
    <g
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onSelect();
      }}
      style={{ cursor: pressure == null ? "pointer" : "default" }}
    >
      <polyline points={pointsAttr} fill="none" stroke="transparent" strokeWidth={10} />
      <polyline
        points={pointsAttr}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinejoin="round"
      />
    </g>
  );
}
