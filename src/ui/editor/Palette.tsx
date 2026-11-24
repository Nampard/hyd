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
  // 채널로 물리는 복합 장비(자동화설비 스테이션)는 컨베이어 모드 전용 — 회로 팔레트에서 뺀다 (Phase 37)
  const groups = new Map(
    [...listByCategory().entries()]
      .map(([category, defs]) => [category, defs.filter((d) => !d.ioChannels?.length)] as const)
      .filter(([, defs]) => defs.length > 0),
  );

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
