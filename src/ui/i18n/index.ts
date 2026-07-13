import { create } from "zustand";

/**
 * UI 크롬 다국어 (Phase 10).
 * 부품·예제 이름은 아직 한국어 고정 (ROADMAP "후순위: i18n 2차").
 */

export type Lang = "ko" | "en";

const ko = {
  run: "▶ 실행",
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
  statusPlacing: "캔버스를 클릭해 부품을 배치하세요. (우클릭/Esc 취소)",
  statusWiring: "연결할 포트를 클릭하세요. (우클릭/Esc 취소)",
  statusRunning: "시뮬레이션 실행 중 — 초록 점선 부품을 클릭해 조작하세요. (Shift+클릭: 누름 고정)",
  countParts: "부품",
  countWires: "배선",
  equipmentHead: "장비 뷰 (일러스트)",
  equipmentDragHint: " — 드래그로 자유 배치",
  equipmentReset: "배치 초기화",
  diagramHead: "변위단계선도",
  diagramEmpty: " — 실린더가 있는 회로를 실행하면 기록됩니다.",
};

const en: Record<keyof typeof ko, string> = {
  run: "▶ Run",
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
  statusPlacing: "Click the canvas to place the component. (Right-click/Esc to cancel)",
  statusWiring: "Click a target port. (Right-click/Esc to cancel)",
  statusRunning: "Simulation running — click green-dashed parts to operate. (Shift+click: latch)",
  countParts: "parts",
  countWires: "wires",
  equipmentHead: "Equipment view (illustrated)",
  equipmentDragHint: " — drag to arrange freely",
  equipmentReset: "Reset layout",
  diagramHead: "Displacement-step diagram",
  diagramEmpty: " — run a circuit with cylinders to record.",
};

export type I18nKey = keyof typeof ko;

const dictionaries: Record<Lang, Record<I18nKey, string>> = { ko, en };

const LANG_KEY = "hyd.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "ko") return saved;
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
      return { lang };
    });
  },
}));

/** 현재 언어의 번역 함수 (React 훅 — 언어 변경 시 재렌더) */
export function useT(): (key: I18nKey) => string {
  const lang = useI18nStore((s) => s.lang);
  return (key) => dictionaries[lang][key];
}
