import type { ReactElement } from "react";
import type { ComponentInstance, PortRef } from "../../core/model/types";
import { getComponentDefinition } from "../../core/library/registry";
import { getPortWorldPosition } from "../../core/model/operations";
import { getSymbol, type SymbolRuntime } from "../symbols";
import { PORT_COLORS } from "./colors";
import { useSimStore } from "../sim/simStore";
import { useEditorStore } from "./store";

/**
 * 실린더에 연결된 감지 부품(리밋 스위치·롤러 밸브)의 이름을
 * 후진단/전진단 위치별로 모아 마커로 표시할 데이터를 만든다.
 */
function detectionMarkers(
  component: ComponentInstance,
  allComponents: ComponentInstance[],
): { x: number; names: string[] }[] {
  const label = String(component.properties.label ?? "");
  if (!label) return [];
  const linked = allComponents.filter((c) => {
    const b = getComponentDefinition(c.type).behavior;
    const senses =
      (b?.role === "valve" && (b.left.kind === "roller" || b.right.kind === "roller")) ||
      (b?.role === "elec-contact" && b.source === "limit");
    return senses && String(c.properties.cylinderLabel ?? "") === label;
  });
  const namesAt = (trigger: string) =>
    linked
      .filter((c) => String(c.properties.triggerAt ?? "extended") === trigger)
      .map((c) => String(c.properties.name ?? "롤러"));
  // 피스톤 스트로크 끝 위치 (기호 로컬 좌표): 후진단 -26, 전진단 +14
  return [
    { x: -26, names: namesAt("retracted") },
    { x: 14, names: namesAt("extended") },
  ].filter((m) => m.names.length > 0);
}

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
  const allComponents = useEditorStore((s) => s.document.components);

  const simRunning = runtime != null;
  const behavior = def.behavior;
  const markers = behavior?.role === "cylinder" ? detectionMarkers(component, allComponents) : [];
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
      if (isToggle || e.shiftKey) {
        // Shift+클릭: 모멘터리 버튼도 누른 상태로 고정 (AND 회로 등 동시 조작용)
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
        {/* 감지 마커: 연결된 리밋 스위치·롤러 밸브의 감지 위치 안내 */}
        {markers.map((m) => (
          <g key={m.x} pointerEvents="none">
            <line
              x1={m.x}
              y1={-16}
              x2={m.x}
              y2={-24}
              stroke="var(--err)"
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
            <polygon points={`${m.x - 3},-24 ${m.x + 3},-24 ${m.x},-18`} fill="var(--err)" stroke="none" />
            <text x={m.x} y={-27} textAnchor="middle" fontSize={8} fill="var(--err)" stroke="none">
              {m.names.join(",")}
            </text>
          </g>
        ))}
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
