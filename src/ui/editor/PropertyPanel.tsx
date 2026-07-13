import type { ReactElement } from "react";
import { useEditorStore } from "./store";
import { useSimStore } from "../sim/simStore";
import { getComponent } from "../../core/model/operations";
import { getComponentDefinition } from "../../core/library/registry";
import type { PropertyField } from "../../core/library/types";
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
    return (
      <div className="property-panel">
        <h2 className="panel-title">{t("properties")}</h2>
        <p className="panel-empty">
          {selection?.type === "wire" ? t("wireSelected") : t("selectHint")}
        </p>
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
      {def.propertySchema.map((field) => (
        <label key={field.key} className="property-field">
          <span className="field-label">{field.label}</span>
          <FieldInput
            field={field}
            value={comp.properties[field.key]}
            disabled={running}
            onChange={(value) => useEditorStore.getState().setProperty(comp.id, field.key, value)}
          />
        </label>
      ))}
      <div className="property-hint">
        {running ? t("simEditLock") : t("editHint")}
      </div>
    </div>
  );
}
