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

  // 우선순위: 미수렴 경고 > 구분동작 일시정지 안내 > 일반 메시지 > 모드별 기본 안내
  // (경고 메시지가 다음 동작 진행법을 가리지 않도록, review-3 P1)
  let hint = message;
  if (running && mode === "step" && stepPaused && lastStep) {
    hint = (lastStep.cycleComplete ? t("statusStepCycle") : t("statusStepPaused")).replace(
      "{n}",
      String(lastStep.step),
    );
  }
  if (unstable) hint = t("statusUnstable");
  if (!hint) {
    if (running && mode === "step") {
      hint = t("statusStepRunning");
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
