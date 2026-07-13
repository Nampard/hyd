import { create } from "zustand";
import { SimulationEngine } from "../../core/sim/engine";
import { validateForSimulation } from "../../core/sim/validate";
import { DisplacementRecorder } from "../../core/sim/recorder";
import type { SimulationSnapshot } from "../../core/sim/types";
import { useEditorStore } from "../editor/store";

/** 고정 틱 (ARCHITECTURE 4.1) */
const TICK_MS = 20;

interface SimStore {
  running: boolean;
  snapshot: SimulationSnapshot | null;
  warnings: string[];
  start(): void;
  stop(): void;
  /** 푸시버튼: 누름/뗌 */
  setManual(componentId: string, active: boolean): void;
  /** 레버(디텐트): 토글 */
  toggleManual(componentId: string): void;
}

let engine: SimulationEngine | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let recorder: DisplacementRecorder | null = null;

/** 변위단계선도 레코더 (실행 중이 아니면 마지막 기록 유지) */
export function getRecorder(): DisplacementRecorder | null {
  return recorder;
}

export const useSimStore = create<SimStore>((set) => ({
  running: false,
  snapshot: null,
  warnings: [],

  start() {
    if (engine) return; // 이미 실행 중
    const editor = useEditorStore.getState();
    editor.cancelWire();
    editor.cancelPlacing();

    const doc = editor.document;
    const warnings = validateForSimulation(doc);
    engine = new SimulationEngine(doc);
    recorder = new DisplacementRecorder(doc);
    set({ running: true, warnings, snapshot: engine.snapshot() });

    // 누적 시간 방식: 인터벌이 스로틀링돼도(백그라운드 탭 등) 실제 경과 시간만큼
    // 고정 틱을 따라잡는다 (ARCHITECTURE 4.1).
    let lastTime = performance.now();
    let acc = 0;
    const TICK = TICK_MS / 1000;
    timer = setInterval(() => {
      if (!engine) return;
      const now = performance.now();
      acc += Math.min((now - lastTime) / 1000, 0.5); // 장시간 정지 후 폭주 방지
      lastTime = now;
      let snap = null;
      while (acc >= TICK) {
        snap = engine.tick(TICK);
        acc -= TICK;
        recorder?.record(snap);
      }
      if (snap) set({ snapshot: snap });
    }, TICK_MS);
  },

  stop() {
    if (timer) clearInterval(timer);
    timer = null;
    engine = null;
    set({ running: false, snapshot: null, warnings: [] });
  },

  setManual(componentId, active) {
    engine?.setManual(componentId, active);
  },

  toggleManual(componentId) {
    if (!engine) return;
    engine.setManual(componentId, !engine.getManual(componentId));
  },
}));
