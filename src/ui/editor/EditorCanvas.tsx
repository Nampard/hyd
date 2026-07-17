import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useEditorStore } from "./store";
import type { Point, PortRef } from "../../core/model/types";
import {
  canConnect,
  getComponent,
  getPortDefinition,
  getPortWorldPosition,
} from "../../core/model/operations";
import { getComponentDefinition } from "../../core/library/registry";
import { GRID, snapPoint } from "../../core/geometry";
import { ComponentView } from "./ComponentView";
import { WireView } from "./WireView";
import { getSymbol } from "../symbols";
import { PORT_COLORS } from "./colors";
import { useSimStore } from "../sim/simStore";
import { useT } from "../i18n";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/** 포인터 제스처 상태 (렌더와 무관 — ref로 관리) */
type Gesture =
  | { mode: "idle" }
  | { mode: "pan"; startScreen: Point; startViewport: Point }
  | { mode: "drag-component"; id: string; grabOffset: Point; started: boolean };

export function EditorCanvas(): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture>({ mode: "idle" });
  const [mouseWorld, setMouseWorld] = useState<Point>({ x: 0, y: 0 });

  const doc = useEditorStore((s) => s.document);
  const selection = useEditorStore((s) => s.selection);
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
            selected={selection?.type === "component" && selection.id === comp.id}
            wireTargets={simRunning ? null : wireTargetsFor(comp.id)}
            runtime={simRunning ? (simSnapshot?.components[comp.id] ?? null) : null}
            onSelect={() => useEditorStore.getState().select({ type: "component", id: comp.id })}
            onDragStart={startComponentDrag(comp.id)}
            onPortClick={onPortClick}
          />
        ))}

        {placingGhost}
      </g>

      {/* 빈 도면 안내. 변환 <g> 밖에 화면 좌표(50%)로 두어 팬/줌과 무관하게 중앙 고정.
          부품·배선이 하나라도 생기면 페이드 아웃 — 언마운트하면 전환이 안 보이므로
          항상 렌더하고 opacity만 바꾼다 */}
      <g
        className={`canvas-empty-hint${isEmpty ? "" : " is-hidden"}`}
        pointerEvents="none"
        aria-hidden={!isEmpty}
      >
        <text x="50%" y="50%" textAnchor="middle" className="canvas-empty-title" dy={-34}>
          HYD
        </text>
        <text x="50%" y="50%" textAnchor="middle" className="canvas-empty-line" dy={6}>
          {t("emptyHint1")}
        </text>
        <text x="50%" y="50%" textAnchor="middle" className="canvas-empty-line" dy={30}>
          {t("emptyHint2")}
        </text>
        <text x="50%" y="50%" textAnchor="middle" className="canvas-empty-line is-accent" dy={58}>
          {t("emptyHint3")}
        </text>
      </g>
    </svg>
  );
}
