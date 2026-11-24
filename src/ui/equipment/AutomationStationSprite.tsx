import { ConveyorScene } from "./ConveyorScene";
import type { ReactElement } from "react";
import type { SymbolProps } from "../symbols";
import { createAutomationState, type AutomationStationState } from "../../core/sim/automation-station";

/**
 * 자동화설비 스테이션 장비 뷰 스프라이트 (Phase 14 — 모듈 분리).
 * 복합설비 상태(runtime.equipment)를 자신의 타입(AutomationStationState)으로 읽어
 * 실린더·물품 흐름·판별 센서·램프를 애니메이션한다. 조작 패널 PB1~4는 실행 중
 * onDiscreteInput(채널, 눌림)으로 이산 입력을 emit한다 (엔진의 범용 setDiscreteInput).
 */
/**
 * 자동화설비 스테이션 스프라이트. 정지 상태에서는 속성의 매거진 큐만 표시하고,
 * 실행 중에는 runtime.equipment로 실린더·물품 흐름·램프를 애니메이션한다.
 * PB1~4는 실행 중 클릭 가능 (onButton — EquipmentView가 연결).
 */
export function AutomationStationSprite({
  properties,
  runtime,
  onDiscreteInput,
}: SymbolProps & {
  /** 이산 입력 emit — 채널 이름("PB1"~"PB4")과 눌림 여부 */
  onDiscreteInput?: (channel: string, active: boolean) => void;
}): ReactElement {
  const station = runtime?.equipment as AutomationStationState | undefined;
  const onButton = onDiscreteInput
    ? (i: 0 | 1 | 2 | 3, active: boolean) => onDiscreteInput(`PB${i + 1}`, active)
    : undefined;
  const sceneState = station ?? createAutomationState(properties);
  const lamps = sceneState.lamps;

  // 장비 카드 (Phase 35) — 사진 배경(남색 스튜디오 톤)과 같은 색의 어두운 카드로 감싸
  // 밝은 프로파일 판 위에서도 사진이 "모니터 화면"처럼 자연스럽게 읽히게 했다.
  // 위: 제목·조작 패널(PB1~4)·시그널 램프 / 가운데: 장비 사진 / 아래: 매거진·배출·저장 집계
  return (
    <g>
      <defs>
        <linearGradient id="station-card-photo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2e3d" />
          <stop offset="0.55" stopColor="#333a4c" />
          <stop offset="1" stopColor="#575e72" />
        </linearGradient>
      </defs>
      <rect x={-140} y={-85} width={280} height={170} rx={8} fill="#1b2030" stroke="#39415a" strokeWidth={1.2} filter="url(#eq-shadow)" />
      <rect x={-139} y={-62} width={278} height={124} fill="url(#station-card-photo)" />
      <svg x={-139} y={-62} width={278} height={124}>
        <ConveyorScene station={sceneState} compact />
      </svg>

      {/* 머리띠: 제목 + 조작 패널 + 시그널 램프 */}
      <path d="M-140 -77 a8 8 0 0 1 8 -8 h264 a8 8 0 0 1 8 8 v15 h-280 Z" fill="#222839" />
      <line x1={-140} y1={-62} x2={140} y2={-62} stroke="#39415a" strokeWidth={0.8} />
      <text x={-131} y={-70} fontSize={8.5} fontWeight={700} fill="#eef2f8">
        자동화설비 스테이션
      </text>
      {([0, 1, 2, 3] as const).map((i) => {
        const px = 18 + i * 19;
        const pressed = station?.pb[i] ?? false;
        return (
          <g
            key={i}
            style={onButton ? { cursor: "pointer" } : undefined}
            role={onButton ? "button" : undefined}
            tabIndex={onButton ? 0 : undefined}
            aria-label={onButton ? `PB${i + 1} 푸시버튼` : undefined}
            aria-pressed={onButton ? pressed : undefined}
            onPointerDown={
              onButton
                ? (e) => {
                    e.stopPropagation();
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    onButton(i, true);
                  }
                : undefined
            }
            // pointerup·cancel·창 밖 릴리스를 모두 처리해 눌린 채로 남지 않게 한다 (codex-review P2-6)
            onPointerUp={onButton ? () => onButton(i, false) : undefined}
            onPointerCancel={onButton ? () => onButton(i, false) : undefined}
            onLostPointerCapture={onButton ? () => onButton(i, false) : undefined}
            // 키보드 조작 (Enter/Space): 누름→다음 프레임 뗌 (모멘터리 펄스)
            onKeyDown={
              onButton
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onButton(i, true);
                    }
                  }
                : undefined
            }
            onKeyUp={
              onButton
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") onButton(i, false);
                  }
                : undefined
            }
            onBlur={onButton ? () => onButton(i, false) : undefined}
          >
            <circle cx={px} cy={-75} r={6} fill="url(#eq-chrome)" stroke="#0f1420" strokeWidth={0.8} />
            <circle cx={px} cy={pressed ? -74.6 : -75} r={pressed ? 4.2 : 4.8} fill="url(#eq-cap-red)" stroke="#7f1d1d" strokeWidth={0.6} />
            {!pressed && <ellipse cx={px - 1.5} cy={-76.8} rx={1.7} ry={1} fill="#ffffff" opacity={0.55} />}
            <text x={px} y={-65.2} fontSize={5} fontWeight={700} textAnchor="middle" fill="#a7b1c6">
              PB{i + 1}
            </text>
          </g>
        );
      })}
      {/* 시그널 램프 (적·황·녹) — 켜지면 빛 번짐 */}
      {(
        [
          ["red", "#ef4444"],
          ["yellow", "#facc15"],
          ["green", "#22c55e"],
        ] as const
      ).map(([key, color], i) => {
        const cx = 103 + i * 11;
        return (
          <g key={key}>
            {lamps[key] && <circle cx={cx} cy={-73.5} r={8} fill={color} opacity={0.3} />}
            <circle cx={cx} cy={-73.5} r={4} fill={color} opacity={lamps[key] ? 1 : 0.22} stroke="#0f1420" strokeWidth={0.6} />
          </g>
        );
      })}

      {/* 아랫단: 집계 */}
      <path d="M-140 62 h280 v15 a8 8 0 0 1 -8 8 h-264 a8 8 0 0 1 -8 -8 Z" fill="#222839" />
      <line x1={-140} y1={62} x2={140} y2={62} stroke="#39415a" strokeWidth={0.8} />
      <g fontSize={7} fontWeight={700} fill="#eef2f8">
        <text x={-131} y={76}>
          <tspan fill="#a7b1c6">매거진</tspan> {sceneState.magazine.length}
        </text>
        <text x={-86} y={76}>
          <tspan fill="#a7b1c6">배출</tspan> {station?.eject.length ?? 0}
        </text>
        <text x={-48} y={76}>
          <tspan fill="#a7b1c6">저장</tspan> {station?.store.length ?? 0}
        </text>
      </g>
    </g>
  );
}
