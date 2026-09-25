import { beforeEach, describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, useEditorStore } from "../store";

describe("태블릿 조작 보강 (Phase 24)", () => {
  beforeEach(() => {
    useEditorStore.setState({ viewport: { x: 0, y: 0, zoom: 1 }, multiSelectMode: false });
  });

  it("zoomAt은 기준점(두 손가락 중점·캔버스 중앙) 아래의 월드 좌표를 고정한다", () => {
    const s = useEditorStore.getState();
    s.setViewport({ x: 30, y: -20, zoom: 1.5 });
    const anchor = { x: 200, y: 120 };
    const before = useEditorStore.getState().viewport;
    const worldBefore = { x: (anchor.x - before.x) / before.zoom, y: (anchor.y - before.y) / before.zoom };
    s.zoomAt(1.25, anchor);
    const after = useEditorStore.getState().viewport;
    expect(after.zoom).toBeCloseTo(1.875);
    expect((anchor.x - after.x) / after.zoom).toBeCloseTo(worldBefore.x);
    expect((anchor.y - after.y) / after.zoom).toBeCloseTo(worldBefore.y);
  });

  it("zoomAt은 확대 범위를 벗어나지 않는다", () => {
    const s = useEditorStore.getState();
    s.zoomAt(100, { x: 0, y: 0 });
    expect(useEditorStore.getState().viewport.zoom).toBe(MAX_ZOOM);
    s.zoomAt(0.0001, { x: 0, y: 0 });
    expect(useEditorStore.getState().viewport.zoom).toBe(MIN_ZOOM);
  });

  it("다중 선택 모드를 켜고 끌 수 있다", () => {
    const s = useEditorStore.getState();
    s.toggleMultiSelectMode();
    expect(useEditorStore.getState().multiSelectMode).toBe(true);
    s.toggleMultiSelectMode();
    expect(useEditorStore.getState().multiSelectMode).toBe(false);
  });
});
