import { useEffect, useRef, useState } from "react";
import { automationInputs, createAutomationState, type AutomationStationState } from "../../core/sim/automation-station";
import { useEditorStore } from "../editor/store";
import { useSimStore } from "../sim/simStore";
import { ConveyorScene } from "./ConveyorScene";

function StationMonitor({ stationId, properties, close }: { stationId: string; properties: Record<string, unknown>; close: () => void }) {
  const [supplyCloseup, setSupplyCloseup] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const sim = useSimStore();
  const station = sim.snapshot?.components[stationId]?.equipment as AutomationStationState | undefined;
  const pulse = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      clearTimeout(pulse.current);
      useSimStore.getState().setDiscreteInput(stationId, "PB2", false);
    };
  }, [stationId]);
  function startCycle() {
    if (!sim.running) sim.start();
    clearTimeout(pulse.current);
    sim.setDiscreteInput(stationId, "PB2", true);
    pulse.current = setTimeout(() => sim.setDiscreteInput(stationId, "PB2", false), 120);
  }
  const sceneState = station ?? createAutomationState(properties);
  const inputs = automationInputs(sceneState);
  return <dialog className="station-monitor" aria-labelledby="station-monitor-title" ref={dialog} onKeyDown={e => e.stopPropagation()} onClose={close}>
    <header><h2 id="station-monitor-title">자동화설비 · 공급에서 분류까지</h2><div className="station-actions"><button aria-pressed={supplyCloseup} onClick={() => setSupplyCloseup(!supplyCloseup)}>{supplyCloseup ? "전체 장비" : "공급부 확대"}</button><button onClick={() => dialog.current?.close()}>닫기 <span aria-hidden="true">×</span></button></div></header>
    <div className="station-picture"><ConveyorScene station={sceneState} supplyCloseup={supplyCloseup}/></div>
    <footer>
      <dl><div><dt>매거진</dt><dd>{sceneState.magazine.length}개</dd></div>
        <div><dt>용량형</dt><dd>{inputs.용량형 ? "감지" : "대기"}</dd></div>
        <div><dt>유도형</dt><dd>{inputs.유도형 ? "감지" : "대기"}</dd></div>
        <div><dt>D 실린더</dt><dd>{Math.round(sceneState.cyl.D*100)}%</dd></div>
        <div><dt>옆 배출함</dt><dd>{station?.eject.length ?? 0}개</dd></div><div><dt>끝 저장함</dt><dd>{station?.store.length ?? 0}개</dd></div></dl>
      <div className="station-actions"><button onClick={startCycle}>PB2 기동</button>
        {sim.paused && <button onClick={sim.advanceStep}>다음 동작</button>}
        <button disabled={!sim.running} onClick={sim.stop}>운전 종료</button></div>
    </footer>
  </dialog>;
}

export function StationMonitorButton() {
  const stations = useEditorStore(s => s.document.components);
  const selected = useEditorStore(s => s.selection);
  const [open, setOpen] = useState(false);
  const station = stations.find(c => c.type === "auto.automation-station" && selected?.type === "component" && c.id === selected.id)
    ?? stations.find(c => c.type === "auto.automation-station");
  if (!station) return null;
  return <><button className="station-expand" aria-haspopup="dialog" onClick={() => setOpen(true)}>⛶ 장비 크게 보기</button>
    {open && <StationMonitor stationId={station.id} properties={station.properties} close={() => setOpen(false)}/>}</>;
}
