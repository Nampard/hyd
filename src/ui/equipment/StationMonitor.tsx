import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { automationInputs, createAutomationState, type AutomationStationState } from "../../core/sim/automation-station";
import { useEditorStore } from "../editor/store";
import { useSimStore } from "../sim/simStore";
import {
  activeStages,
  ConveyorScene,
  followZone,
  STAGE_ZONE,
  type StationStage,
  type StationZone,
} from "./ConveyorScene";

/**
 * 장비 모니터 열림 상태 (Phase 35) — 툴바 버튼과 장비 뷰 스테이션 카드가 같은 창을 연다.
 */
export const useStationMonitor = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

const STAGES: { key: StationStage; label: string; device: string }[] = [
  { key: "supply", label: "공급", device: "A" },
  { key: "drill", label: "가공", device: "B·드릴" },
  { key: "send", label: "송출", device: "C" },
  { key: "detect", label: "검출", device: "센서 3종" },
  { key: "sort", label: "분류", device: "D·저장" },
];

const ZONES: { key: StationZone | "auto"; label: string }[] = [
  { key: "auto", label: "자동 추적" },
  { key: "all", label: "전체" },
  { key: "supply", label: "공급·가공" },
  { key: "detect", label: "검출" },
  { key: "sort", label: "분류" },
];

const SPEEDS = [0.25, 0.5, 1];

function StationMonitor({ stationId, properties, close }: { stationId: string; properties: Record<string, unknown>; close: () => void }) {
  const [camera, setCamera] = useState<StationZone | "auto">("auto");
  // 작게 띄우기: 모달이 아닌 떠 있는 창 — 뒤의 PLC 래더·회로도를 보면서 조작할 수 있다
  const [docked, setDocked] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  /**
   * 모달↔떠 있는 창 전환 때 우리가 직접 부른 close() 횟수. dialog의 close 이벤트는
   * 비동기로 늦게 도착하므로, 그 수만큼은 "사용자가 닫음"으로 보지 않고 넘긴다.
   */
  const switchCloses = useRef(0);
  const station = useSimStore((s) => s.snapshot?.components[stationId]?.equipment) as AutomationStationState | undefined;
  const running = useSimStore((s) => s.running);
  const paused = useSimStore((s) => s.paused);
  const speed = useSimStore((s) => s.speed);
  const pulse = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (d.open) {
      switchCloses.current += 1;
      d.close();
    }
    if (docked) d.show();
    else d.showModal();
  }, [docked]);

  useEffect(
    () => () => {
      clearTimeout(pulse.current);
      useSimStore.getState().setDiscreteInput(stationId, "PB2", false);
    },
    [stationId],
  );

  function startCycle() {
    const sim = useSimStore.getState();
    if (!sim.running) sim.start();
    clearTimeout(pulse.current);
    sim.setDiscreteInput(stationId, "PB2", true);
    pulse.current = setTimeout(() => useSimStore.getState().setDiscreteInput(stationId, "PB2", false), 120);
  }

  const sceneState = station ?? createAutomationState(properties);
  const inputs = automationInputs(sceneState);
  const stages = activeStages(sceneState);
  const zone = camera === "auto" ? followZone(sceneState) : camera;

  return (
    <dialog
      className={`station-monitor${docked ? " docked" : ""}`}
      aria-labelledby="station-monitor-title"
      ref={dialog}
      onKeyDown={(e) => e.stopPropagation()}
      onClose={() => {
        if (switchCloses.current > 0) {
          switchCloses.current -= 1;
          return;
        }
        close();
      }}
    >
      <header>
        <h2 id="station-monitor-title">자동화설비 · 공급에서 분류까지</h2>
        <div className="station-actions">
          <button
            onClick={() => setDocked(!docked)}
            title={docked ? "화면 가운데에 크게 봅니다" : "작은 창으로 띄워 PLC 래더·회로도와 함께 봅니다"}
          >
            {docked ? "⛶ 크게 보기" : "▣ 래더와 함께 보기"}
          </button>
          <button onClick={() => dialog.current?.close()}>
            닫기 <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      {/* 공정 단계 표시줄 — 지금 움직이는 단계가 켜지고, 누르면 그 구역으로 카메라를 옮긴다 */}
      <ol className="station-stages" aria-label="공정 단계">
        {STAGES.map((st, i) => (
          <li key={st.key}>
            <button
              className={`${stages.has(st.key) ? "on" : ""}${camera !== "auto" && STAGE_ZONE[st.key] === camera ? " viewing" : ""}`}
              aria-pressed={stages.has(st.key)}
              onClick={() => setCamera(STAGE_ZONE[st.key])}
              title={`${st.label} 구역 확대`}
            >
              <span className="num">{i + 1}</span>
              <span className="label">{st.label}</span>
              <span className="device">{st.device}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="station-picture">
        <ConveyorScene station={sceneState} zone={zone} />
        <div className="station-camera" role="group" aria-label="카메라">
          {ZONES.map((z) => (
            <button key={z.key} aria-pressed={camera === z.key} onClick={() => setCamera(z.key)}>
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <footer>
        <dl>
          <div>
            <dt>매거진</dt>
            <dd>{sceneState.magazine.length}개</dd>
          </div>
          <div>
            <dt>포토</dt>
            <dd className={inputs.포토 ? "hit" : undefined}>{inputs.포토 ? "감지" : "대기"}</dd>
          </div>
          <div>
            <dt>용량형</dt>
            <dd className={inputs.용량형 ? "hit" : undefined}>{inputs.용량형 ? "감지" : "대기"}</dd>
          </div>
          <div>
            <dt>유도형</dt>
            <dd className={inputs.유도형 ? "hit" : undefined}>{inputs.유도형 ? "감지" : "대기"}</dd>
          </div>
          <div>
            <dt>옆 배출함</dt>
            <dd>{station?.eject.length ?? 0}개</dd>
          </div>
          <div>
            <dt>끝 저장함</dt>
            <dd>{station?.store.length ?? 0}개</dd>
          </div>
        </dl>
        <div className="station-actions">
          {/* 재생 속도 — 인계·감지 순간을 천천히 관찰 (Phase 35) */}
          <div className="station-speed" role="group" aria-label="재생 속도">
            {SPEEDS.map((v) => (
              <button key={v} aria-pressed={speed === v} onClick={() => useSimStore.getState().setSpeed(v)}>
                ×{v}
              </button>
            ))}
          </div>
          <button className="primary" onClick={startCycle}>
            PB2 기동
          </button>
          {paused && <button onClick={() => useSimStore.getState().advanceStep()}>다음 동작</button>}
          <button disabled={!running} onClick={() => useSimStore.getState().stop()}>
            운전 종료
          </button>
        </div>
      </footer>
    </dialog>
  );
}

export function StationMonitorButton() {
  const stations = useEditorStore((s) => s.document.components);
  const selected = useEditorStore((s) => s.selection);
  const open = useStationMonitor((s) => s.open);
  const setOpen = useStationMonitor((s) => s.setOpen);
  const station =
    stations.find((c) => c.type === "auto.automation-station" && selected?.type === "component" && c.id === selected.id) ??
    stations.find((c) => c.type === "auto.automation-station");
  // 스테이션이 없는 문서로 바뀌면 열림 상태도 정리한다
  useEffect(() => {
    if (!station && open) setOpen(false);
  }, [station, open, setOpen]);
  if (!station) return null;
  return (
    <>
      <button className={open ? "plc-toggle-on" : undefined} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        ⛶ 장비 모니터
      </button>
      {open && <StationMonitor stationId={station.id} properties={station.properties} close={() => setOpen(false)} />}
    </>
  );
}
