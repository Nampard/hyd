import { useRef, useState, type ReactElement } from "react";
import { useEditorStore } from "../editor/store";
import { useSimStore } from "../sim/simStore";
import { getComponentDefinition } from "../../core/library/registry";
import {
  getComponent,
  getEquipmentPosition,
  getPortDefinition,
  moveEquipment,
} from "../../core/model/operations";
import type { Point } from "../../core/model/types";
import { addPoints, rotatePoint, rotateDirection, snapPoint } from "../../core/geometry";
import { computeOrthogonalRoute } from "../../core/routing";
import { getSymbol } from "../symbols";
import { getSprite } from "./sprites";
import { MpsStationSprite } from "./MpsStationSprite";
import { useT } from "../i18n";

/**
 * 일러스트 장비 뷰 (ARCHITECTURE 4.6 + Phase 8 자유 배치).
 * 별도 시뮬레이션 상태 없음 — 같은 문서·같은 SimulationState를 일러스트로 렌더한다.
 * 배치는 equipmentLayout(문서 v2)을 따르며, 편집 모드에서 드래그로 자유 이동할 수 있다.
 * 뷰포트는 에디터와 공유해 두 화면이 함께 이동/확대된다.
 */
export function EquipmentView(): ReactElement {
  const doc = useEditorStore((s) => s.document);
  const viewport = useEditorStore((s) => s.viewport);
  const selection = useEditorStore((s) => s.selection);
  const simRunning = useSimStore((s) => s.running);
  const snapshot = useSimStore((s) => s.snapshot);

  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  /** 드래그 중 임시 위치 (커밋 전) */
  const [dragPos, setDragPos] = useState<{ id: string; pos: Point } | null>(null);
  const dragRef = useRef<{ id: string; grabOffset: Point } | null>(null);

  const screenToWorld = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom,
    };
  };

  /** 장비 뷰 표시 좌표 (드래그 중 임시 위치 우선) */
  const eqPosition = (compId: string): Point => {
    if (dragPos?.id === compId) return dragPos.pos;
    const comp = getComponent(doc, compId)!;
    return getEquipmentPosition(doc, comp);
  };

  /** 장비 뷰 기준 포트 월드 좌표 (자유 배치 반영) */
  const eqPortPosition = (compId: string, portId: string): Point | null => {
    const comp = getComponent(doc, compId);
    if (!comp) return null;
    const port = getPortDefinition(comp, portId);
    if (!port) return null;
    return addPoints(eqPosition(compId), rotatePoint(port.offset, comp.rotation));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const world = screenToWorld(e.clientX, e.clientY);
    setDragPos({
      id: drag.id,
      pos: snapPoint({ x: world.x - drag.grabOffset.x, y: world.y - drag.grabOffset.y }),
    });
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (drag && dragPos && dragPos.id === drag.id) {
      const s = useEditorStore.getState();
      s.commitDocument(moveEquipment(s.document, drag.id, dragPos.pos));
    }
    dragRef.current = null;
    setDragPos(null);
  };

  const hasLayout = Object.keys(doc.equipmentLayout ?? {}).length > 0;

  return (
    <div className="equipment-view">
      <div className="equipment-head">
        {t("equipmentHead")}
        <span className="equipment-head-hint">
          {simRunning ? "" : t("equipmentDragHint")}
        </span>
        {!simRunning && hasLayout && (
          <button
            className="equipment-reset"
            onClick={() => {
              const s = useEditorStore.getState();
              s.commitDocument({ ...s.document, equipmentLayout: {} });
            }}
          >
            {t("equipmentReset")}
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        className="equipment-canvas"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerDown={(e) => {
          // 구분동작 일시정지 중 빈 곳 클릭 → 다음 동작 (부품 클릭은 stopPropagation으로 제외됨)
          const sim = useSimStore.getState();
          if (e.button === 0 && sim.running && sim.mode === "step" && sim.paused) sim.advanceStep();
        }}
      >
        <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
          {/* 배관/배선 = 호스 (자유 배치 좌표 기준 재라우팅) */}
          {doc.wires.map((wire) => {
            const fromComp = getComponent(doc, wire.from.componentId);
            const toComp = getComponent(doc, wire.to.componentId);
            if (!fromComp || !toComp) return null;
            const fromPort = getPortDefinition(fromComp, wire.from.portId);
            const toPort = getPortDefinition(toComp, wire.to.portId);
            if (!fromPort || !toPort) return null;

            const fromPos = eqPortPosition(wire.from.componentId, wire.from.portId)!;
            const toPos = eqPortPosition(wire.to.componentId, wire.to.portId)!;
            const waypoints = computeOrthogonalRoute(
              fromPos,
              rotateDirection(fromPort.direction, fromComp.rotation),
              toPos,
              rotateDirection(toPort.direction, toComp.rotation),
            );
            const points = [fromPos, ...waypoints, toPos].map((p) => `${p.x},${p.y}`).join(" ");

            const pressure = simRunning ? snapshot?.wires[wire.id] : null;
            const hot = pressure === "pressurized";
            const color =
              wire.kind === "electric"
                ? hot
                  ? "#dc2626"
                  : "#9ca3af"
                : hot
                  ? wire.kind === "hydraulic"
                    ? "#b45309"
                    : "#0369a1"
                  : "#64748b";
            return (
              <g key={wire.id}>
                <polyline
                  points={points}
                  fill="none"
                  stroke="#1f2937"
                  strokeWidth={wire.kind === "electric" ? 4 : 7}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.25}
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={wire.kind === "electric" ? 2.5 : 5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {doc.components.map((comp) => {
            const def = getComponentDefinition(comp.type);
            const Sprite = getSprite(comp.type);
            const Fallback = getSymbol(def.symbolId);
            const runtime = simRunning ? (snapshot?.components[comp.id] ?? undefined) : undefined;
            const selected = selection?.type === "component" && selection.id === comp.id;
            const behavior = def.behavior;
            const manualValve =
              behavior?.role === "valve" &&
              (behavior.left.kind === "manual" || behavior.right.kind === "manual");
            const manualContact =
              behavior?.role === "elec-contact" && behavior.source === "manual";
            const actuatable = simRunning && (manualValve || manualContact);
            const isToggle = manualValve
              ? comp.properties.actuation === "lever"
              : comp.properties.actuation === "maintained";
            const pos = eqPosition(comp.id);

            return (
              <g
                key={comp.id}
                transform={`translate(${pos.x}, ${pos.y}) rotate(${comp.rotation})`}
                color="var(--symbol)"
                style={{ cursor: simRunning ? (actuatable ? "pointer" : "default") : "move" }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  if (actuatable) {
                    const sim = useSimStore.getState();
                    // Shift+클릭: 누른 상태 고정 (동시 조작용)
                    if (isToggle || e.shiftKey) sim.toggleManual(comp.id);
                    else {
                      sim.setManual(comp.id, true);
                      const release = () => {
                        sim.setManual(comp.id, false);
                        window.removeEventListener("pointerup", release);
                      };
                      window.addEventListener("pointerup", release);
                    }
                  } else if (!simRunning) {
                    useEditorStore.getState().select({ type: "component", id: comp.id });
                    const world = screenToWorld(e.clientX, e.clientY);
                    dragRef.current = {
                      id: comp.id,
                      grabOffset: { x: world.x - pos.x, y: world.y - pos.y },
                    };
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  }
                }}
              >
                {/* 히트 영역 (드래그용) */}
                <rect
                  x={def.bounds.x}
                  y={def.bounds.y}
                  width={def.bounds.width}
                  height={def.bounds.height}
                  fill="transparent"
                  stroke="none"
                />
                {selected && (
                  <rect
                    x={def.bounds.x - 4}
                    y={def.bounds.y - 4}
                    width={def.bounds.width + 8}
                    height={def.bounds.height + 8}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                )}
                {def.ioChannels ? (
                  // 복합설비(자동화설비 스테이션 등): 조작 패널 이산 입력이 필요해
                  // 전용 스프라이트에 채널 콜백을 연결한다 (실행 중에만)
                  <MpsStationSprite
                    properties={comp.properties}
                    runtime={runtime}
                    onDiscreteInput={
                      simRunning
                        ? (channel, active) =>
                            useSimStore.getState().setDiscreteInput(comp.id, channel, active)
                        : undefined
                    }
                  />
                ) : Sprite ? (
                  <Sprite properties={comp.properties} runtime={runtime} />
                ) : (
                  <Fallback properties={comp.properties} runtime={runtime} />
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
