import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useEditorStore } from "./store";
import type { Point, PortRef } from "../../core/model/types";
import {
  canConnect,
  componentsInRect,
  getComponent,
  getLimitSwitchMarkers,
  getPortDefinition,
  getPortWorldPosition,
} from "../../core/model/operations";
import { getComponentDefinition } from "../../core/library/registry";
import { GRID, snapPoint } from "../../core/geometry";
import { ComponentView } from "./ComponentView";
import { WireView } from "./WireView";
import { getSymbol, LimitSwitchDeviceMarker } from "../symbols";
import { PORT_COLORS } from "./colors";
import { useSimStore } from "../sim/simStore";
import { useT } from "../i18n";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/** 포인터 제스처 상태 (렌더와 무관 — ref로 관리) */
type Gesture =
  | { mode: "idle" }
  | { mode: "pan"; startScreen: Point; startViewport: Point }
  | { mode: "drag-component"; id: string; grabOffset: Point; started: boolean }
  | { mode: "marquee"; startWorld: Point };

export function EditorCanvas(): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture>({ mode: "idle" });
  const [mouseWorld, setMouseWorld] = useState<Point>({ x: 0, y: 0 });

  const doc = useEditorStore((s) => s.document);
  const selection = useEditorStore((s) => s.selection);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const [marquee, setMarquee] = useState<{ a: Point; b: Point } | null>(null);
  const viewport = useEditorStore((s) => s.viewport);
  const placingType = useEditorStore((s) => s.placingType);
  const pendingWireFrom = useEditorStore((s) => s.pendingWireFrom);
  const simRunning = useSimStore((s) => s.running);
  const simSnapshot = useSimStore((s) => s.snapshot);
  const t = useT();
  const isEmpty = doc.components.length === 0 && doc.wires.length === 0;

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  // --- 줌 (커서 기준) ---
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useEditorStore.getState();
      const v = s.viewport;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldX = (mx - v.x) / v.zoom;
      const worldY = (my - v.y) / v.zoom;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * Math.exp(-e.deltaY * 0.0015)));
      s.setViewport({ x: mx - worldX * zoom, y: my - worldY * zoom, zoom });
    };
    // preventDefault를 위해 passive: false 필요
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // --- 포인터 이벤트 ---
  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    const s = useEditorStore.getState();

    // 구분동작 일시정지 중 빈 곳 클릭 → 다음 동작 진행 (Phase 11)
    const sim = useSimStore.getState();
    if (e.button === 0 && sim.running && sim.mode === "step" && sim.paused) {
      sim.advanceStep();
      return;
    }

    if (e.button === 0 && placingType) {
      s.placeComponent(screenToWorld(e.clientX, e.clientY));
      return;
    }
    if (e.button === 0 && pendingWireFrom) {
      // 빈 곳 클릭 시 배선 취소
      s.cancelWire();
      return;
    }
    // Shift + 좌드래그 = 영역 선택 (좌드래그 팬은 그대로 유지, Phase 18)
    if (e.button === 0 && e.shiftKey) {
      const start = screenToWorld(e.clientX, e.clientY);
      gestureRef.current = { mode: "marquee", startWorld: start };
      setMarquee({ a: start, b: start });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button === 0 || e.button === 1) {
      gestureRef.current = {
        mode: "pan",
        startScreen: { x: e.clientX, y: e.clientY },
        startViewport: { x: viewport.x, y: viewport.y },
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      if (e.button === 0) s.select(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = screenToWorld(e.clientX, e.clientY);
    if (placingType || pendingWireFrom) setMouseWorld(world);

    const g = gestureRef.current;
    if (g.mode === "pan") {
      const s = useEditorStore.getState();
      s.setViewport({
        x: g.startViewport.x + (e.clientX - g.startScreen.x),
        y: g.startViewport.y + (e.clientY - g.startScreen.y),
        zoom: s.viewport.zoom,
      });
    } else if (g.mode === "marquee") {
      setMarquee({ a: g.startWorld, b: world });
    } else if (g.mode === "drag-component") {
      const s = useEditorStore.getState();
      if (!g.started) {
        g.started = true;
        s.beginDrag();
      }
      s.dragComponentTo(g.id, {
        x: world.x - g.grabOffset.x,
        y: world.y - g.grabOffset.y,
      });
    }
  };

  const onPointerUp = () => {
    const g = gestureRef.current;
    if (g.mode === "drag-component" && g.started) {
      useEditorStore.getState().endDrag();
    }
    if (g.mode === "marquee" && marquee) {
      const rect = {
        minX: Math.min(marquee.a.x, marquee.b.x),
        minY: Math.min(marquee.a.y, marquee.b.y),
        maxX: Math.max(marquee.a.x, marquee.b.x),
        maxY: Math.max(marquee.a.y, marquee.b.y),
      };
      useEditorStore.getState().selectArea(componentsInRect(doc, rect));
      setMarquee(null);
    }
    gestureRef.current = { mode: "idle" };
  };

  const startComponentDrag = (id: string) => (e: React.PointerEvent) => {
    const comp = getComponent(useEditorStore.getState().document, id);
    if (!comp) return;
    const world = screenToWorld(e.clientX, e.clientY);
    gestureRef.current = {
      mode: "drag-component",
      id,
      grabOffset: { x: world.x - comp.position.x, y: world.y - comp.position.y },
      started: false,
    };
  };

  const onPortClick = (ref: PortRef) => {
    const s = useEditorStore.getState();
    if (s.pendingWireFrom) s.completeWire(ref);
    else s.startWire(ref);
  };

  // --- 배선 미리보기 ---
  let wirePreview: ReactElement | null = null;
  if (pendingWireFrom) {
    const comp = getComponent(doc, pendingWireFrom.componentId);
    const port = comp && getPortDefinition(comp, pendingWireFrom.portId);
    if (comp && port) {
      const from = getPortWorldPosition(comp, port);
      const snapped = snapPoint(mouseWorld);
      wirePreview = (
        <polyline
          points={`${from.x},${from.y} ${snapped.x},${from.y} ${snapped.x},${snapped.y}`}
          fill="none"
          stroke={PORT_COLORS[port.kind]}
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.7}
          pointerEvents="none"
        />
      );
    }
  }

  // --- 배치 미리보기 (고스트) ---
  let placingGhost: ReactElement | null = null;
  if (placingType) {
    const def = getComponentDefinition(placingType);
    const Symbol = getSymbol(def.symbolId);
    const pos = snapPoint(mouseWorld);
    placingGhost = (
      <g
        transform={`translate(${pos.x}, ${pos.y})`}
        color="var(--symbol)"
        opacity={0.45}
        pointerEvents="none"
      >
        <Symbol
          properties={Object.fromEntries(def.propertySchema.map((f) => [f.key, f.default]))}
        />
      </g>
    );
  }

  // --- 배선 대상 포트 하이라이트 ---
  const wireTargetsFor = (componentId: string): Map<string, boolean> | null => {
    if (!pendingWireFrom) return null;
    const comp = getComponent(doc, componentId);
    if (!comp) return null;
    const def = getComponentDefinition(comp.type);
    const map = new Map<string, boolean>();
    for (const p of def.ports) {
      map.set(p.id, canConnect(doc, pendingWireFrom, { componentId, portId: p.id }).ok);
    }
    return map;
  };

  // 그리드가 화면을 항상 덮도록 뷰포트 기준 월드 범위 계산
  const rect = svgRef.current?.getBoundingClientRect();
  const gridX = -viewport.x / viewport.zoom;
  const gridY = -viewport.y / viewport.zoom;
  const gridW = (rect?.width ?? 2000) / viewport.zoom;
  const gridH = (rect?.height ?? 2000) / viewport.zoom;

  return (
    <svg
      ref={svgRef}
      className="editor-canvas"
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        const s = useEditorStore.getState();
        s.cancelWire();
        s.cancelPlacing();
      }}
    >
      <defs>
        <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <circle cx={0.75} cy={0.75} r={0.75} fill="var(--grid-dot)" />
        </pattern>
      </defs>

      <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
        <rect
          x={gridX}
          y={gridY}
          width={gridW}
          height={gridH}
          fill="url(#grid)"
          pointerEvents="none"
        />

        {doc.wires.map((wire) => (
          <WireView
            key={wire.id}
            document={doc}
            wire={wire}
            selected={!simRunning && selection?.type === "wire" && selection.id === wire.id}
            pressure={simRunning ? (simSnapshot?.wires[wire.id] ?? "blocked") : null}
            onSelect={() => {
              if (!simRunning) useEditorStore.getState().select({ type: "wire", id: wire.id });
            }}
          />
        ))}

        {wirePreview}

        {doc.components.map((comp) => (
          <ComponentView
            key={comp.id}
            component={comp}
            selected={
              selectedIds.includes(comp.id) ||
              (selection?.type === "component" && selection.id === comp.id)
            }
            wireTargets={simRunning ? null : wireTargetsFor(comp.id)}
            runtime={simRunning ? (simSnapshot?.components[comp.id] ?? null) : null}
            onSelect={(additive) => {
              const s = useEditorStore.getState();
              // Shift+클릭이면 다중 선택에 추가/제거 (Phase 18)
              if (additive) s.toggleSelected(comp.id);
              else s.select({ type: "component", id: comp.id });
            }}
            onDragStart={startComponentDrag(comp.id)}
            onPortClick={onPortClick}
          />
        ))}

        {/* 리밋 스위치 장치 표시 (Phase 19-3) — 실기 도면처럼 실린더 위에 몸체를 그려
            어느 끝을 감지하는지 보여 준다. 표시 전용이라 클릭·선택 대상이 아니다 */}
        {getLimitSwitchMarkers(doc).map((marker) => (
          <g
            key={`ls-${marker.switchId}`}
            transform={`translate(${marker.position.x}, ${marker.position.y}) rotate(${marker.rotation})`}
            color="var(--symbol)"
            pointerEvents="none"
          >
            <LimitSwitchDeviceMarker
              name={marker.name}
              atRetracted={marker.atRetracted}
              pressed={(() => {
                if (!simRunning) return false;
                const closed = simSnapshot?.components[marker.switchId]?.contactClosed ?? false;
                return marker.isNC ? !closed : closed;
              })()}
            />
          </g>
        ))}

        {marquee && (
          <rect
            x={Math.min(marquee.a.x, marquee.b.x)}
            y={Math.min(marquee.a.y, marquee.b.y)}
            width={Math.abs(marquee.b.x - marquee.a.x)}
            height={Math.abs(marquee.b.y - marquee.a.y)}
            fill="var(--accent)"
            fillOpacity={0.08}
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}

        {placingGhost}
      </g>

      {/* 빈 도면 안내. 변환 <g> 밖에 화면 좌표(100%)로 두어 팬/줌과 무관하게 중앙 고정.
          SVG <text>는 줄바꿈이 안 돼 좁은 캔버스(장비 뷰 동시 표시 등)에서 넘치므로
          foreignObject 안의 HTML로 그린다. 부품·배선이 생기면 페이드 아웃 —
          언마운트하면 전환이 안 보이므로 항상 렌더하고 opacity만 바꾼다.
          내보내기(exportCircuitSvg)에서는 이 요소를 제거한다 */}
      <foreignObject
        x={0}
        y={0}
        width="100%"
        height="100%"
        className={`canvas-empty-hint${isEmpty ? "" : " is-hidden"}`}
        aria-hidden={!isEmpty}
      >
        <div className="canvas-empty-inner">
          <p className="canvas-empty-title">HYD</p>
          <p className="canvas-empty-line">{t("emptyHint1")}</p>
          <p className="canvas-empty-line">{t("emptyHint2")}</p>
          <p className="canvas-empty-line is-accent">{t("emptyHint3")}</p>
          {/* 갱신 안내: SW가 네트워크 우선이라 온라인 새로고침이면 대개 최신본을 받지만,
              캐시가 남은 PC를 위해 강력 새로고침 단축키를 함께 알려 준다 */}
          <p className="canvas-empty-update">{t("emptyUpdate")}</p>
          {/* 고지: 면책(용도 한계·표준 미인증) + 라이선스 요약 — 상세는 README·LICENSE */}
          <div className="canvas-empty-notice">
            <p>{t("emptyNotice1")}</p>
            <p>{t("emptyNotice2")}</p>
            <p>{t("emptyNotice3")}</p>
          </div>
        </div>
      </foreignObject>
    </svg>
  );
}
