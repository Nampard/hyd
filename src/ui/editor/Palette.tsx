import type { ReactElement } from "react";
import { listByCategory } from "../../core/library/registry";
import { getSymbol } from "../symbols";
import { defaultProperties } from "../../core/library/types";
import { useEditorStore } from "./store";
import { useSimStore } from "../sim/simStore";
import { useT } from "../i18n";

export function Palette(): ReactElement {
  const placingType = useEditorStore((s) => s.placingType);
  const running = useSimStore((s) => s.running);
  const t = useT();
  const groups = listByCategory();

  return (
    <div className="palette">
      <h2 className="panel-title">{t("parts")}</h2>
      {[...groups.entries()].map(([category, defs]) => (
        <div key={category} className="palette-group">
          <h3 className="palette-category">{category}</h3>
          {defs.map((def) => {
            const Symbol = getSymbol(def.symbolId);
            const b = def.bounds;
            const pad = 8;
            const active = placingType === def.type;
            return (
              <button
                key={def.type}
                className={`palette-item${active ? " active" : ""}`}
                title={`${def.name} — 클릭 후 캔버스에 배치`}
                disabled={running}
                onClick={() => {
                  const s = useEditorStore.getState();
                  if (active) s.cancelPlacing();
                  else s.startPlacing(def.type);
                }}
              >
                <svg
                  viewBox={`${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`}
                  className="palette-thumb"
                >
                  <g color="var(--symbol)">
                    <Symbol properties={defaultProperties(def)} />
                  </g>
                </svg>
                <span className="palette-name">{def.name}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
