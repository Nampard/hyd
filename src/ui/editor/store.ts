import { create } from "zustand";
import type { CircuitDocument, Point, PortRef } from "../../core/model/types";
import { createEmptyDocument } from "../../core/model/types";
import {
  addComponent,
  autoWire,
  canConnect,
  deleteComponent,
  deleteWire,
  extractGroup,
  moveComponent,
  pasteGroup,
  rerouteAttachedWires,
  rotateComponent,
  updateComponentProperty,
} from "../../core/model/operations";
import type { ComponentGroup } from "../../core/model/operations";

export type Selection = { type: "component" | "wire"; id: string } | null;

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface EditorState {
  document: CircuitDocument;
  /** 마지막 저장/불러오기 시점 문서 참조 — isDirty 판정 기준 (review-2 P0) */
  savedDocument: CircuitDocument;
  past: CircuitDocument[];
  future: CircuitDocument[];
  /** 드래그 시작 시점 스냅숏 — 드래그 종료 시 한 번만 히스토리에 기록 */
  dragStartDoc: CircuitDocument | null;

  selection: Selection;
  /** 배선 작성 중: 시작 포트 */
  pendingWireFrom: PortRef | null;
  /** 팔레트에서 선택한 배치 대기 부품 타입 */
  placingType: string | null;
  statusMessage: string | null;
  viewport: Viewport;
  /** PLC 래더 패널 표시 여부 */
  plcPanelOpen: boolean;
  /** 장비 뷰(일러스트) 표시 여부 */
  equipmentViewOpen: boolean;
  /** 변위단계선도 패널 표시 여부 */
  diagramPanelOpen: boolean;
  /** 복사한 부품 묶음 (Phase 16-3, Phase 18에서 다중 선택으로 확장) */
  clipboard: ComponentGroup | null;
  /** 연속 붙여넣기 시 겹치지 않도록 누적하는 오프셋 단계 */
  pasteSteps: number;
  /** 다중 선택된 부품 id 목록 (Phase 18). 단일 선택은 selection과 함께 유지된다 */
  selectedIds: string[];

  // 문서 수명주기
  newDocument(): void;
  loadDocument(doc: CircuitDocument): void;
  setTitle(title: string): void;
  /** 학습 활동 설명 수정 (Phase 12) */
  setLearningActivity(text: string): void;
  /** 저장 성공 시 호출 — 현재 문서를 저장 기준점으로 표시 */
  markSaved(): void;
  /** 저장 기준점 이후 변경 여부 (제목·PLC·속성 등 모든 변경 포함) */
  isDirty(): boolean;

  // 편집
  placeComponent(pos: Point): void;
  startPlacing(type: string): void;
  cancelPlacing(): void;
  beginDrag(): void;
  dragComponentTo(id: string, pos: Point): void;
  endDrag(): void;
  rotateSelection(): void;
  deleteSelection(): void;
  setProperty(componentId: string, key: string, value: unknown): void;
  /** 선택한 부품(들)을 내부 배선과 함께 클립보드에 복사 (Phase 16-3 · 18) */
  copySelection(): void;
  /** 클립보드 묶음을 조금 어긋난 위치에 붙여넣고 선택 상태로 만든다 */
  pasteClipboard(): void;
  /** 영역 선택 결과로 다중 선택을 설정 (Phase 18) */
  selectArea(ids: string[]): void;
  /** Shift+클릭 — 다중 선택에 추가/제거 (Phase 18) */
  toggleSelected(id: string): void;

  // 배선
  startWire(from: PortRef): void;
  completeWire(to: PortRef): void;
  cancelWire(): void;

  // 선택/뷰
  select(sel: Selection): void;
  setViewport(v: Viewport): void;
  setStatus(msg: string | null): void;

  togglePlcPanel(): void;
  toggleEquipmentView(): void;
  toggleDiagramPanel(): void;
  /** PLC 프로그램/ioMap 등 문서 전체 교체 (히스토리 기록) */
  commitDocument(doc: CircuitDocument): void;

  undo(): void;
  redo(): void;
}

/** 히스토리 최대 길이 (메모리 보호) */
const MAX_HISTORY = 100;

/** 붙여넣기 위치 오프셋 (그리드 10px 기준 2칸 — 원본과 겹치지 않으면서 가깝게) */
const PASTE_OFFSET = 20;

/**
 * 현재 선택된 부품 id 목록 (Phase 18).
 * 다중 선택이 있으면 그것을, 없으면 단일 선택(부품일 때)을 쓴다 —
 * 기존 단일 선택 동작(속성 편집·회전·삭제)이 그대로 유지된다.
 */
function selectedComponentIds(state: { selectedIds: string[]; selection: Selection }): string[] {
  if (state.selectedIds.length > 0) return state.selectedIds;
  return state.selection?.type === "component" ? [state.selection.id] : [];
}

function pushHistory(state: EditorState, snapshot: CircuitDocument) {
  const past = [...state.past, snapshot];
  if (past.length > MAX_HISTORY) past.shift();
  return { past, future: [] as CircuitDocument[] };
}

const initialDocument = createEmptyDocument();

export const useEditorStore = create<EditorState>((set, get) => ({
  document: initialDocument,
  savedDocument: initialDocument,
  past: [],
  future: [],
  dragStartDoc: null,
  selection: null,
  pendingWireFrom: null,
  placingType: null,
  statusMessage: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  plcPanelOpen: false,
  equipmentViewOpen: false,
  diagramPanelOpen: false,
  clipboard: null,
  pasteSteps: 0,
  selectedIds: [],

  newDocument() {
    const doc = createEmptyDocument();
    set({
      document: doc,
      savedDocument: doc,
      past: [],
      future: [],
      selection: null,
      selectedIds: [],
      pendingWireFrom: null,
      placingType: null,
      statusMessage: "새 회로를 시작했습니다.",
    });
  },

  loadDocument(doc) {
    set({
      document: doc,
      savedDocument: doc,
      past: [],
      future: [],
      selection: null,
      selectedIds: [],
      pendingWireFrom: null,
      placingType: null,
      statusMessage: `"${doc.meta.title}" 불러오기 완료`,
      // PLC 프로그램이 있는 문서는 래더 패널 자동 표시
      plcPanelOpen: (doc.plcProgram?.rungs.length ?? 0) > 0,
    });
  },

  markSaved() {
    set({ savedDocument: get().document });
  },

  isDirty() {
    // 문서는 불변 갱신되므로 참조 비교로 충분 (동일 내용 undo 복귀는 보수적으로 dirty 취급)
    return get().document !== get().savedDocument;
  },

  setTitle(title) {
    const state = get();
    set({
      document: { ...state.document, meta: { ...state.document.meta, title } },
    });
  },

  setLearningActivity(text) {
    const state = get();
    // 값이 그대로면 새 참조를 만들지 않는다 — 같은 자동 문구 재작성이 dirty를 유발하지 않도록 (review 품질)
    if ((state.document.meta.learningActivity ?? "") === text) return;
    set({
      document: {
        ...state.document,
        meta: { ...state.document.meta, learningActivity: text },
      },
    });
  },

  startPlacing(type) {
    set({ placingType: type, pendingWireFrom: null, selection: null, selectedIds: [], statusMessage: null });
  },

  cancelPlacing() {
    set({ placingType: null });
  },

  placeComponent(pos) {
    const state = get();
    if (!state.placingType) return;
    const { doc, component } = addComponent(state.document, state.placingType, pos);
    set({
      document: doc,
      ...pushHistory(state, state.document),
      placingType: null,
      selection: { type: "component", id: component.id },
    });
  },

  beginDrag() {
    set({ dragStartDoc: get().document });
  },

  dragComponentTo(id, pos) {
    const state = get();
    let doc = moveComponent(state.document, id, pos);
    doc = rerouteAttachedWires(doc, id);
    set({ document: doc });
  },

  endDrag() {
    const state = get();
    if (!state.dragStartDoc) return;
    const moved = state.dragStartDoc !== state.document;
    set({
      dragStartDoc: null,
      ...(moved ? pushHistory(state, state.dragStartDoc) : {}),
    });
  },

  rotateSelection() {
    const state = get();
    const ids = selectedComponentIds(state);
    if (ids.length === 0) return;
    let doc = state.document;
    for (const id of ids) {
      doc = rotateComponent(doc, id);
      doc = rerouteAttachedWires(doc, id);
    }
    set({ document: doc, ...pushHistory(state, state.document) });
  },

  copySelection() {
    const state = get();
    const ids = selectedComponentIds(state);
    if (ids.length === 0) return;
    const group = extractGroup(state.document, ids);
    set({
      clipboard: group,
      pasteSteps: 0,
      statusMessage:
        group.components.length > 1
          ? `부품 ${group.components.length}개와 그 사이 배선 ${group.wires.length}개를 복사했습니다 — Ctrl+V로 붙여넣기`
          : "부품을 복사했습니다 — Ctrl+V로 붙여넣기",
    });
  },

  pasteClipboard() {
    const state = get();
    const group = state.clipboard;
    if (!group || group.components.length === 0) return;
    // 연속으로 붙여넣으면 단계마다 더 어긋나게 쌓인다
    const steps = state.pasteSteps + 1;
    const delta = PASTE_OFFSET * steps;
    const { doc, componentIds } = pasteGroup(state.document, group, { x: delta, y: delta });
    set({
      document: doc,
      ...pushHistory(state, state.document),
      selection: componentIds.length === 1 ? { type: "component", id: componentIds[0] } : null,
      selectedIds: componentIds,
      pasteSteps: steps,
      statusMessage: null,
    });
  },

  selectArea(ids) {
    set({
      selectedIds: ids,
      selection: ids.length === 1 ? { type: "component", id: ids[0] } : null,
      statusMessage: ids.length > 1 ? `부품 ${ids.length}개 선택됨` : null,
    });
  },

  toggleSelected(id) {
    const state = get();
    const current = selectedComponentIds(state);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    set({
      selectedIds: next,
      selection: next.length === 1 ? { type: "component", id: next[0] } : null,
      statusMessage: next.length > 1 ? `부품 ${next.length}개 선택됨` : null,
    });
  },

  deleteSelection() {
    const state = get();
    const ids = selectedComponentIds(state);
    if (ids.length > 0) {
      let doc = state.document;
      for (const id of ids) doc = deleteComponent(doc, id);
      set({
        document: doc,
        ...pushHistory(state, state.document),
        selection: null,
        selectedIds: [],
      });
      return;
    }
    if (state.selection?.type !== "wire") return;
    const doc = deleteWire(state.document, state.selection.id);
    set({ document: doc, ...pushHistory(state, state.document), selection: null });
  },

  setProperty(componentId, key, value) {
    const state = get();
    const doc = updateComponentProperty(state.document, componentId, key, value);
    set({ document: doc, ...pushHistory(state, state.document) });
  },

  startWire(from) {
    set({ pendingWireFrom: from, placingType: null, selection: null, selectedIds: [], statusMessage: null });
  },

  completeWire(to) {
    const state = get();
    const from = state.pendingWireFrom;
    if (!from) return;

    const check = canConnect(state.document, from, to);
    if (!check.ok) {
      set({ statusMessage: `연결 불가: ${check.reason}` });
      return;
    }

    const doc = autoWire(state.document, from, to);
    set({
      document: doc,
      ...pushHistory(state, state.document),
      pendingWireFrom: null,
      statusMessage: null,
    });
  },

  cancelWire() {
    set({ pendingWireFrom: null });
  },

  select(sel) {
    // 단일 선택은 다중 선택 집합도 함께 맞춘다 (Phase 18)
    set({
      selection: sel,
      selectedIds: sel?.type === "component" ? [sel.id] : [],
      statusMessage: null,
    });
  },

  setViewport(v) {
    set({ viewport: v });
  },

  setStatus(msg) {
    set({ statusMessage: msg });
  },

  togglePlcPanel() {
    set((s) => ({ plcPanelOpen: !s.plcPanelOpen }));
  },

  toggleEquipmentView() {
    set((s) => ({ equipmentViewOpen: !s.equipmentViewOpen }));
  },

  toggleDiagramPanel() {
    set((s) => ({ diagramPanelOpen: !s.diagramPanelOpen }));
  },

  commitDocument(doc) {
    const state = get();
    set({ document: doc, ...pushHistory(state, state.document) });
  },

  undo() {
    let state = get();
    // 드래그 도중이면 먼저 드래그를 취소해 시작 스냅숏 재커밋을 막는다 (codex-review M9)
    if (state.dragStartDoc) {
      set({ document: state.dragStartDoc, dragStartDoc: null });
      state = get();
    }
    if (state.past.length === 0) return;
    const prev = state.past[state.past.length - 1];
    set({
      document: prev,
      past: state.past.slice(0, -1),
      future: [state.document, ...state.future],
      selection: null,
    });
  },

  redo() {
    let state = get();
    if (state.dragStartDoc) {
      set({ document: state.dragStartDoc, dragStartDoc: null });
      state = get();
    }
    if (state.future.length === 0) return;
    const next = state.future[0];
    set({
      document: next,
      past: [...state.past, state.document],
      future: state.future.slice(1),
      selection: null,
    });
  },
}));
