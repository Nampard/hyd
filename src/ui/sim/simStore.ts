import { create } from "zustand";
import { SimulationEngine } from "../../core/sim/engine";
import { validateForSimulation } from "../../core/sim/validate";
import { DisplacementRecorder } from "../../core/sim/recorder";
import { StepController } from "../../core/sim/step-controller";
import type { SimulationSnapshot } from "../../core/sim/types";
import { useEditorStore } from "../editor/store";

/** 고정 틱 (ARCHITECTURE 4.1) */
const TICK_MS = 20;

/** 실행 모드: 연속동작 / 구분동작 (Phase 11) */
export type RunMode = "continuous" | "step";

interface SimStore {
  running: boolean;
  mode: RunMode;
  /** 구분동작 모드에서 동작 경계로 일시정지된 상태 */
  paused: boolean;
  /** 마지막 동작 경계 정보 (구분동작 모드) */
  lastStep: { step: number; cycleComplete: boolean } | null;
  snapshot: SimulationSnapshot | null;
  warnings: string[];
  start(mode?: RunMode): void;
  stop(): void;
  /** 구분동작: 다음 동작 진행 (빈 캔버스 클릭/버튼) */
  advanceStep(): void;
  /** 푸시버튼: 누름/뗌 */
  setManual(componentId: string, active: boolean): void;
  /** 레버(디텐트): 토글 */
  toggleManual(componentId: string): void;
}

let engine: SimulationEngine | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let recorder: DisplacementRecorder | null = null;
let stepController: StepController | null = null;

/** 변위단계선도 레코더 (실행 중이 아니면 마지막 기록 유지) */
export function getRecorder(): DisplacementRecorder | null {
  return recorder;
}

/** 구분동작 경계 목록 (변위선도의 동작·사이클 경계선용) */
export function getStepController(): StepController | null {
  return stepController;
}

/**
 * 마지막 실행 기록(변위 레코더·구분동작 경계) 폐기 — 새 문서/불러오기 시 호출해
 * 이전 문서의 선도·경계가 새 문서 패널에 남지 않게 한다 (codex-review-3 P1).
 * 실행 중에는 무시된다.
 */
export function clearSimHistory(): void {
  if (engine) return;
  recorder = null;
  stepController = null;
}

export const useSimStore = create<SimStore>((set, get) => ({
  running: false,
  mode: "continuous",
  paused: false,
  lastStep: null,
  snapshot: null,
  warnings: [],

  start(mode = "continuous") {
    if (engine) return; // 이미 실행 중
    const editor = useEditorStore.getState();
    editor.cancelWire();
    editor.cancelPlacing();

    const doc = editor.document;
    const warnings = validateForSimulation(doc);
    engine = new SimulationEngine(doc);
    recorder = new DisplacementRecorder(doc);
    stepController = mode === "step" ? new StepController(doc) : null;
    set({
      running: true,
      mode,
      paused: false,
      lastStep: null,
      warnings,
      snapshot: engine.snapshot(),
    });

    // 누적 시간 방식: 인터벌이 스로틀링돼도(백그라운드 탭 등) 실제 경과 시간만큼
    // 고정 틱을 따라잡는다 (ARCHITECTURE 4.1).
    let lastTime = performance.now();
    let acc = 0;
    const TICK = TICK_MS / 1000;
    timer = setInterval(() => {
      if (!engine) return;
      const now = performance.now();
      const elapsed = Math.min((now - lastTime) / 1000, 0.5); // 장시간 정지 후 폭주 방지
      lastTime = now;
      if (get().paused) {
        acc = 0; // 일시정지 중에는 시간을 쌓지 않는다 (재개 시 폭주 방지)
        return;
      }
      acc += elapsed;
      let snap: SimulationSnapshot | null = null;
      while (acc >= TICK) {
        snap = engine.tick(TICK);
        acc -= TICK;
        recorder?.record(snap);
        // 구분동작: 동작 경계에서 일시정지
        if (stepController && stepController.observe(snap) === "pause") {
          const boundary = stepController.boundaries()[stepController.boundaries().length - 1];
          set({
            paused: true,
            lastStep: { step: boundary.step, cycleComplete: boundary.cycleComplete },
          });
          acc = 0;
          break;
        }
      }
      if (snap) set({ snapshot: snap });
    }, TICK_MS);
  },

  stop() {
    if (timer) clearInterval(timer);
    timer = null;
    engine = null;
    set({ running: false, paused: false, lastStep: null, snapshot: null, warnings: [] });
  },

  advanceStep() {
    if (!engine || get().mode !== "step") return;
    if (get().paused) set({ paused: false });
  },

  setManual(componentId, active) {
    engine?.setManual(componentId, active);
  },

  toggleManual(componentId) {
    if (!engine) return;
    engine.setManual(componentId, !engine.getManual(componentId));
  },
}));
