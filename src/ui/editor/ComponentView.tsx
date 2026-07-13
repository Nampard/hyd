import type { ReactElement } from "react";
import type { ComponentInstance, PortRef } from "../../core/model/types";
import { getComponentDefinition } from "../../core/library/registry";
import { getPortWorldPosition } from "../../core/model/operations";
import { getSymbol, type SymbolRuntime } from "../symbols";
import { PORT_COLORS } from "./colors";
import { useSimStore } from "../sim/simStore";

interface Props {
  component: ComponentInstance;
  selected: boolean;
  /** 배선 작성 중일 때, 포트별 연결 가능 여부 (미작성 중이면 null) */
  wireTargets: Map<string, boolean> | null;
  /** 시뮬레이션 런타임 (실행 중이 아니면 null) */
  runtime: SymbolRuntime | null;
  onSelect(): void;
  onDragStart(e: React.PointerEvent): void;
  onPortClick(ref: PortRef): void;
}

export function ComponentView({
  component,
  selected,
  wireTargets,
  runtime,
  onSelect,
  onDragStart,
  onPortClick,
}: Props): ReactElement {
  const def = getComponentDefinition(component.type);
  const Symbol = getSymbol(def.symbolId);
  const { bounds } = def;

  const simRunning = runtime != null;
  const behavior = def.behavior;
  const manualValve =
    behavior?.role === "valve" &&
    (behavior.left.kind === "manual" || behavior.right.kind === "manual");
  const manualContact = behavior?.role === "elec-contact" && behavior.source === "manual";
  const actuatable = simRunning && (manualValve || manualContact);
  /** 클릭 시 토글(유지)인지, 누르는 동안만인지 */
  const isToggle = manualValve
    ? component.properties.actuation === "lever"
    : component.properties.actuation === "maintained";

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!simRunning) {
      onSelect();
      onDragStart(e);
      return;
    }
    if (actuatable) {
      const sim = useSimStore.getState();
      if (isToggle) {
        sim.toggleManual(component.id);
      } else {
        sim.setManual(component.id, true);
        const release = () => {
          sim.setManual(component.id, false);
          window.removeEventListener("pointerup", release);
        };
        window.addEventListener("pointerup", release);
      }
    } else {
      onSelect(); // 실행 중에도 속성 열람은 허용
    }
  };

  return (
    <g>
      <g
        transform={`translate(${component.position.x}, ${component.position.y}) rotate(${component.rotation})`}
        color={selected ? "var(--accent)" : "var(--symbol)"}
        style={{ cursor: simRunning ? (actuatable ? "pointer" : "default") : "move" }}
        onPointerDown={handleBodyPointerDown}
      >
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          fill="transparent"
          stroke="none"
        />
        {selected && (
          <rect
            x={bounds.x - 4}
            y={bounds.y - 4}
            width={bounds.width + 8}
            height={bounds.height + 8}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
        {actuatable && (
          <rect
            x={bounds.x - 2}
            y={bounds.y - 2}
            width={bounds.width + 4}
            height={bounds.height + 4}
            fill="none"
            stroke="var(--ok)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.7}
          />
        )}
        <Symbol properties={component.properties} runtime={runtime ?? undefined} />
      </g>

      {def.ports.map((port) => {
        const pos = getPortWorldPosition(component, port);
        const targetState = wireTargets?.get(port.id);
        const stroke =
          wireTargets == null
            ? PORT_COLORS[port.kind]
            : targetState
              ? "var(--ok)"
              : "var(--err)";
        const portPressure = runtime?.portState?.[port.id];
        const fill =
          portPressure === "pressurized"
            ? "var(--pneumatic)"
            : portPressure === "exhausted"
              ? "var(--flow-exhaust)"
              : "var(--canvas-bg)";
        return (
          <circle
            key={port.id}
            cx={pos.x}
            cy={pos.y}
            r={4}
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
            style={{ cursor: simRunning ? "default" : "crosshair" }}
            className="port"
            onPointerDown={(e) => {
              if (e.button !== 0 || simRunning) return;
              e.stopPropagation();
              onPortClick({ componentId: component.id, portId: port.id });
            }}
          >
            <title>
              {def.name} — {port.label ?? port.id}
            </title>
          </circle>
        );
      })}
    </g>
  );
}
