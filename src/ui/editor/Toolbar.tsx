import { useState, type ReactElement } from "react";
import { useEditorStore } from "./store";
import { clearSimHistory, useSimStore } from "../sim/simStore";
import { downloadDocument, exportCircuitSvg, openDocumentFile } from "../../app/file";
import { examples, getExample } from "../../core/examples";
import { createBrowserStorage } from "../../core/storage";
import { prepareDocumentForPersistence } from "../../core/model/schema";
import { useI18nStore, useT } from "../i18n";

const browserStorage = createBrowserStorage();

export function Toolbar(): ReactElement {
  const title = useEditorStore((s) => s.document.meta.title);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const hasComponentSelection = useEditorStore((s) => s.selection?.type === "component");
  const hasComponents = useEditorStore((s) => s.document.components.length > 0);
  const plcOpen = useEditorStore((s) => s.plcPanelOpen);
  const equipmentOpen = useEditorStore((s) => s.equipmentViewOpen);
  const diagramOpen = useEditorStore((s) => s.diagramPanelOpen);
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

  const handleExample = (id: string) => {
    if (!id) return;
    const example = getExample(id);
    if (!example) return;
    if (!confirmDiscard()) return;
    clearSimHistory();
    useEditorStore.getState().loadDocument(example.build());
  };

  return (
    <div className="toolbar">
      <span className="app-name" title="교육용 논리/상태 시뮬레이션 — 실제 설비 선정·압력 설정·안전 검증에 사용 금지">
        HYD
      </span>
      <span className="app-tagline">{t("appTagline")}</span>
      <input
        className="title-input"
        value={title}
        disabled={running}
        onChange={(e) => useEditorStore.getState().setTitle(e.target.value)}
        placeholder={t("titlePlaceholder")}
      />
      <button
        className={`run-button${running ? " running" : ""}`}
        disabled={!running && !hasComponents}
        onClick={() => handleRun("continuous")}
        title={running ? undefined : "연속동작 실행"}
      >
        {running ? t("stop") : t("run")}
      </button>
      {!running && (
        <button
          className="run-button step"
          disabled={!hasComponents}
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
      <div className="toolbar-group">
        <select
          className="example-select"
          value=""
          disabled={running}
          onChange={(e) => handleExample(e.target.value)}
        >
          <option value="">{t("openExample")}</option>
          {[...new Set(examples.map((ex) => ex.category))].map((category) => (
            <optgroup key={category} label={category}>
              {examples
                .filter((ex) => ex.category === category)
                .map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="toolbar-group">
        <button disabled={running} onClick={handleNew}>
          {t("newCircuit")}
        </button>
        <button disabled={running} onClick={handleOpen}>
          {t("open")}
        </button>
        <button
          disabled={running}
          onClick={() => {
            syncForSave();
            const s = useEditorStore.getState();
            downloadDocument(s.document);
            s.markSaved();
          }}
        >
          {t("saveJson")}
        </button>
      </div>
      {browserStorage && (
        <div className="toolbar-group">
          <button disabled={running || !hasComponents} onClick={handleBrowserSave} title="파일 없이 이 브라우저에 저장">
            {t("browserSave")}
          </button>
          <select
            className="example-select"
            value=""
            disabled={running}
            onChange={(e) => handleBrowserOpen(e.target.value)}
          >
            <option value="">{t("browserOpen")}</option>
            {storedDocs.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} (부품 {d.componentCount})
              </option>
            ))}
          </select>
          <button disabled={running} onClick={handleBrowserDelete} title="현재 제목과 같은 저장 항목 삭제">
            {t("delete")}
          </button>
        </div>
      )}
      <div className="toolbar-group">
        <button disabled={running || !canUndo} onClick={() => useEditorStore.getState().undo()}>
          {t("undo")}
        </button>
        <button disabled={running || !canRedo} onClick={() => useEditorStore.getState().redo()}>
          {t("redo")}
        </button>
        {/* 회전은 단축키 R로도 되지만 버튼이 없으면 발견하기 어렵다 (Phase 16-2) */}
        <button
          disabled={running || !hasComponentSelection}
          onClick={() => useEditorStore.getState().rotateSelection()}
          title="선택한 부품을 90° 회전 (단축키: R)"
        >
          {t("rotate")}
        </button>
      </div>
      <div className="toolbar-group">
        <button onClick={() => useEditorStore.getState().setViewport({ x: 0, y: 0, zoom: 1 })}>
          {t("resetView")}
        </button>
        <button
          className={plcOpen ? "plc-toggle-on" : undefined}
          onClick={() => useEditorStore.getState().togglePlcPanel()}
        >
          {t("plcLadder")}
        </button>
        <button
          className={equipmentOpen ? "plc-toggle-on" : undefined}
          onClick={() => useEditorStore.getState().toggleEquipmentView()}
        >
          {t("equipmentView")}
        </button>
        <button
          className={diagramOpen ? "plc-toggle-on" : undefined}
          onClick={() => useEditorStore.getState().toggleDiagramPanel()}
        >
          {t("diagram")}
        </button>
        <button
          disabled={!hasComponents}
          onClick={() => exportCircuitSvg(title || "circuit")}
          title="회로도를 SVG 파일로 내보내기 (인쇄용)"
        >
          {t("exportSvg")}
        </button>
        <button onClick={() => useI18nStore.getState().toggle()} title="한국어 / English">
          {lang === "ko" ? "EN" : "한"}
        </button>
      </div>
    </div>
  );
}
