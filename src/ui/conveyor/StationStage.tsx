import { useEffect, useRef, useState, type ReactElement } from "react";
import { automationInputs, createAutomationState, type AutomationStationState } from "../../core/sim/automation-station";
import { useSimStore } from "../sim/simStore";
import {
  activeStages,
  autoZone,
  ConveyorScene,
  STAGE_ZONE,
  ZoneFollower,
  type StationStage as Stage,
  type StationZone,
} from "../equipment/ConveyorScene";

/**
 * 컨베이어 모드의 장비 무대 (Phase 37 — Phase 35 장비 모니터를 작업 화면에 붙박이로 옮김).
 * 위: 공정 단계 · 가운데: 장비 사진과 카메라 · 아래: 조작 패널(PB1~4·램프)·센서·집계·재생 속도.
 * 래더는 같은 화면 아래에 늘 보이므로 예전의 "래더와 함께 보기" 창이 따로 필요 없다.
 */

const STAGES: { key: Stage; label: string; device: string }[] = [
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
const LAMPS = [
  ["red", "적"],
  ["yellow", "황"],
  ["green", "녹"],
] as const;

export function StationStage({ stationId, properties }: { stationId: string; properties: Record<string, unknown> }): ReactElement {
  const [camera, setCameraState] = useState<StationZone | "auto">("auto");
  const follower = useRef(new ZoneFollower());
  const setCamera = (next: StationZone | "auto") => {
    // 자동 추적으로 돌아올 때는 지금 보던 자리에서 새로 판정을 시작한다
    if (next === "auto") follower.current = new ZoneFollower();
    setCameraState(next);
  };
  const station = useSimStore((s) => s.snapshot?.components[stationId]?.equipment) as AutomationStationState | undefined;
  const speed = useSimStore((s) => s.speed);

  const sceneState = station ?? createAutomationState(properties);
  const inputs = automationInputs(sceneState);
  const stages = activeStages(sceneState);
  const zone = camera === "auto" ? follower.current.update(autoZone(sceneState), performance.now()) : camera;

  return (
    <section className="station-stage" aria-label="자동화설비 스테이션">
      {/* 공정 단계 — 움직이는 단계가 켜지고, 누르면 그 구역으로 카메라를 옮긴다 */}
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

      <footer className="station-console">
        <OperatorPanel stationId={stationId} station={station} />
        <dl className="station-readouts">
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
        {/* 재생 속도 — 인계·감지 순간을 천천히 관찰 (Phase 35) */}
        <div className="station-speed" role="group" aria-label="재생 속도">
          {SPEEDS.map((v) => (
            <button key={v} aria-pressed={speed === v} onClick={() => useSimStore.getState().setSpeed(v)}>
              ×{v}
            </button>
          ))}
        </div>
      </footer>
    </section>
  );
}

/**
 * 조작 패널 — 스테이션의 누름버튼 PB1~4와 시그널 램프.
 * PB1~3은 누르는 동안만 입력이 들어가는 모멘터리 버튼이다. 색은 학교 실습 장비 조작반(초록·빨강·주황)을
 * 따랐다 (Phase 38, 수업 영상 참고). PB4는 실습 장비처럼
 * **Turn to Reset**(누르면 잠기고 돌려야 풀리는 버섯형) 버튼이라, 한 번 누르면 잠겨 있다가
 * 다시 누르면(돌려서 해제) 풀린다 (Phase 38). 운전 전이면 누르는 순간 시뮬레이션을 시작한다.
 */
const LATCHING_PB = 3;
function OperatorPanel({ stationId, station }: { stationId: string; station: AutomationStationState | undefined }) {
  const held = useRef(new Set<number>());
  useEffect(
    () => () => {
      // 화면을 떠날 때 눌린 채 남은 버튼을 모두 뗀다
      for (const i of held.current) useSimStore.getState().setDiscreteInput(stationId, `PB${i + 1}`, false);
      useSimStore.getState().setDiscreteInput(stationId, `PB${LATCHING_PB + 1}`, false);
    },
    [stationId],
  );
  const press = (i: number, active: boolean) => {
    const sim = useSimStore.getState();
    if (active && !sim.running) sim.start();
    if (active) held.current.add(i);
    else held.current.delete(i);
    useSimStore.getState().setDiscreteInput(stationId, `PB${i + 1}`, active);
  };
  const lamps = station?.lamps ?? { red: false, yellow: false, green: false };
  const pb4Latched = station?.pb[LATCHING_PB] ?? false;
  return (
    <div className="operator-panel" aria-label="조작 패널">
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          className={`pb pb-${i + 1}${station?.pb[i] ? " pressed" : ""}`}
          aria-pressed={station?.pb[i] ?? false}
          onPointerDown={(e) => {
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            press(i, true);
          }}
          onPointerUp={() => press(i, false)}
          onPointerCancel={() => press(i, false)}
          onLostPointerCapture={() => held.current.has(i) && press(i, false)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
              e.preventDefault();
              press(i, true);
            }
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter" || e.key === " ") press(i, false);
          }}
          title={`PB${i + 1} — 누르는 동안 입력`}
        >
          PB{i + 1}
        </button>
      ))}
      {/* PB4: 누르면 잠김 → 다시 누르면 돌려서 해제 (Turn to Reset) */}
      <button
        className={`pb pb-latch${pb4Latched ? " pressed" : ""}`}
        aria-pressed={pb4Latched}
        onClick={() => press(LATCHING_PB, !pb4Latched)}
        title={pb4Latched ? "PB4 잠김 — 누르면 돌려서 해제합니다" : "PB4 — 누르면 잠깁니다 (돌려서 해제)"}
      >
        <span className="pb-latch-cap" aria-hidden="true" />
        <span className="pb-latch-label">PB4</span>
      </button>
      {/* 실습 장비 조작반의 7세그먼트 카운터처럼 — 분류를 마친 공작물 수 */}
      <span className="seg-counter" title="분류를 마친 공작물 수 (옆 배출 + 끝 저장)">
        <span className="seg-digits">{String((station?.eject.length ?? 0) + (station?.store.length ?? 0)).padStart(2, "0")}</span>
        <span className="seg-label">처리</span>
      </span>
      <span className="lamps" aria-label="시그널 램프">
        {LAMPS.map(([key, name]) => (
          <span key={key} className={`lamp lamp-${key}${lamps[key] ? " lit" : ""}`} title={`${name}램 ${lamps[key] ? "켜짐" : "꺼짐"}`} />
        ))}
      </span>
    </div>
  );
}
