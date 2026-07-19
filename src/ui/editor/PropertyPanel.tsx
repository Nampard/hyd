import type { ReactElement } from "react";
import { useEditorStore } from "./store";
import { useSimStore } from "../sim/simStore";
import { getComponent } from "../../core/model/operations";
import { getComponentDefinition } from "../../core/library/registry";
import type { PropertyField } from "../../core/library/types";
import { summarizeLearningActivity } from "../../core/model/learning-activity";
import { MAX_LEARNING_ACTIVITY } from "../../core/model/schema";
import { parseWorkpieceQueueStrict, MPS_MAGAZINE_MAX } from "../../core/sim/mps-station";
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
  const running = useSimStore((s) => s.running);
  const t = useT();

  if (selection?.type !== "component") {
    const activity = doc.meta.learningActivity ?? "";
    // 회로가 바뀌어 저장된 설명이 현재 자동 초안과 다르면 안내 (수동 수정분은 존중, 재작성은 선택)
    const autoDraft = doc.components.length > 0 ? summarizeLearningActivity(doc) : "";
    const stale = activity.trim() !== "" && autoDraft !== "" && activity.trim() !== autoDraft;
    return (
      <div className="property-panel">
        <h2 className="panel-title">{t("properties")}</h2>
        <p className="panel-empty">
          {selection?.type === "wire" ? t("wireSelected") : t("selectHint")}
        </p>
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
              disabled={running || doc.components.length === 0}
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
        // MPS 물품 큐: 인식 불가 토큰·개수 초과를 조용히 버리지 않고 경고 (codex-review P2-2)
        const queueWarn =
          field.key === "workpieces" &&
          def.behavior?.role === "mps-station" &&
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
                ⚠ 금/비(또는 금속/비금속)만 인식합니다. 인식 불가 토큰은 무시되며, 최대 {MPS_MAGAZINE_MAX}개까지입니다.
              </span>
            )}
          </label>
        );
      })}
      <div className="property-hint">
        {running ? t("simEditLock") : t("editHint")}
      </div>
    </div>
  );
}
