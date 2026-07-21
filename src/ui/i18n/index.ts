import { create } from "zustand";

/**
 * UI 크롬 다국어 (Phase 10).
 * 부품·예제 이름은 아직 한국어 고정 (ROADMAP "후순위: i18n 2차").
 */

export type Lang = "ko" | "en";

const ko = {
  run: "▶ 실행",
  runStep: "▶ 구분 실행",
  nextStep: "다음 동작 ▶",
  stop: "■ 정지",
  openExample: "예제 열기…",
  newCircuit: "새 회로",
  open: "열기",
  saveJson: "저장 (.json)",
  browserSave: "브라우저 저장",
  browserOpen: "브라우저 열기…",
  delete: "삭제",
  undo: "↩ 실행 취소",
  redo: "↪ 다시 실행",
  resetView: "화면 초기화",
  plcLadder: "PLC 래더",
  equipmentView: "장비 뷰",
  diagram: "변위선도",
  exportSvg: "SVG 내보내기",
  titlePlaceholder: "회로 제목",
  parts: "부품",
  properties: "속성",
  selectHint: "부품을 선택하면 속성이 표시됩니다.",
  wireSelected: "배선이 선택되었습니다. Delete 키로 삭제할 수 있습니다.",
  noProperties: "설정할 속성이 없습니다.",
  editHint: "R 키: 회전 · Delete 키: 삭제",
  simEditLock: "시뮬레이션 중에는 속성을 변경할 수 없습니다.",
  statusDefault: "포트(○)를 클릭하면 배선을 시작합니다. 빈 곳 드래그: 화면 이동 · 휠: 확대/축소",
  appTagline: "교육용 논리 시뮬레이터",
  statusPlacing: "캔버스를 클릭해 부품을 배치하세요. (우클릭/Esc 취소)",
  statusWiring: "연결할 포트를 클릭하세요. (우클릭/Esc 취소)",
  statusRunning: "시뮬레이션 실행 중 — 초록 점선 부품을 클릭해 조작하세요. (Shift+클릭: 누름 고정)",
  statusStepPaused: "동작 {n} 완료 — 빈 곳을 클릭하면 다음 동작을 진행합니다.",
  statusStepCycle: "사이클 완료 (동작 {n}) ↻ 처음 동작으로 돌아갑니다 — 빈 곳을 클릭해 계속.",
  statusStepRunning: "구분동작 진행 중 — 동작이 끝나면 자동으로 멈춥니다.",
  statusUnstable:
    "⚠ 회로가 안정되지 않습니다 — 접점이 자신의 코일을 반전 구동하는 등 자기모순 회로일 수 있습니다.",
  countParts: "부품",
  countWires: "배선",
  equipmentHead: "장비 뷰 (일러스트)",
  equipmentDragHint: " — 드래그로 자유 배치",
  equipmentReset: "배치 초기화",
  diagramHead: "변위단계선도",
  diagramEmpty: " — 실린더가 있는 회로를 실행하면 기록됩니다.",
  learningActivityLabel: "학습 활동 설명",
  learningActivityPlaceholder: "예: 제어밸브 및 복동실린더를 활용한 시퀀스 제어",
  learningActivityAutoFill: "자동 작성",
  learningActivityHint: "저장 시 비워두면 회로 구성을 바탕으로 자동 작성됩니다. 이름·학번 등 개인정보는 적지 마세요.",
  learningActivityStale: "⚠ 회로가 바뀌어 설명이 현재 구성과 다를 수 있습니다. [자동 작성]으로 갱신할 수 있어요.",
  emptyHint1: "왼쪽 [부품]에서 기호를 골라 도면을 클릭하면 배치됩니다.",
  emptyHint2: "포트(○)끼리 클릭해 이으면 배선이 되고, [▶ 실행]으로 동작을 확인합니다.",
  emptyHint3: "처음이라면 상단 [예제 열기…]에서 19가지 예제를 불러와 참고하세요.",
  emptyUpdate:
    "화면이 예전 그대로인가요? 인터넷이 연결된 상태에서 Ctrl+Shift+R (맥은 ⌘+Shift+R)을 누르면 최신 버전으로 갱신됩니다.",
  emptyNotice1:
    "교육용 논리/상태 시뮬레이션입니다 — 수치를 정밀 계산하지 않으므로 실제 설비 선정·압력 설정·안전 검증에 사용하지 마세요.",
  emptyNotice2:
    "기호는 ISO 1219 · KS B 0054 · IEC 60617의 표기 관례를 참고한 교육용 단순화이며, 표준 적합성이 인증된 것은 아닙니다.",
  emptyNotice3:
    "© 2026 Nampard · 웹앱 열람과 수업 활용은 자유롭게 · 소스·자산의 무단 복제·수정·재배포는 금지됩니다.",
};

const en: Record<keyof typeof ko, string> = {
  run: "▶ Run",
  runStep: "▶ Step run",
  nextStep: "Next step ▶",
  stop: "■ Stop",
  openExample: "Open example…",
  newCircuit: "New",
  open: "Open",
  saveJson: "Save (.json)",
  browserSave: "Save in browser",
  browserOpen: "Open from browser…",
  delete: "Delete",
  undo: "↩ Undo",
  redo: "↪ Redo",
  resetView: "Reset view",
  plcLadder: "PLC Ladder",
  equipmentView: "Equipment",
  diagram: "Step diagram",
  exportSvg: "Export SVG",
  titlePlaceholder: "Circuit title",
  parts: "Parts",
  properties: "Properties",
  selectHint: "Select a component to edit its properties.",
  wireSelected: "Wire selected. Press Delete to remove it.",
  noProperties: "No properties to configure.",
  editHint: "R: rotate · Delete: remove",
  simEditLock: "Properties are locked while the simulation runs.",
  statusDefault: "Click a port (○) to start wiring. Drag empty space: pan · Wheel: zoom",
  appTagline: "Educational logic simulator",
  statusPlacing: "Click the canvas to place the component. (Right-click/Esc to cancel)",
  statusWiring: "Click a target port. (Right-click/Esc to cancel)",
  statusRunning: "Simulation running — click green-dashed parts to operate. (Shift+click: latch)",
  statusStepPaused: "Step {n} done — click empty space to run the next step.",
  statusStepCycle: "Cycle complete (step {n}) ↻ back to the first step — click empty space to continue.",
  statusStepRunning: "Step mode — running until the current motion completes.",
  statusUnstable:
    "⚠ Circuit is not settling — it may contradict itself (e.g. an NC contact driving its own coil).",
  countParts: "parts",
  countWires: "wires",
  equipmentHead: "Equipment view (illustrated)",
  equipmentDragHint: " — drag to arrange freely",
  equipmentReset: "Reset layout",
  diagramHead: "Displacement-step diagram",
  diagramEmpty: " — run a circuit with cylinders to record.",
  learningActivityLabel: "Learning activity description",
  learningActivityPlaceholder: "e.g. Sequence control using a control valve and a double-acting cylinder",
  learningActivityAutoFill: "Auto-fill",
  learningActivityHint: "Leave blank to auto-fill from the circuit on save. Do not enter names, student IDs, or other personal info.",
  learningActivityStale: "⚠ The circuit changed, so this description may not match. Use [Auto-fill] to refresh it.",
  emptyHint1: "Pick a symbol from [Parts] on the left, then click the canvas to place it.",
  emptyHint2: "Click port to port (○) to wire them up, then press [▶ Run] to see it work.",
  emptyHint3: "New here? Load one of the 19 examples from [Open example…] above.",
  emptyUpdate:
    "Screen looks out of date? While online, press Ctrl+Shift+R (⌘+Shift+R on Mac) to refresh to the latest version.",
  emptyNotice1:
    "Educational logic/state simulation — values are not precisely computed, so never use it to select real equipment, set pressures, or validate safety.",
  emptyNotice2:
    "Symbols are educational simplifications referencing ISO 1219 · KS B 0054 · IEC 60617 conventions; they are not certified as standard-compliant.",
  emptyNotice3:
    "© 2026 Nampard · Viewing and classroom use are free · Copying, modifying, or redistributing the source and assets is prohibited.",
};

export type I18nKey = keyof typeof ko;

const dictionaries: Record<Lang, Record<I18nKey, string>> = { ko, en };

const LANG_KEY = "hyd.lang";

function applyDocumentLang(lang: Lang): void {
  try {
    document.documentElement.lang = lang; // 보조기술·브라우저 번역이 언어를 인식하도록 (codex-review L3)
  } catch {
    /* 테스트 환경 */
  }
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "ko") {
      applyDocumentLang(saved);
      return saved;
    }
  } catch {
    /* SSR/테스트 환경 */
  }
  return "ko";
}

interface I18nStore {
  lang: Lang;
  toggle(): void;
}

export const useI18nStore = create<I18nStore>((set) => ({
  lang: initialLang(),
  toggle() {
    set((s) => {
      const lang: Lang = s.lang === "ko" ? "en" : "ko";
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        /* 무시 */
      }
      applyDocumentLang(lang);
      return { lang };
    });
  },
}));

/** 현재 언어의 번역 함수 (React 훅 — 언어 변경 시 재렌더) */
export function useT(): (key: I18nKey) => string {
  const lang = useI18nStore((s) => s.lang);
  return (key) => dictionaries[lang][key];
}
