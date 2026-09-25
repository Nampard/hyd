import { useRef } from "react";
import type { Point } from "../../core/model/types";
import { useEditorStore } from "./store";

/**
 * 두 손가락 확대/축소 + 이동 (Phase 24 — 태블릿 터치 보강).
 *
 * 회로도와 장비 뷰가 뷰포트를 공유하므로 두 캔버스가 같은 훅을 쓴다. 이벤트는 SVG의
 * **캡처 단계**에서 가로채, 두 번째 손가락이 부품 위에 닿아도 선택·드래그·수동 조작이
 * 일어나지 않게 한다. 마우스·펜 포인터는 건드리지 않는다.
 *
 * @param onPinchStart 두 번째 손가락이 닿는 순간 — 진행 중이던 한 손가락 제스처
 *   (화면 이동·부품 드래그·영역 선택)를 캔버스 쪽에서 정리하도록 알린다.
 */
export function usePinchZoom(onPinchStart?: () => void) {
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number; mid: Point } | null>(null);

  const measure = (el: Element): { dist: number; mid: Point } | null => {
    const [a, b] = [...touches.current.values()];
    if (!a || !b) return null;
    const rect = el.getBoundingClientRect();
    return {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
    };
  };

  const release = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
  };

  return {
    onPointerDownCapture(e: React.PointerEvent) {
      if (e.pointerType !== "touch") return;
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        pinch.current = measure(e.currentTarget);
        onPinchStart?.();
      }
      // 두 번째 이후 손가락은 부품·포트에 전달하지 않는다
      if (touches.current.size >= 2) e.stopPropagation();
    },
    onPointerMoveCapture(e: React.PointerEvent) {
      if (e.pointerType !== "touch" || !touches.current.has(e.pointerId)) return;
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const prev = pinch.current;
      if (!prev) return;
      e.stopPropagation();
      const next = measure(e.currentTarget);
      if (!next) return;
      const s = useEditorStore.getState();
      // 두 손가락 중점을 기준으로 확대한 뒤, 중점이 움직인 만큼 화면을 옮긴다
      s.zoomAt(next.dist / prev.dist, prev.mid);
      const v = useEditorStore.getState().viewport;
      s.setViewport({ x: v.x + (next.mid.x - prev.mid.x), y: v.y + (next.mid.y - prev.mid.y), zoom: v.zoom });
      pinch.current = next;
    },
    onPointerUpCapture: release,
    onPointerCancelCapture: release,
  };
}
