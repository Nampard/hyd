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
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        fill={metal ? "url(#eq-chrome)" : "#f59e0b"}
        stroke={metal ? "#334155" : "#92400e"}
        strokeWidth={1}
      />
      <rect x={x + 1.5} y={y + 1} width={w - 3} height={Math.max(1, h / 4)} rx={1} fill="#ffffff" opacity={metal ? 0.4 : 0.35} />
    </g>
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

  // 실린더 몸체 (가로/세로) — 알루미늄 배럴 + 엔드캡, 장비 뷰 공용 재질(EquipmentDefs)
  const Barrel = ({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label: string }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill="url(#eq-alu)" stroke="#475569" strokeWidth={1} filter="url(#eq-shadow)" />
      <text x={x + w / 2} y={y + h / 2 + 2.5} fontSize={7} fontWeight={800} textAnchor="middle" fill="#1e293b" stroke="none">
        {label}
      </text>
    </g>
  );
  const Rod = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth={3.6} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e2e8f0" strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
  /** 근접 센서 — 원통 몸체 + 감지면 LED */
  const Sensor = ({ x, on, color, label, r = 5.5 }: { x: number; on: boolean; color: string; label?: string; r?: number }) => (
    <g>
      <rect x={x - 2} y={29} width={4} height={15} fill="url(#eq-chrome)" stroke="#475569" strokeWidth={0.6} />
      {on && <circle cx={x} cy={23} r={r * 2.2} fill={color} opacity={0.22} />}
      <circle cx={x} cy={23} r={r} fill={on ? color : "#475569"} stroke="#1e293b" strokeWidth={0.8} />
      <circle cx={x - r * 0.35} cy={23 - r * 0.35} r={r * 0.35} fill="#ffffff" opacity={on ? 0.6 : 0.2} />
      {label && (
        <text x={x} y={25.5} fontSize={6.5} fontWeight={700} textAnchor="middle" fill="#ffffff" stroke="none">
          {label}
        </text>
      )}
    </g>
  );

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

      {/* 매거진 타워 (투명 튜브) + 적재 물품 */}
      <text x={-118} y={-52} fontSize={7} fontWeight={700} textAnchor="middle" fill="#1e293b" stroke="none">
        매거진 {magazine.length}
      </text>
      <rect x={-130} y={-46} width={24} height={48} rx={2} fill="url(#eq-glass)" stroke="#64748b" strokeWidth={1.2} opacity={0.9} />
      {magazine.slice(0, 4).map((m, i) => (
        <Piece key={i} x={-127} y={-6 - i * 11} material={m} w={18} h={9} />
      ))}
      <rect x={-128} y={-44} width={3} height={44} rx={1.5} fill="#ffffff" opacity={0.55} />

      {/* A실린더 (양솔): 매거진 아래에서 오른쪽으로 밀어 공급 */}
      <Barrel x={-137} y={6} w={27} h={12} label="A" />
      <Rod x1={-110} y1={12} x2={-110 + cyl.A * 34} y2={12} />
      <rect x={-112 + cyl.A * 34} y={5} width={4} height={14} rx={1} fill="#475569" />

      {/* 공급/가공 위치 (판별 센서는 벨트 초입 — 배치도 S3/S4) */}
      <rect x={-84} y={14} width={32} height={6} rx={1} fill="url(#eq-alu-dark)" />
      {supply && <Piece x={-79} y={4} material={supply} w={20} h={10} />}

      {/* B실린더 + 드릴 (B 전진 시 하강) */}
      <Barrel x={-72} y={-80} w={12} h={18} label="B" />
      <g transform={`translate(0, ${drillDrop})`}>
        <rect x={-77} y={-60} width={22} height={17} rx={3} fill="#2563eb" stroke="#1e3a8a" strokeWidth={1.1} filter="url(#eq-shadow)" />
        {[-73, -70, -67, -64, -61].map((fx) => (
          <line key={fx} x1={fx} y1={-58} x2={fx} y2={-46} stroke="#93c5fd" strokeWidth={0.7} />
        ))}
        <g transform={`rotate(${station?.drillAngle ?? 0}, -66, -36)`}>
          <circle cx={-66} cy={-36} r={6} fill="url(#eq-chrome)" stroke="#334155" strokeWidth={1.1} />
          <line x1={-71} y1={-36} x2={-61} y2={-36} stroke="#334155" strokeWidth={1.4} />
          <line x1={-66} y1={-41} x2={-66} y2={-31} stroke="#334155" strokeWidth={0.8} opacity={0.6} />
        </g>
        <line x1={-66} y1={-30} x2={-66} y2={0} stroke="#475569" strokeWidth={2.6} />
        <line x1={-66} y1={-28} x2={-66} y2={-2} stroke="#e2e8f0" strokeWidth={0.8} strokeDasharray="2 2" />
        <polygon points="-68,0 -64,0 -66,5" fill="#334155" />
      </g>

      {/* C실린더 (편솔): 공급 위치의 물품을 컨베이어로 이송 */}
      <Barrel x={-113} y={28} w={23} h={12} label="C" />
      <Rod x1={-90} y1={34} x2={-90 + cyl.C * 32} y2={34} />
      <rect x={-92 + cyl.C * 32} y={27} width={4} height={14} rx={1} fill="#475569" />

      {/* 컨베이어: 벨트 + 롤러 + 이동 무늬 */}
      <rect x={-46} y={46} width={172} height={16} rx={8} fill="url(#eq-belt)" stroke="#0f172a" strokeWidth={1.2} filter="url(#eq-shadow)" />
      {Array.from({ length: 14 }, (_, i) => {
        const x = -40 + ((i * 12 + dashShift) % 156);
        return <line key={i} x1={x} y1={48} x2={x + 4} y2={60} stroke="#4b5563" strokeWidth={1.2} />;
      })}
      {[-38, 118].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={54} r={6} fill="url(#eq-chrome)" stroke="#334155" strokeWidth={1} />
          <circle cx={cx} cy={54} r={1.8} fill="#334155" />
        </g>
      ))}
      {/* 벨트 위 물품 */}
      {belt.map((p, i) => (
        <Piece key={i} x={-48 + p.progress * 158} y={36} material={p.material} />
      ))}

      {/* 벨트 초입 센서 3종 (배치도): 포토(통과) → 용량형(모든 재질) → 유도형(금속) */}
      <Sensor x={-34} on={photoOn} color="#c026d3" r={3.8} />
      <Sensor x={-18} on={detectAny} color="#0284c7" label="용" />
      <Sensor x={-4} on={detectMetal} color="#f59e0b" label="유" />

      {/* D실린더 (편솔): 게이트에서 밀어 배출 */}
      <Barrel x={36} y={5} w={14} h={21} label="D" />
      <Rod x1={43} y1={26} x2={43} y2={26 + cyl.D * 16} />
      <rect x={36} y={24 + cyl.D * 16} width={14} height={4} rx={1} fill="#475569" />

      {/* 배출박스 (D 열) / 저장박스 (컨베이어 끝).
          라벨은 윗줄, 적재 물품은 아랫줄로 분리한다 — 같은 줄에 두면 개수 숫자가
          물품 사각형에 가려진다 (금속/비금속 모두). */}
      {(
        [
          [26, "배출", eject],
          [86, "저장", store],
        ] as const
      ).map(([bx, label, items]) => (
        <g key={label}>
          <path d={`M ${bx} 66 L ${bx + 38} 66 L ${bx + 36} 84 L ${bx + 2} 84 Z`} fill="#fef3c7" stroke="#92400e" strokeWidth={1.1} filter="url(#eq-shadow)" />
          <rect x={bx} y={66} width={38} height={3} fill="#d97706" opacity={0.6} />
          <text x={bx + 3} y={75.5} fontSize={6.5} fontWeight={700} fill="#78350f" stroke="none">
            {label} {items.length}
          </text>
          {items.slice(-2).map((m, i) => (
            <Piece key={i} x={bx + 29 - i * 9} y={75.5} material={m} w={7} h={7} />
          ))}
        </g>
      ))}

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
