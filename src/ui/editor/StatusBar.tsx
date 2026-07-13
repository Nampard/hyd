import type { ReactElement } from "react";
import { useEditorStore } from "./store";
import { useSimStore } from "../sim/simStore";
import { useT } from "../i18n";

export function StatusBar(): ReactElement {
  const message = useEditorStore((s) => s.statusMessage);
  const zoom = useEditorStore((s) => s.viewport.zoom);
  const placingType = useEditorStore((s) => s.placingType);
  const pendingWire = useEditorStore((s) => s.pendingWireFrom);
  const componentCount = useEditorStore((s) => s.document.components.length);
  const wireCount = useEditorStore((s) => s.document.wires.length);
  const running = useSimStore((s) => s.running);
  const simTime = useSimStore((s) => s.snapshot?.time ?? 0);
  const t = useT();

  let hint = message;
  if (!hint) {
    if (running) hint = t("statusRunning");
    else if (placingType) hint = t("statusPlacing");
    else if (pendingWire) hint = t("statusWiring");
    else hint = t("statusDefault");
  }

  return (
    <div className={`status-bar${running ? " running" : ""}`}>
      <span className="status-message">{hint}</span>
      <span className="status-right">
        {running && <span className="sim-time">t = {simTime.toFixed(1)}s · </span>}
        {t("countParts")} {componentCount} · {t("countWires")} {wireCount} · {Math.round(zoom * 100)}%
      </span>
    </div>
  );
}
