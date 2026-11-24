import { useEffect, useRef, useState, type ReactElement } from "react";
import { useEditorStore } from "./store";
import { clearSimHistory, useSimStore } from "../sim/simStore";
import { downloadDocument, exportCircuitSvg, openDocumentFile } from "../../app/file";
import { examples, exampleMode, getExample } from "../../core/examples";
import { createBrowserStorage } from "../../core/storage";
import { prepareDocumentForPersistence } from "../../core/model/schema";
import { useI18nStore, useT } from "../i18n";
import { APP_VERSION, forceRefreshToLatest } from "../../app/refresh";

const browserStorage = createBrowserStorage();

export function Toolbar(): ReactElement {
  const title = useEditorStore((s) => s.document.meta.title);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const hasComponentSelection = useEditorStore((s) => s.selection?.type === "component");
  const hasComponents = useEditorStore((s) => s.document.components.length > 0);
  // 부품이 하나라도 선택됐는지 (단일·다중) / 삭제할 것이 있는지 (배선 포함)
  const hasPartSelection = useEditorStore(
    (s) => s.selectedIds.length > 0 || s.selection?.type === "component",
  );
  const hasAnySelection = useEditorStore((s) => s.selectedIds.length > 0 || s.selection !== null);
  const hasClipboard = useEditorStore((s) => (s.clipboard?.components.length ?? 0) > 0);
  const multiSelectMode = useEditorStore((s) => s.multiSelectMode);
  const plcOpen = useEditorStore((s) => s.plcPanelOpen);
  const equipmentOpen = useEditorStore((s) => s.equipmentViewOpen);
  const diagramOpen = useEditorStore((s) => s.diagramPanelOpen);
  const appMode = useEditorStore((s) => s.appMode) ?? "circuit";
  const circuit = appMode === "circuit";
  // PLC 래더 모드는 부품 없이 래더만으로 실행한다
  const canRun = hasComponents || appMode === "plc";
  const modeExamples = examples.filter((ex) => exampleMode(ex) === appMode);
  const running = useSimStore((s) => s.running);
  const stepPaused = useSimStore((s) => s.paused);
  const t = useT();
  const lang = useI18nStore((s) => s.lang);

  /** 미저장 작업 폐기 확인 — 새 회로/파일 열기/예제/브라우저 열기 공통 정책 (codex-review H5).
   *  저장 기준점 이후 변경(제목·PLC·속성 포함)이 있을 때만 묻는다 (review-2 P0). */
  const confirmDiscard = (): boolean => {
    const s = useEditorStore.getState();
    if (!s.isDirty()) return true;
    return window.confirm("현재 회로를 버릴까요? 저장하지 않은 변경은 사라집니다.");
  };

  /**
   * 저장 직전 문서를 저장 경계로 정규화하고 스토어에 반영한다 (review P1).
   * 학습 활동 설명 자동 채움·trim·500자 상한이 core 단일 경계에서 처리되며,
   * 스토어를 저장본과 일치시켜 이후 markSaved()의 dirty 판정이 정확해진다.
   */
  const syncForSave = () => {
    const s = useEditorStore.getState();
    const prepared = prepareDocumentForPersistence(s.document);
    s.setLearningActivity(prepared.meta.learningActivity ?? "");
  };

  const handleNew = () => {
    if (!confirmDiscard()) return;
    clearSimHistory();
    useEditorStore.getState().newDocument();
  };

  const handleOpen = async () => {
    const result = await openDocumentFile();
    const s = useEditorStore.getState();
    if (result.cancelled) return;
    if (result.ok && result.document) {
      if (!confirmDiscard()) return;
      clearSimHistory();
      s.loadDocument(result.document);
    } else if (result.error) {
      s.setStatus(`열기 실패: ${result.error}`);
    }
  };

  const handleRun = (mode: "continuous" | "step") => {
    const sim = useSimStore.getState();
    if (running) {
      sim.stop();
      useEditorStore.getState().setStatus("시뮬레이션을 정지했습니다.");
      return;
    }
    sim.start(mode);
    const { warnings } = useSimStore.getState();
    if (warnings.length > 0) {
      const head = warnings.slice(0, 2).join(" · ");
      const more = warnings.length > 2 ? ` 외 ${warnings.length - 2}건` : "";
      useEditorStore.getState().setStatus(`⚠ ${head}${more}`);
    } else {
      useEditorStore.getState().setStatus(null);
    }
  };

  // 브라우저 저장소 목록 갱신 트리거
  const [storageVersion, setStorageVersion] = useState(0);
  const storedDocs = browserStorage ? browserStorage.list() : [];
  void storageVersion;

  const handleBrowserSave = () => {
    if (!browserStorage) return;
    syncForSave();
    const s = useEditorStore.getState();
    const name = s.document.meta.title || "제목 없음";
    if (browserStorage.save(name, s.document)) {
      setStorageVersion((v) => v + 1);
      s.markSaved();
      s.setStatus(`브라우저에 "${name}" 저장 완료 (파일 없이 이 PC에 보관됩니다)`);
    } else {
      s.setStatus("브라우저 저장 실패 — 저장 공간이 가득 찼거나 사생활 보호 모드일 수 있습니다. .json 파일 저장을 이용하세요.");
    }
  };

  const handleBrowserOpen = (name: string) => {
    if (!browserStorage || !name) return;
    if (!confirmDiscard()) return;
    const s = useEditorStore.getState();
    const doc = browserStorage.load(name);
    if (doc) {
      clearSimHistory();
      s.loadDocument(doc);
    }
    else s.setStatus(`"${name}"을(를) 불러오지 못했습니다.`);
  };

  const handleBrowserDelete = () => {
    if (!browserStorage) return;
    const s = useEditorStore.getState();
    const name = s.document.meta.title;
    if (!storedDocs.some((d) => d.name === name)) {
      s.setStatus(`브라우저 저장소에 "${name}"이(가) 없습니다.`);
      return;
    }
    if (!window.confirm(`브라우저 저장소에서 "${name}"을(를) 삭제할까요?`)) return;
    if (browserStorage.delete(name)) s.setStatus(`"${name}" 삭제 완료`);
    else s.setStatus(`"${name}" 삭제 실패 — 저장소에 접근할 수 없습니다.`);
    setStorageVersion((v) => v + 1);
  };

  /** 회로도 캔버스 중앙 기준 확대/축소 (Phase 24 — 휠이 없는 태블릿용) */
  const zoomCanvas = (factor: number) => {
    const rect = document.querySelector(".editor-canvas")?.getBoundingClientRect();
    useEditorStore.getState().zoomAt(factor, rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 });
  };

  /** 처음 화면으로 — 모드를 바꾸면 지금 문서를 그 모드에서 이어 쓸 수 없으므로 미저장 확인 */
  const handleSwitchMode = () => {
    if (running) useSimStore.getState().stop();
    useEditorStore.getState().leaveMode();
  };

  const handleExample = (id: string) => {
    if (!id) return;
    const example = getExample(id);
    if (!example) return;
    if (!confirmDiscard()) return;
    clearSimHistory();
    useEditorStore.getState().loadDocument(example.build());
  };

  const exampleSelect = (
    <select
      className="example-select"
      value=""
      disabled={running}
      onChange={(e) => handleExample(e.target.value)}
      aria-label={t("openExample")}
    >
      <option value="">{t("openExample")}</option>
      {[...new Set(modeExamples.map((ex) => ex.category))].map((category) => (
        <optgroup key={category} label={category}>
          {modeExamples
            .filter((ex) => ex.category === category)
            .map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );

  return (
    <header className={`toolbar${circuit ? " has-tools" : ""}`}>
      {/* 1단: 앱 막대 — 정체(모드)·문서·실행·메뉴 (Phase 38: 세 줄로 흩어지던 버튼을 묶음) */}
      <div className="appbar">
        <span className="app-name" title="교육용 논리/상태 시뮬레이션입니다. 실제 설비 선정·압력 설정·안전 검증에는 쓰지 마세요.">
          HYD
        </span>
        {/* 지금 모드 + 처음 화면으로 (Phase 37) */}
        <button className="mode-chip" onClick={handleSwitchMode} title={t("modeSwitch")}>
          <span className="mode-chip-name">
            {circuit ? t("modeCircuit") : appMode === "plc" ? t("modePlc") : t("modeConveyor")}
          </span>
          <span className="mode-chip-action">{t("modeSwitch")}</span>
        </button>
        <input
          className="title-input"
          value={title}
          disabled={running}
          onChange={(e) => useEditorStore.getState().setTitle(e.target.value)}
          placeholder={circuit ? t("titlePlaceholder") : t("taskTitlePlaceholder")}
          aria-label={circuit ? t("titlePlaceholder") : t("taskTitlePlaceholder")}
        />
        <div className="run-group">
          <button
            className={`run-button${running ? " running" : ""}`}
            disabled={!running && !canRun}
            onClick={() => handleRun("continuous")}
            title={running ? undefined : "연속동작 실행"}
          >
            {running ? t("stop") : t("run")}
          </button>
          {!running && (
            <button
              className="run-button step"
              disabled={!canRun}
              onClick={() => handleRun("step")}
              title="구분동작 실행 — 동작 하나가 끝날 때마다 일시정지"
            >
              {t("runStep")}
            </button>
          )}
          {running && stepPaused && (
            <button className="run-button next-step" onClick={() => useSimStore.getState().advanceStep()}>
              {t("nextStep")}
            </button>
          )}
        </div>
        {exampleSelect}
        <Menu label={t("fileMenu")} disabled={running}>
          <button onClick={handleNew}>{circuit ? t("newCircuit") : t("newTask")}</button>
          <button onClick={handleOpen}>{t("open")}</button>
          <button
            onClick={() => {
              syncForSave();
              const s = useEditorStore.getState();
              downloadDocument(s.document);
              s.markSaved();
            }}
          >
            {t("saveJson")}
          </button>
          {circuit && (
            <button disabled={!hasComponents} onClick={() => exportCircuitSvg(title || "circuit")}>
              {t("exportSvg")}
            </button>
          )}
          {browserStorage && (
            <>
              <hr />
              <button disabled={!canRun} onClick={handleBrowserSave} title="파일 없이 이 브라우저에 저장">
                {t("browserSave")}
              </button>
              <span className="tb-menu-heading">{t("browserSavedList")}</span>
              {storedDocs.length === 0 && <span className="tb-menu-empty">{t("browserSavedEmpty")}</span>}
              {storedDocs.map((d) => (
                <button key={d.name} className="tb-menu-doc" onClick={() => handleBrowserOpen(d.name)}>
                  {d.name}
                </button>
              ))}
              <button className="tb-menu-danger" onClick={handleBrowserDelete} title="현재 제목과 같은 저장 항목 삭제">
                {t("delete")}
              </button>
            </>
          )}
        </Menu>
        <div className="toolbar-end">
          {/* 좁은 화면에서는 화살표만 남긴다 — 이름은 title·aria-label로 유지 */}
          <button
            className="quiet"
            disabled={running || !canUndo}
            onClick={() => useEditorStore.getState().undo()}
            title={t("undo").replace(/^\S+\s/, "")}
            aria-label={t("undo").replace(/^\S+\s/, "")}
          >
            <span aria-hidden="true">{t("undo").split(" ")[0]}</span>
            <span className="tb-collapsible">{t("undo").replace(/^\S+\s/, "")}</span>
          </button>
          <button
            className="quiet"
            disabled={running || !canRedo}
            onClick={() => useEditorStore.getState().redo()}
            title={t("redo").replace(/^\S+\s/, "")}
            aria-label={t("redo").replace(/^\S+\s/, "")}
          >
            <span aria-hidden="true">{t("redo").split(" ")[0]}</span>
            <span className="tb-collapsible">{t("redo").replace(/^\S+\s/, "")}</span>
          </button>
          <button className="quiet" onClick={() => useI18nStore.getState().toggle()} title="한국어 / English">
            {lang === "ko" ? "EN" : "한"}
          </button>
          {/* 브라우저마다 강력 새로고침 동작이 달라(특히 Safari) 확실한 탈출구를 버튼으로
              제공한다 — 워커 해제 + 캐시 삭제 + 캐시 무효화 재접속 (Phase 19-3) */}
          <button
            className="quiet"
            onClick={() => void forceRefreshToLatest()}
            title={`현재 버전 ${APP_VERSION} — 저장된 캐시를 지우고 최신 버전을 새로 받습니다`}
          >
            {t("forceRefresh")}
          </button>
        </div>
      </div>

      {/* 2단: 회로 도구 — 공유압 회로 모드에서만 (편집 · 보기) */}
      {circuit && (
        <div className="toolrow" role="toolbar" aria-label="회로 도구">
          <div className="toolbar-group">
            {/* 회전은 단축키 R로도 되지만 버튼이 없으면 발견하기 어렵다 (Phase 16-2) */}
            <button
              disabled={running || !hasComponentSelection}
              onClick={() => useEditorStore.getState().rotateSelection()}
              title="선택한 부품을 90° 회전 (단축키: R)"
            >
              {t("rotate")}
            </button>
            {/* 선택 편집 (Phase 24) — 키보드 단축키(Delete·Ctrl+C/V·Shift)가 없는 태블릿에서도
                같은 동작을 할 수 있게 버튼으로 노출한다 */}
            <button
              className={multiSelectMode ? "plc-toggle-on" : undefined}
              disabled={running}
              onClick={() => useEditorStore.getState().toggleMultiSelectMode()}
              title="켜면 부품 탭 = 선택 추가/제거, 빈 곳 드래그 = 영역 선택 (PC에서는 Shift와 같음)"
            >
              {t("multiSelect")}
            </button>
            <button
              disabled={running || !hasPartSelection}
              onClick={() => useEditorStore.getState().copySelection()}
              title="선택한 부품과 그 사이 배선을 복사 (단축키: Ctrl+C)"
            >
              {t("copy")}
            </button>
            <button
              disabled={running || !hasClipboard}
              onClick={() => useEditorStore.getState().pasteClipboard()}
              title="복사한 부품을 붙여넣기 (단축키: Ctrl+V)"
            >
              {t("paste")}
            </button>
            <button
              className="delete-parts"
              disabled={running || !hasAnySelection}
              onClick={() => useEditorStore.getState().deleteSelection()}
              title="선택한 부품(연결된 배선 포함) 또는 배선을 삭제 (단축키: Delete)"
            >
              {t("deleteParts")}
            </button>
          </div>
          <div className="toolbar-group">
            <button onClick={() => zoomCanvas(1 / 1.25)} title="축소" aria-label="축소">
              {t("zoomOut")}
            </button>
            <button onClick={() => zoomCanvas(1.25)} title="확대" aria-label="확대">
              {t("zoomIn")}
            </button>
            <button onClick={() => useEditorStore.getState().setViewport({ x: 0, y: 0, zoom: 1 })}>
              {t("resetView")}
            </button>
          </div>
          <div className="toolbar-group" aria-label="함께 보기">
            <button
              className={plcOpen ? "plc-toggle-on" : undefined}
              aria-pressed={plcOpen}
              onClick={() => useEditorStore.getState().togglePlcPanel()}
            >
              {t("plcLadder")}
            </button>
            <button
              className={equipmentOpen ? "plc-toggle-on" : undefined}
              aria-pressed={equipmentOpen}
              onClick={() => useEditorStore.getState().toggleEquipmentView()}
            >
              {t("equipmentView")}
            </button>
            <button
              className={diagramOpen ? "plc-toggle-on" : undefined}
              aria-pressed={diagramOpen}
              onClick={() => useEditorStore.getState().toggleDiagramPanel()}
            >
              {t("diagram")}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

/**
 * 툴바 펼침 메뉴 (Phase 38) — 파일·브라우저 저장처럼 가끔 쓰는 동작을 한곳에 묶는다.
 * 항목을 누르거나 바깥을 누르면 닫히고, Esc로도 닫힌다.
 */
function Menu({ label, disabled, children }: { label: string; disabled?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details className={`tb-menu${disabled ? " disabled" : ""}`} ref={ref}>
      <summary aria-disabled={disabled}>{label}</summary>
      <div
        className="tb-menu-panel"
        onClick={(e) => {
          if ((e.target as Element).closest("button") && ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
