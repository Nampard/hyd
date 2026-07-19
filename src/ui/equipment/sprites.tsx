import type { ReactElement } from "react";
import type { SymbolProps } from "../symbols";
import {
  parseWorkpieceQueue,
  type MpsStationState,
  type WorkpieceMaterial,
} from "../../core/sim/mps-station";

/**
 * 장비 뷰 일러스트 스프라이트 — 실습장비의 실물 느낌 묘사 (ARCHITECTURE 4.6).
 * 기호와 같은 로컬 좌표계·같은 런타임 상태를 사용한다. 미등록 부품은 기호로 폴백.
 */

type SpriteComponent = (props: SymbolProps) => ReactElement;

/** 공압원: 소형 컴프레서 */
function CompressorSprite(_: SymbolProps): ReactElement {
  return (
    <g>
      <rect x={-18} y={-12} width={36} height={26} rx={5} fill="#64748b" stroke="#334155" strokeWidth={1.5} />
      <circle cx={-6} cy={1} r={8} fill="#94a3b8" stroke="#334155" strokeWidth={1.5} />
      <circle cx={-6} cy={1} r={3} fill="#334155" />
      <rect x={6} y={-8} width={9} height={18} rx={2} fill="#475569" />
      <line x1={0} y1={-12} x2={0} y2={-30} stroke="#334155" strokeWidth={4} strokeLinecap="round" />
      <rect x={-16} y={14} width={32} height={4} rx={2} fill="#334155" />
    </g>
  );
}

/** 복동/단동 실린더: 금속 바디 + 이동 로드 */
function CylinderSprite({ properties, runtime }: SymbolProps): ReactElement {
  const pos = runtime?.cylinderPos ?? (properties.initialPosition === "extended" ? 1 : 0);
  const rodX = -22 + pos * 40;
  return (
    <g>
      {/* 로드 */}
      <rect x={rodX} y={-3} width={72} height={6} rx={2} fill="#cbd5e1" stroke="#64748b" strokeWidth={1} />
      <rect x={rodX + 66} y={-7} width={8} height={14} rx={2} fill="#475569" />
      {/* 바디 */}
      <rect x={-40} y={-13} width={62} height={26} rx={4} fill="#93b6d6" stroke="#33506b" strokeWidth={1.5} />
      <rect x={-40} y={-13} width={62} height={9} rx={4} fill="#b7d0e6" opacity={0.7} />
      <rect x={-44} y={-15} width={7} height={30} rx={2} fill="#33506b" />
      <rect x={19} y={-15} width={7} height={30} rx={2} fill="#33506b" />
      {/* 포트 니플 */}
      <rect x={-33} y={13} width={6} height={7} fill="#33506b" />
      <rect x={17} y={13} width={6} height={7} fill="#33506b" />
      <text x={-40} y={-19} fontSize={10} fontWeight={700} fill="#33506b" stroke="none">
        {String(properties.label ?? "")}
      </text>
    </g>
  );
}

/** 밸브 블록 공용: 몸체 + 포트 니플 + 인디케이터 */
function ValveBlock({
  width,
  indicators,
  topPorts,
  bottomPorts,
  children,
}: {
  width: number;
  indicators?: { x: number; on: boolean; label?: string }[];
  topPorts: number[];
  bottomPorts: number[];
  children?: ReactElement | null;
}): ReactElement {
  const x0 = -width / 2;
  return (
    <g>
      <rect x={x0} y={-20} width={width} height={40} rx={4} fill="#8aa3b8" stroke="#3c5164" strokeWidth={1.5} />
      <rect x={x0} y={-20} width={width} height={12} rx={4} fill="#a5bccf" opacity={0.7} />
      {topPorts.map((px) => (
        <rect key={`t${px}`} x={px - 3} y={-27} width={6} height={7} fill="#3c5164" />
      ))}
      {bottomPorts.map((px) => (
        <rect key={`b${px}`} x={px - 3} y={20} width={6} height={7} fill="#3c5164" />
      ))}
      {indicators?.map((ind, i) => (
        <g key={i}>
          <circle cx={ind.x} cy={0} r={5} fill={ind.on ? "#fbbf24" : "#475569"} stroke="#1f2937" strokeWidth={1} />
          {ind.label && (
            <text x={ind.x - 8} y={16} fontSize={8} fill="#1f2937" stroke="none">
              {ind.label}
            </text>
          )}
        </g>
      ))}
      {children}
    </g>
  );
}

/** 3/2 수동 밸브: 큰 버튼이 달린 블록 */
function Valve32ManualSprite({ properties, runtime }: SymbolProps): ReactElement {
  const pressed = runtime?.manualActive ?? false;
  const isLever = properties.actuation === "lever";
  return (
    <g>
      <ValveBlock width={70} topPorts={[20]} bottomPorts={[10, 30]} />
      {/* 조작부 */}
      {isLever ? (
        <g transform={`translate(-45, 0) rotate(${pressed ? 30 : -30})`}>
          <rect x={-3} y={-18} width={6} height={20} rx={3} fill={pressed ? "#dc2626" : "#991b1b"} />
          <circle cx={0} cy={-18} r={5} fill="#dc2626" />
        </g>
      ) : (
        <g transform={`translate(${pressed ? -40 : -45}, 0)`}>
          <rect x={-10} y={-9} width={12} height={18} rx={3} fill={pressed ? "#16a34a" : "#15803d"} />
        </g>
      )}
    </g>
  );
}

/** 3/2 롤러 밸브 */
function Valve32RollerSprite({ properties, runtime }: SymbolProps): ReactElement {
  const active = (runtime?.valvePosition ?? 1) === 0;
  return (
    <g>
      <ValveBlock width={70} topPorts={[20]} bottomPorts={[10, 30]} />
      <g transform="translate(-45, 0)">
        <rect x={-4} y={-4} width={12} height={8} fill="#475569" />
        <line x1={-4} y1={0} x2={-16} y2={active ? 6 : -8} stroke="#334155" strokeWidth={3} strokeLinecap="round" />
        <circle cx={-17} cy={active ? 7 : -9} r={5} fill="#cbd5e1" stroke="#334155" strokeWidth={1.5} />
      </g>
      <text x={-56} y={22} fontSize={9} fill="#1f2937" stroke="none">
        {String(properties.cylinderLabel ?? "")}
        {properties.triggerAt === "retracted" ? "▾" : "▴"}
      </text>
    </g>
  );
}

/** 3/2 솔레노이드 밸브: 3포트 블록 + 솔레노이드 인디케이터 (codex-review 스프라이트 오바인딩 수정) */
function Valve32SolenoidSprite({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  return (
    <g>
      <ValveBlock
        width={70}
        topPorts={[20]}
        bottomPorts={[10, 30]}
        indicators={[{ x: -25, on: current === 0, label: String(properties.solenoidLeft ?? "") }]}
      />
    </g>
  );
}

function makeValve52Sprite(kind: "manual" | "pilot-double" | "pilot-single" | "sol-single" | "sol-double") {
  return function Valve52Sprite({ properties, runtime }: SymbolProps): ReactElement {
    const current = runtime?.valvePosition ?? 1;
    const pressed = runtime?.manualActive ?? false;
    const indicators =
      kind === "sol-single"
        ? [{ x: -38, on: current === 0, label: String(properties.solenoidLeft ?? "") }]
        : kind === "sol-double"
          ? [
              { x: -38, on: current === 0, label: String(properties.solenoidLeft ?? "") },
              { x: 38, on: current === 1, label: String(properties.solenoidRight ?? "") },
            ]
          : undefined;
    return (
      <g>
        <ValveBlock width={100} topPorts={[20, 40]} bottomPorts={[10, 30, 50]} indicators={indicators}>
          {kind === "manual" ? (
            <g transform={`translate(-60, 0) rotate(${pressed ? 30 : -30})`}>
              <rect x={-3} y={-18} width={6} height={20} rx={3} fill={pressed ? "#dc2626" : "#991b1b"} />
              <circle cx={0} cy={-18} r={5} fill="#dc2626" />
            </g>
          ) : null}
        </ValveBlock>
        {(kind === "pilot-double" || kind === "pilot-single") && (
          <>
            {/* 파일럿 조작부: 현재 위치를 만든 쪽을 강조해 전환을 시각화 (솔레노이드 인디케이터와 동일 규약).
                왼쪽 파일럿(X)=위치 0, 오른쪽 파일럿(Y)=위치 1(마지막). 스프링 복귀형은 왼쪽만 존재 */}
            <rect x={-58} y={-8} width={8} height={16} fill={current === 0 ? "#fbbf24" : "#3c5164"} />
            <text x={-58} y={-11} fontSize={7} fill="#1f2937" stroke="none">X</text>
            {kind === "pilot-double" && (
              <>
                <rect x={50} y={-8} width={8} height={16} fill={current === 1 ? "#fbbf24" : "#3c5164"} />
                <text x={50} y={-11} fontSize={7} fill="#1f2937" stroke="none">Y</text>
              </>
            )}
          </>
        )}
      </g>
    );
  };
}

/** 전기 푸시버튼: 패널 버튼 */
function PushbuttonSprite({ properties, runtime }: SymbolProps): ReactElement {
  const pressed = runtime?.manualActive ?? false;
  const isNC = properties.contactType === "NC";
  return (
    <g>
      <rect x={-16} y={-16} width={32} height={32} rx={4} fill="#e2e8f0" stroke="#64748b" strokeWidth={1.5} />
      <circle cx={0} cy={0} r={10} fill={isNC ? "#dc2626" : "#16a34a"} opacity={pressed ? 1 : 0.75} />
      <circle cx={0} cy={0} r={pressed ? 6 : 7.5} fill={isNC ? "#b91c1c" : "#15803d"} />
      <text x={-16} y={26} fontSize={8} fill="#1f2937" stroke="none">
        {String(properties.name ?? "")}
      </text>
    </g>
  );
}

/** 리밋 스위치: 롤러 레버 본체 */
function LimitSwitchSprite({ properties, runtime }: SymbolProps): ReactElement {
  const closed = runtime?.contactClosed ?? false;
  const active = properties.contactType === "NC" ? !closed : closed;
  return (
    <g>
      <rect x={-12} y={-14} width={24} height={28} rx={3} fill="#fbbf24" stroke="#92400e" strokeWidth={1.5} />
      <line x1={-12} y1={-6} x2={-24} y2={active ? 2 : -14} stroke="#92400e" strokeWidth={3} strokeLinecap="round" />
      <circle cx={-25} cy={active ? 3 : -15} r={4} fill="#e5e7eb" stroke="#92400e" strokeWidth={1.5} />
      <text x={-12} y={24} fontSize={8} fill="#1f2937" stroke="none">
        {String(properties.name ?? "")}
      </text>
    </g>
  );
}

/** 램프: 패널 표시등 */
function LampSprite({ properties, runtime }: SymbolProps): ReactElement {
  const on = runtime?.energized ?? false;
  return (
    <g>
      <rect x={-14} y={-14} width={28} height={28} rx={14} fill="#1f2937" />
      <circle cx={0} cy={0} r={10} fill={on ? "#fde047" : "#6b7280"} />
      {on && <circle cx={0} cy={0} r={13} fill="#fde047" opacity={0.35} />}
      <text x={-14} y={24} fontSize={8} fill="#1f2937" stroke="none">
        {String(properties.name ?? "")}
      </text>
    </g>
  );
}

/** 솔레노이드: 코일 박스 + LED */
function SolenoidSprite({ properties, runtime }: SymbolProps): ReactElement {
  const on = runtime?.energized ?? false;
  return (
    <g>
      <rect x={-14} y={-12} width={28} height={24} rx={3} fill="#475569" stroke="#1f2937" strokeWidth={1.5} />
      <circle cx={0} cy={-2} r={4} fill={on ? "#fbbf24" : "#334155"} />
      <text x={-10} y={8} fontSize={7} fill="#e2e8f0" stroke="none">SOL</text>
      <text x={-14} y={22} fontSize={8} fill="#1f2937" stroke="none">
        {String(properties.label ?? "")}
      </text>
    </g>
  );
}

const spriteRegistry: Record<string, SpriteComponent> = {
  "pneu.source": CompressorSprite,
  "pneu.cylinder.double": CylinderSprite,
  "pneu.cylinder.single": CylinderSprite,
  "hyd.cylinder.double": CylinderSprite,
  "pneu.valve.3-2-manual": Valve32ManualSprite,
  "pneu.valve.3-2-roller": Valve32RollerSprite,
  "pneu.valve.5-2-manual": makeValve52Sprite("manual"),
  "pneu.valve.5-2-double-pilot": makeValve52Sprite("pilot-double"),
  "pneu.valve.5-2-single-pilot": makeValve52Sprite("pilot-single"),
  "pneu.valve.3-2-solenoid": Valve32SolenoidSprite,
  "pneu.valve.5-2-solenoid": makeValve52Sprite("sol-single"),
  "pneu.valve.5-2-double-solenoid": makeValve52Sprite("sol-double"),
  "elec.pushbutton": PushbuttonSprite,
  "elec.limit-switch": LimitSwitchSprite,
  "elec.lamp": LampSprite,
  "elec.solenoid": SolenoidSprite,
};

export function getSprite(type: string): SpriteComponent | null {
  return spriteRegistry[type] ?? null;
}

// ---------- MPS 스테이션 (Phase 14) ----------

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
 * MPS 스테이션 스프라이트. 정지 상태에서는 속성의 매거진 큐만 표시하고,
 * 실행 중에는 runtime.mps로 실린더·물품 흐름·램프를 애니메이션한다.
 * PB1~4는 실행 중 클릭 가능 (onButton — EquipmentView가 연결).
 */
export function MpsStationSprite({
  properties,
  runtime,
  onButton,
}: SymbolProps & {
  onButton?: (button: 0 | 1 | 2 | 3, active: boolean) => void;
}): ReactElement {
  const mps: MpsStationState | undefined = runtime?.mps;
  const magazine = mps ? mps.magazine : parseWorkpieceQueue(properties.workpieces);
  const cyl = mps?.cyl ?? { A: 0, B: 0, C: 0, D: 0 };
  const lamps = mps?.lamps ?? { red: false, yellow: false, green: false };
  const supply = mps?.supply ?? null;
  const belt = mps?.belt ?? [];
  const store = mps?.store ?? [];
  const eject = mps?.eject ?? [];
  const drillDrop = cyl.B * 14;
  const photoOn = belt.some((p) => p.progress >= 0.02 && p.progress <= 0.18);
  // 판별 센서 점등 (벨트 초입 감지 구간 — core DETECT_WINDOW와 동일 값)
  const detectAny = belt.some((p) => p.progress >= 0.06 && p.progress <= 0.24);
  const detectMetal = belt.some(
    (p) => p.progress >= 0.06 && p.progress <= 0.24 && p.material === "metal",
  );
  // 벨트 무늬 이동 (12px 주기)
  const dashShift = mps ? (mps.beltOffset * 26) % 12 : 0;

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
        const pressed = mps?.pb[i] ?? false;
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
        <g transform={`rotate(${mps?.drillAngle ?? 0}, -66, -36)`}>
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
