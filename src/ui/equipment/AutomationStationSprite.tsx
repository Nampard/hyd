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

  return (
    <g>
      {/* 베이스 플레이트 — 프로파일 판 + 테두리 */}
      <rect x={-140} y={-85} width={280} height={170} rx={7} fill="url(#eq-slots)" stroke="#475569" strokeWidth={1.6} filter="url(#eq-shadow)" />
      <rect x={-140} y={-85} width={280} height={170} rx={7} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.6} transform="translate(1,1)" />
      {/* 제목은 맨 아래(마지막 자식)에서 그린다 — 아래 "제목 오버레이" 참고 */}

      {/* 조작 패널: PB1~4 (램프는 우측 독립 타워 — 배치도 참고) */}
      <rect x={44} y={-80} width={80} height={36} rx={5} fill="url(#eq-panel)" stroke="#64748b" strokeWidth={1} filter="url(#eq-shadow)" />
      <rect x={44} y={-80} width={80} height={5} rx={2.5} fill="#334155" />
      {([0, 1, 2, 3] as const).map((i) => {
        const px = 56 + i * 20;
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
            <circle cx={px} cy={-64} r={7.5} fill="url(#eq-chrome)" stroke="#64748b" strokeWidth={0.8} />
            <circle
              cx={px}
              cy={pressed ? -63.4 : -64}
              r={pressed ? 5.4 : 6.2}
              fill="url(#eq-cap-red)"
              stroke="#7f1d1d"
              strokeWidth={0.8}
            />
            {!pressed && <ellipse cx={px - 2} cy={-66.5} rx={2.2} ry={1.3} fill="#ffffff" opacity={0.5} />}
            <text x={px} y={-49.5} fontSize={6.5} fontWeight={700} textAnchor="middle" fill="#1e293b" stroke="none">
              PB{i + 1}
            </text>
          </g>
        );
      })}

      {/* 램프 타워: 우측 독립 기둥에 적(상)/황(중)/녹(하) — 배치도의 시그널 타워 */}
      <rect x={131} y={-14} width={4} height={76} fill="url(#eq-chrome)" stroke="#64748b" strokeWidth={0.6} />
      <rect x={125} y={61} width={16} height={6} rx={2} fill="#334155" />
      <rect x={126} y={-62} width={14} height={50} rx={4} fill="#1e293b" />
      {(
        [
          ["red", "#ef4444"],
          ["yellow", "#facc15"],
          ["green", "#22c55e"],
        ] as const
      ).map(([key, color], i) => (
        <g key={key}>
          {lamps[key] && <circle cx={133} cy={-53 + i * 16} r={13} fill={color} opacity={0.25} />}
          <rect
            x={127.5}
            y={-60 + i * 16}
            width={11}
            height={14}
            rx={3}
            fill={color}
            opacity={lamps[key] ? 1 : 0.28}
            stroke="#0f172a"
            strokeWidth={0.6}
          />
          <rect x={129} y={-58.5 + i * 16} width={3} height={10} rx={1.5} fill="#ffffff" opacity={lamps[key] ? 0.55 : 0.15} />
        </g>
      ))}

      <svg x={-138} y={-44} width={260} height={114}>
        <ConveyorScene station={sceneState} />
      </svg>
      <g fontSize={7} fill="#26384b" fontWeight={700}>
        <text x={34} y={75}>배출 {station?.eject.length ?? 0}</text>
        <text x={90} y={75}>저장 {station?.store.length ?? 0}</text>
      </g>

      {/* 제목 오버레이 — 모든 장비 도형보다 뒤에 그려 절대 가려지지 않게 한다.
          2줄로 나누고 플레이트색 헤일로(paint-order)를 둘러, 폰트 폭이 넓은 환경
          (윈도우 맑은 고딕 등)에서 글자가 번져도 B실린더 블록에 묻히지 않는다. */}
      <g
        fontSize={8}
        fontWeight={700}
        fill="#1f2937"
        stroke="#e8edf2"
        strokeWidth={2.5}
        paintOrder="stroke"
      >
        <text x={-136} y={-77}>자동화설비</text>
        <text x={-136} y={-68}>스테이션</text>
      </g>
    </g>
  );
}
