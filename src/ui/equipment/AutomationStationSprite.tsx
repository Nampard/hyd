import type { ReactElement } from "react";
import type { SymbolProps } from "../symbols";
import { parseWorkpieceQueue, type AutomationStationState, type WorkpieceMaterial } from "../../core/sim/automation-station";

/**
 * 자동화설비 스테이션 장비 뷰 스프라이트 (Phase 14 — 모듈 분리).
 * 복합설비 상태(runtime.equipment)를 자신의 타입(AutomationStationState)으로 읽어
 * 실린더·물품 흐름·판별 센서·램프를 애니메이션한다. 조작 패널 PB1~4는 실행 중
 * onDiscreteInput(채널, 눌림)으로 이산 입력을 emit한다 (엔진의 범용 setDiscreteInput).
 */
/** 물품 사각형 — 금속 강회색 / 비금속 앰버 */
function Piece({
  x,
  y,
  material,
  w = 16,
  h = 10,
}: {
  x: number;
  y: number;
  material: WorkpieceMaterial;
  w?: number;
  h?: number;
}): ReactElement {
  const metal = material === "metal";
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={2}
      fill={metal ? "#94a3b8" : "#d97706"}
      stroke={metal ? "#334155" : "#92400e"}
      strokeWidth={1}
    />
  );
}

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
  const magazine = station ? station.magazine : parseWorkpieceQueue(properties.workpieces);
  const cyl = station?.cyl ?? { A: 0, B: 0, C: 0, D: 0 };
  const lamps = station?.lamps ?? { red: false, yellow: false, green: false };
  const supply = station?.supply ?? null;
  const belt = station?.belt ?? [];
  const store = station?.store ?? [];
  const eject = station?.eject ?? [];
  const drillDrop = cyl.B * 14;
  const photoOn = belt.some((p) => p.progress >= 0.02 && p.progress <= 0.18);
  // 판별 센서 점등 (벨트 초입 감지 구간 — core DETECT_WINDOW와 동일 값)
  const detectAny = belt.some((p) => p.progress >= 0.06 && p.progress <= 0.24);
  const detectMetal = belt.some(
    (p) => p.progress >= 0.06 && p.progress <= 0.24 && p.material === "metal",
  );
  // 벨트 무늬 이동 (12px 주기)
  const dashShift = station ? (station.beltOffset * 26) % 12 : 0;

  return (
    <g>
      {/* 베이스 플레이트 */}
      <rect x={-140} y={-85} width={280} height={170} rx={6} fill="#e2e8f0" stroke="#3c5164" strokeWidth={1.5} />
      <text x={-134} y={-72} fontSize={9} fontWeight={700} fill="#1f2937" stroke="none">
        자동화설비 스테이션
      </text>

      {/* 조작 패널: PB1~4 (램프는 우측 독립 타워 — 배치도 참고) */}
      <rect x={44} y={-80} width={92} height={36} rx={4} fill="#cbd5e1" stroke="#64748b" strokeWidth={1} />
      {([0, 1, 2, 3] as const).map((i) => {
        const px = 60 + i * 21;
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
            <circle cx={px} cy={-68} r={7} fill={pressed ? "#dc2626" : "#991b1b"} stroke="#1f2937" strokeWidth={1} />
            <text x={px - 6.5} y={-56} fontSize={6.5} fill="#1f2937" stroke="none">
              PB{i + 1}
            </text>
          </g>
        );
      })}
      {/* 램프 타워: 우측 독립 기둥에 적(상)/황(중)/녹(하) — 배치도의 시그널 타워 */}
      <line x1={133} y1={62} x2={133} y2={-14} stroke="#475569" strokeWidth={3} />
      <rect x={126} y={62} width={14} height={5} rx={2} fill="#475569" />
      {(
        [
          ["red", "#dc2626"],
          ["yellow", "#eab308"],
          ["green", "#16a34a"],
        ] as const
      ).map(([key, color], i) => (
        <rect
          key={key}
          x={127}
          y={-60 + i * 16}
          width={12}
          height={15}
          rx={3}
          fill={color}
          opacity={lamps[key] ? 1 : 0.25}
          stroke="#1f2937"
          strokeWidth={0.8}
        />
      ))}

      {/* 매거진 타워 + 적재 물품 */}
      <text x={-130} y={-52} fontSize={7} fill="#1f2937" stroke="none">
        매거진 {magazine.length}
      </text>
      <rect x={-130} y={-46} width={24} height={48} fill="#f1f5f9" stroke="#64748b" strokeWidth={1.2} />
      {magazine.slice(0, 4).map((m, i) => (
        <Piece key={i} x={-127} y={-6 - i * 11} material={m} w={18} h={9} />
      ))}

      {/* A실린더 (양솔): 매거진 아래에서 오른쪽으로 밀어 공급 */}
      <rect x={-136} y={6} width={26} height={12} rx={2} fill="#8aa3b8" stroke="#3c5164" strokeWidth={1.2} />
      <text x={-133} y={15} fontSize={7} fontWeight={700} fill="#1f2937" stroke="none">A</text>
      <line x1={-110} y1={12} x2={-110 + cyl.A * 34} y2={12} stroke="#475569" strokeWidth={3} />
      <rect x={-112 + cyl.A * 34} y={5} width={3} height={14} fill="#475569" />

      {/* 공급/가공 위치 (판별 센서는 벨트 초입 — 배치도 S3/S4) */}
      <rect x={-84} y={14} width={32} height={6} fill="#64748b" />
      {supply && <Piece x={-79} y={4} material={supply} w={20} h={10} />}

      {/* B실린더 + 드릴 (B 전진 시 하강) */}
      <rect x={-72} y={-78} width={12} height={16} rx={2} fill="#8aa3b8" stroke="#3c5164" strokeWidth={1.2} />
      <text x={-70} y={-66} fontSize={7} fontWeight={700} fill="#1f2937" stroke="none">B</text>
      <g transform={`translate(0, ${drillDrop})`}>
        <rect x={-76} y={-60} width={20} height={16} rx={2} fill="#64748b" stroke="#334155" strokeWidth={1.2} />
        <g transform={`rotate(${station?.drillAngle ?? 0}, -66, -36)`}>
          <circle cx={-66} cy={-36} r={6} fill="#94a3b8" stroke="#334155" strokeWidth={1.2} />
          <line x1={-72} y1={-36} x2={-60} y2={-36} stroke="#334155" strokeWidth={1.5} />
        </g>
        <line x1={-66} y1={-30} x2={-66} y2={0} stroke="#334155" strokeWidth={2.5} />
        <polygon points="-68,0 -64,0 -66,5" fill="#334155" />
      </g>

      {/* C실린더 (편솔): 공급 위치의 물품을 컨베이어로 이송 */}
      <rect x={-112} y={28} width={22} height={12} rx={2} fill="#8aa3b8" stroke="#3c5164" strokeWidth={1.2} />
      <text x={-109} y={37} fontSize={7} fontWeight={700} fill="#1f2937" stroke="none">C</text>
      <line x1={-90} y1={34} x2={-90 + cyl.C * 32} y2={34} stroke="#475569" strokeWidth={3} />
      <rect x={-92 + cyl.C * 32} y={27} width={3} height={14} fill="#475569" />

      {/* 컨베이어: 벨트 + 롤러 + 이동 무늬 */}
      <rect x={-46} y={46} width={172} height={16} rx={8} fill="#94a3b8" stroke="#334155" strokeWidth={1.2} />
      <circle cx={-38} cy={54} r={5} fill="#475569" />
      <circle cx={118} cy={54} r={5} fill="#475569" />
      {Array.from({ length: 14 }, (_, i) => {
        const x = -40 + ((i * 12 + dashShift) % 156);
        return <line key={i} x1={x} y1={48} x2={x + 5} y2={60} stroke="#64748b" strokeWidth={1} />;
      })}
      {/* 벨트 위 물품 */}
      {belt.map((p, i) => (
        <Piece key={i} x={-48 + p.progress * 158} y={36} material={p.material} />
      ))}

      {/* 벨트 초입 센서 3종 (배치도): 포토(통과) → 용량형(모든 재질) → 유도형(금속) */}
      <line x1={-34} y1={44} x2={-34} y2={32} stroke="#334155" strokeWidth={2} />
      <circle cx={-34} cy={29} r={3.5} fill="#a21caf" opacity={photoOn ? 1 : 0.25} stroke="#1f2937" strokeWidth={0.8} />
      <line x1={-18} y1={44} x2={-18} y2={28} stroke="#334155" strokeWidth={2} />
      <circle cx={-18} cy={23} r={5.5} fill="#0284c7" opacity={detectAny ? 1 : 0.25} stroke="#1f2937" strokeWidth={0.8} />
      <text x={-21} y={25.5} fontSize={7} fill="#fff" stroke="none">용</text>
      <line x1={-4} y1={44} x2={-4} y2={28} stroke="#334155" strokeWidth={2} />
      <circle cx={-4} cy={23} r={5.5} fill="#f59e0b" opacity={detectMetal ? 1 : 0.25} stroke="#1f2937" strokeWidth={0.8} />
      <text x={-7} y={25.5} fontSize={7} fill="#1f2937" stroke="none">유</text>

      {/* D실린더 (편솔): 게이트에서 밀어 배출 */}
      <rect x={36} y={6} width={14} height={20} rx={2} fill="#8aa3b8" stroke="#3c5164" strokeWidth={1.2} />
      <text x={39} y={20} fontSize={7} fontWeight={700} fill="#1f2937" stroke="none">D</text>
      <line x1={43} y1={26} x2={43} y2={26 + cyl.D * 16} stroke="#475569" strokeWidth={3} />
      <rect x={36} y={24 + cyl.D * 16} width={14} height={3} fill="#475569" />

      {/* 배출박스 (D 열) / 저장박스 (컨베이어 끝) */}
      <rect x={26} y={66} width={38} height={18} fill="#f1f5f9" stroke="#64748b" strokeWidth={1.2} />
      <text x={29} y={78} fontSize={7} fill="#1f2937" stroke="none">
        배출 {eject.length}
      </text>
      {eject.slice(-2).map((m, i) => (
        <Piece key={i} x={48 - i * 8} y={72} material={m} w={7} h={9} />
      ))}
      <rect x={86} y={66} width={38} height={18} fill="#f1f5f9" stroke="#64748b" strokeWidth={1.2} />
      <text x={89} y={78} fontSize={7} fill="#1f2937" stroke="none">
        저장 {store.length}
      </text>
      {store.slice(-2).map((m, i) => (
        <Piece key={i} x={108 - i * 8} y={72} material={m} w={7} h={9} />
      ))}
    </g>
  );
}
