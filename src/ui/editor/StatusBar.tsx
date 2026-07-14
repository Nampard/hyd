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
  const mode = useSimStore((s) => s.mode);
  const stepPaused = useSimStore((s) => s.paused);
  const lastStep = useSimStore((s) => s.lastStep);
  const simTime = useSimStore((s) => s.snapshot?.time ?? 0);
  const diagnostics = useSimStore((s) => s.snapshot?.diagnostics);
  const t = useT();

  // 솔버 미수렴 = 자기모순 회로(NC 자기 궤환 등) 가능성 — 최우선 경고 (review-2 P0)
  const unstable =
    running && diagnostics && (!diagnostics.electricConverged || !diagnostics.fluidConverged);

  let hint = message;
  if (unstable) hint = t("statusUnstable");
  if (!hint) {
    if (running && mode === "step") {
      if (stepPaused && lastStep) {
        hint = (lastStep.cycleComplete ? t("statusStepCycle") : t("statusStepPaused")).replace(
          "{n}",
          String(lastStep.step),
        );
      } else {
        hint = t("statusStepRunning");
      }
    } else if (running) hint = t("statusRunning");
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
