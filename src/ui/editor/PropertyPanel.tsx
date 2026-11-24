import type { ReactElement } from "react";
import { useEditorStore } from "./store";
import { useSimStore } from "../sim/simStore";
import { getComponent } from "../../core/model/operations";
import { getComponentDefinition } from "../../core/library/registry";
import type { PropertyField } from "../../core/library/types";
import { summarizeLearningActivity } from "../../core/model/learning-activity";
import { MAX_LEARNING_ACTIVITY } from "../../core/model/schema";
import { parseWorkpieceQueueStrict, AUTOMATION_MAGAZINE_MAX } from "../../core/sim/automation-station";
import { useT } from "../i18n";

function FieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: PropertyField;
  value: unknown;
  disabled: boolean;
  onChange(value: unknown): void;
}): ReactElement {
  switch (field.type) {
    case "number":
      return (
        <span className="field-input-row">
          <input
            type="number"
            value={value as number}
            min={field.min}
            max={field.max}
            step={field.step}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          {field.unit && <span className="field-unit">{field.unit}</span>}
        </span>
      );
    case "text":
      return (
        <input
          type="text"
          value={value as string}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={value as boolean}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "select":
      return (
        <select value={value as string} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
  }
}

export function PropertyPanel(): ReactElement {
  const doc = useEditorStore((s) => s.document);
  const selection = useEditorStore((s) => s.selection);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const running = useSimStore((s) => s.running);
  const conveyor = useEditorStore((s) => s.appMode === "conveyor");
  const plcMode = useEditorStore((s) => s.appMode === "plc");
  const t = useT();

  if (selection?.type !== "component") {
    return (
      <div className="property-panel">
        <h2 className="panel-title">{t("properties")}</h2>
        {!plcMode && (
          <p className="panel-empty">
            {selectedIds.length > 1
              ? `부품 ${selectedIds.length}개 선택됨 — Ctrl+C로 복사, R로 회전, Delete로 삭제`
              : selection?.type === "wire"
                ? t("wireSelected")
                : t("selectHint")}
          </p>
        )}
        <LearningActivityField />
      </div>
    );
  }

  const comp = getComponent(doc, selection.id);
  if (!comp) return <div className="property-panel" />;
  const def = getComponentDefinition(comp.type);

  return (
    <div className="property-panel">
      <h2 className="panel-title">{t("properties")}</h2>
      <div className="property-header">{def.name}</div>
      {def.propertySchema.length === 0 && <p className="panel-empty">{t("noProperties")}</p>}
      {def.propertySchema.map((field) => {
        // 자동화설비 스테이션 물품 큐: 인식 불가 토큰·개수 초과를 조용히 버리지 않고 경고 (codex-review P2-2)
        const queueWarn =
          field.key === "workpieces" &&
          def.behavior?.role === "automation-station" &&
          parseWorkpieceQueueStrict(comp.properties[field.key]).error;
        return (
          <label key={field.key} className="property-field">
            <span className="field-label">{field.label}</span>
            <FieldInput
              field={field}
              value={comp.properties[field.key]}
              disabled={running}
              onChange={(value) => useEditorStore.getState().setProperty(comp.id, field.key, value)}
            />
            {queueWarn && (
              <span className="field-warn">
                ⚠ 금/비(또는 금속/비금속)만 인식합니다. 인식 불가 토큰은 무시되며, 최대 {AUTOMATION_MAGAZINE_MAX}개까지입니다.
              </span>
            )}
          </label>
        );
      })}
      {/* 컨베이어 모드에는 회전·삭제할 부품이 없다 — 대신 과제 전체의 학습 활동 칸을 함께 보인다 (Phase 37) */}
      {(running || !conveyor) && <div className="property-hint">{running ? t("simEditLock") : t("editHint")}</div>}
      {conveyor && <LearningActivityField />}
    </div>
  );
}

/** 학습 활동 설명 (Phase 12) — 문서 전체에 대한 메타 정보라 선택과 무관하게 같은 칸을 쓴다 */
function LearningActivityField(): ReactElement {
  const doc = useEditorStore((s) => s.document);
  const running = useSimStore((s) => s.running);
  const t = useT();
  const activity = doc.meta.learningActivity ?? "";
  // 회로가 바뀌어 저장된 설명이 현재 자동 초안과 다르면 안내 (수동 수정분은 존중, 재작성은 선택)
  // 부품이 없어도 래더만 있는 문서(PLC 래더 모드)는 초안이 나온다 (Phase 38)
  const autoDraft = summarizeLearningActivity(doc);
  const stale = activity.trim() !== "" && autoDraft !== "" && activity.trim() !== autoDraft;
  return (
    <div className="doc-meta-field">
      <label className="field-label" htmlFor="learning-activity-input">
        {t("learningActivityLabel")}
      </label>
      <textarea
        id="learning-activity-input"
        className="learning-activity-input"
        rows={3}
        maxLength={MAX_LEARNING_ACTIVITY}
        value={activity}
        disabled={running}
        placeholder={t("learningActivityPlaceholder")}
        aria-describedby="learning-activity-hint"
        onChange={(e) => useEditorStore.getState().setLearningActivity(e.target.value)}
      />
      <div className="learning-activity-meta">
        <button
          type="button"
          className="learning-activity-autofill"
          disabled={running || autoDraft === ""}
          onClick={() => useEditorStore.getState().setLearningActivity(summarizeLearningActivity(doc))}
        >
          {t("learningActivityAutoFill")}
        </button>
        <span className="learning-activity-count">
          {activity.length}/{MAX_LEARNING_ACTIVITY}
        </span>
      </div>
      {stale && <p className="doc-meta-warn">{t("learningActivityStale")}</p>}
      <p id="learning-activity-hint" className="doc-meta-hint">
        {t("learningActivityHint")}
      </p>
    </div>
  );
}

