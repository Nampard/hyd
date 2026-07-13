import type { ReactElement, ReactNode } from "react";
import type { PressureState } from "../../core/sim/types";

/** 시뮬레이션 중 기호가 반영할 런타임 상태 (없으면 정지 상태로 작도) */
export interface SymbolRuntime {
  valvePosition?: number;
  cylinderPos?: number;
  manualActive?: boolean;
  energized?: boolean;
  contactClosed?: boolean;
  portState?: Record<string, PressureState>;
  portLevel?: Record<string, number>;
  motorAngle?: number;
}

export interface SymbolProps {
  properties: Record<string, unknown>;
  runtime?: SymbolRuntime;
}

type SymbolComponent = (props: SymbolProps) => ReactElement;

/**
 * 기호는 부품 로컬 좌표(rotation 0)로 그린다. 선 색은 currentColor —
 * 선택/상태 강조를 부모(ComponentView)에서 제어한다.
 */
const S = { stroke: "currentColor", strokeWidth: 2, fill: "none" } as const;
const Sthin = { stroke: "currentColor", strokeWidth: 1.5, fill: "none" } as const;

// ---------- 공용 프리미티브 ----------

/** 화살촉 포함 직선 (유로 표시) */
function FlowArrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 7;
  const a1 = angle + Math.PI - 0.4;
  const a2 = angle + Math.PI + 0.4;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} {...S} />
      <polygon
        points={`${x2},${y2} ${x2 + size * Math.cos(a1)},${y2 + size * Math.sin(a1)} ${x2 + size * Math.cos(a2)},${y2 + size * Math.sin(a2)}`}
        fill="currentColor"
        stroke="none"
      />
    </g>
  );
}

/** 차단 표시 (포트 안쪽 T) — x: 포트 x, side: 포트가 붙은 변 */
function BlockedT({ x, side }: { x: number; side: "top" | "bottom" }) {
  const yEdge = side === "bottom" ? 20 : -20;
  const yIn = side === "bottom" ? 8 : -8;
  return (
    <g>
      <line x1={x} y1={yEdge} x2={x} y2={yIn} {...S} />
      <line x1={x - 5} y1={yIn} x2={x + 5} y2={yIn} {...S} />
    </g>
  );
}

/** 스프링 (수평, x에서 바깥 방향으로) */
function SpringH({ x, dir }: { x: number; dir: 1 | -1 }) {
  const p = (i: number) => x + dir * i;
  return (
    <polyline
      points={`${p(0)},0 ${p(4)},-6 ${p(8)},6 ${p(12)},-6 ${p(16)},6 ${p(20)},0`}
      {...Sthin}
    />
  );
}

/** 활성 조작부 강조 (초록 글로우) */
function ActiveGlow({ cx, cy = 0, r = 15 }: { cx: number; cy?: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="#4ade80" opacity={0.4} stroke="none" />;
}

/** 푸시버튼 조작부 (왼쪽 끝, active 시 눌린 표현) */
function PushButton({ x, active }: { x: number; active?: boolean }) {
  const ox = active ? 8 : 0; // 눌리면 몸통 쪽으로 깊게
  return (
    <g>
      {active && <ActiveGlow cx={x - 10 + ox} />}
      <line x1={x} y1={0} x2={x - 8 + ox} y2={0} {...S} />
      <line x1={x - 8 + ox} y1={-8} x2={x - 8 + ox} y2={8} {...S} />
      <line x1={x - 14 + ox} y1={-8} x2={x - 14 + ox} y2={8} {...S} />
      <line x1={x - 14 + ox} y1={-8} x2={x - 8 + ox} y2={-8} {...S} />
      <line x1={x - 14 + ox} y1={8} x2={x - 8 + ox} y2={8} {...S} />
      {active && <rect x={x - 13 + ox} y={-7} width={4} height={14} fill="currentColor" stroke="none" />}
    </g>
  );
}

/** 레버(디텐트) 조작부 */
function Lever({ x, active }: { x: number; active?: boolean }) {
  const tilt = active ? 14 : -14; // 기울기를 크게 해 상태가 눈에 띄게
  return (
    <g>
      {active && <ActiveGlow cx={x - 13} />}
      <line x1={x} y1={0} x2={x - 8} y2={0} {...S} />
      <line x1={x - 8} y1={8} x2={x - 8} y2={-8} {...S} />
      <line x1={x - 8} y1={0} x2={x - 19} y2={tilt} {...S} />
      <circle cx={x - 19} cy={tilt} r={3.5} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} />
      {/* 디텐트 표시 */}
      <line x1={x - 6} y1={10} x2={x - 2} y2={10} {...Sthin} />
      <line x1={x - 6} y1={13} x2={x - 2} y2={13} {...Sthin} />
    </g>
  );
}

/** 롤러 조작부 */
function Roller({ x, active }: { x: number; active?: boolean }) {
  const ox = active ? 5 : 0; // 캠에 눌리면 플런저가 들어감
  return (
    <g>
      {active && <ActiveGlow cx={x - 10} r={13} />}
      <line x1={x} y1={0} x2={x - 8 + ox} y2={0} {...S} />
      <line x1={x - 8 + ox} y1={-8} x2={x - 8 + ox} y2={8} {...S} />
      <circle cx={x - 13 + ox} cy={0} r={5} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} />
    </g>
  );
}

/** 공압 파일럿 조작부 (측면 사각형 + 점선) */
function PilotGlyph({ x, dir }: { x: number; dir: 1 | -1 }) {
  const w = 10;
  const x0 = dir === -1 ? x - w : x;
  return (
    <g>
      <rect x={x0} y={-7} width={w} height={14} {...Sthin} />
      <line x1={x0 + (dir === -1 ? 0 : w)} y1={0} x2={x0 + (dir === -1 ? -6 : w + 6)} y2={0} {...Sthin} />
    </g>
  );
}

/**
 * 방향제어밸브 공용 본체.
 * 박스는 왼쪽부터 index 0, 포트는 restIndex 박스 자리에 고정 접속.
 * 시뮬레이션 중 현재 위치에 따라 본체가 슬라이드한다.
 */
function ValveBody({
  boxW,
  boxes,
  restIndex,
  current,
  sliding,
  children,
}: {
  boxW: number;
  boxes: ReactNode[]; // 박스별 내부 유로 (각 박스 원점 = 박스 왼쪽 위 모서리 기준 아님 — 박스 왼쪽 x)
  restIndex: number;
  current: number;
  /** 본체와 함께 슬라이드하는 요소 (조작부·스프링 — 실물처럼 몸통에 부착) */
  sliding?: ReactNode;
  children?: ReactNode; // 고정 요소 (포트 스텁, 라벨, 파일럿 포트)
}) {
  const shift = (restIndex - current) * boxW;
  // restIndex 박스의 왼쪽 x = 0이 되도록 배치: box i 왼쪽 x = (i - restIndex) * boxW
  return (
    <g>
      <g transform={`translate(${shift}, 0)`} style={{ transition: "transform 80ms linear" }}>
        {boxes.map((content, i) => {
          const left = (i - restIndex) * boxW;
          return (
            <g key={i} transform={`translate(${left}, 0)`}>
              <rect x={0} y={-20} width={boxW} height={40} {...S} />
              {content}
            </g>
          );
        })}
        {sliding}
      </g>
      {children}
    </g>
  );
}

// ---------- 부품 기호 ----------

function PneumaticSource(_: SymbolProps): ReactElement {
  return (
    <g>
      <circle cx={0} cy={0} r={15} {...S} />
      <polygon points="-7,6 7,6 0,-8" fill="currentColor" stroke="none" />
      <line x1={0} y1={-15} x2={0} y2={-30} {...S} />
    </g>
  );
}

function ServiceUnit(_: SymbolProps): ReactElement {
  return (
    <g>
      <rect x={-20} y={-20} width={40} height={40} {...S} />
      {/* 필터 + 드레인 (단순화 표기) */}
      <line x1={-20} y1={-20} x2={20} y2={20} {...Sthin} />
      <line x1={-20} y1={20} x2={20} y2={-20} {...Sthin} />
      <line x1={-30} y1={0} x2={-20} y2={0} {...S} />
      <line x1={20} y1={0} x2={30} y2={0} {...S} />
    </g>
  );
}

function Silencer(_: SymbolProps): ReactElement {
  return (
    <g>
      <line x1={0} y1={-20} x2={0} y2={-8} {...S} />
      <polygon points="-12,-8 12,-8 0,14" {...S} />
      <line x1={-6} y1={0} x2={6} y2={0} {...Sthin} />
    </g>
  );
}

function Tee(_: SymbolProps): ReactElement {
  return (
    <g>
      <line x1={-20} y1={0} x2={20} y2={0} {...S} />
      <line x1={0} y1={0} x2={0} y2={20} {...S} />
      <circle cx={0} cy={0} r={3} fill="currentColor" stroke="none" />
    </g>
  );
}

/** 3/2 NC — 박스0: P→A / 박스1(정지): A→R, P차단. 포트 A(20,-30) P(10,30) R(30,30) */
function Valve32({ properties, runtime, leftKind }: SymbolProps & { leftKind: "manual" | "roller" }): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  const active = runtime?.manualActive ?? false;
  const isLever = properties.actuation === "lever";
  const boxes = [
    // 박스0 (조작 시): P(rel10)→A(rel20)
    <g key="0">
      <FlowArrow x1={10} y1={20} x2={20} y2={-20} />
      <BlockedT x={30} side="bottom" />
    </g>,
    // 박스1 (정지): A(rel20)→R(rel30), P(rel10) 차단
    <g key="1">
      <FlowArrow x1={20} y1={-20} x2={30} y2={20} />
      <BlockedT x={10} side="bottom" />
    </g>,
  ];
  return (
    <g>
      <ValveBody
        boxW={40}
        boxes={boxes}
        restIndex={1}
        current={current}
        sliding={
          <>
            {leftKind === "roller" ? (
              <Roller x={-40} active={current === 0} />
            ) : isLever ? (
              <Lever x={-40} active={active} />
            ) : (
              <PushButton x={-40} active={active} />
            )}
            <SpringH x={40} dir={1} />
          </>
        }
      >
        {/* 포트 스텁 + 라벨 (고정) */}
        <line x1={20} y1={-20} x2={20} y2={-30} {...S} />
        <line x1={10} y1={20} x2={10} y2={30} {...S} />
        <line x1={30} y1={20} x2={30} y2={30} {...S} />
        <text x={13} y={-33} fontSize={9} fill="currentColor" stroke="none">A</text>
        <text x={2} y={40} fontSize={9} fill="currentColor" stroke="none">P</text>
        <text x={34} y={40} fontSize={9} fill="currentColor" stroke="none">R</text>
      </ValveBody>
      {leftKind === "roller" && (
        <text x={-62} y={34} fontSize={9} fill="currentColor" stroke="none">
          {String(properties.cylinderLabel ?? "")}
          {properties.triggerAt === "retracted" ? "▾" : "▴"}
        </text>
      )}
    </g>
  );
}

/** 5/2 공용 박스 (60폭). 포트: A(20,-30) B(40,-30) R1(10,30) P(30,30) R2(50,30) */
const valve52Boxes = [
  // 박스0: P(rel30)→A(rel20), B(rel40)→R2(rel50)
  <g key="0">
    <FlowArrow x1={30} y1={20} x2={20} y2={-20} />
    <FlowArrow x1={40} y1={-20} x2={50} y2={20} />
    <BlockedT x={10} side="bottom" />
  </g>,
  // 박스1: P(rel30)→B(rel40), A(rel20)→R1(rel10)
  <g key="1">
    <FlowArrow x1={30} y1={20} x2={40} y2={-20} />
    <FlowArrow x1={20} y1={-20} x2={10} y2={20} />
    <BlockedT x={50} side="bottom" />
  </g>,
];

function Valve52Stubs(): ReactElement {
  return (
    <g>
      <line x1={20} y1={-20} x2={20} y2={-30} {...S} />
      <line x1={40} y1={-20} x2={40} y2={-30} {...S} />
      <line x1={10} y1={20} x2={10} y2={30} {...S} />
      <line x1={30} y1={20} x2={30} y2={30} {...S} />
      <line x1={50} y1={20} x2={50} y2={30} {...S} />
      <text x={14} y={-33} fontSize={9} fill="currentColor" stroke="none">A</text>
      <text x={37} y={-33} fontSize={9} fill="currentColor" stroke="none">B</text>
      <text x={2} y={40} fontSize={9} fill="currentColor" stroke="none">R1</text>
      <text x={26} y={40} fontSize={9} fill="currentColor" stroke="none">P</text>
      <text x={45} y={40} fontSize={9} fill="currentColor" stroke="none">R2</text>
    </g>
  );
}

function Valve52Manual({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  const active = runtime?.manualActive ?? false;
  const isLever = (properties.actuation ?? "lever") === "lever";
  return (
    <g>
      <ValveBody
        boxW={60}
        boxes={valve52Boxes}
        restIndex={1}
        current={current}
        sliding={
          <>
            {isLever ? <Lever x={-60} active={active} /> : <PushButton x={-60} active={active} />}
            <SpringH x={60} dir={1} />
          </>
        }
      >
        <Valve52Stubs />
      </ValveBody>
    </g>
  );
}

function Valve52DoublePilot({ properties, runtime }: SymbolProps): ReactElement {
  const rest = properties.initialPosition === "left" ? 0 : 1;
  const current = runtime?.valvePosition ?? rest;
  // 포트는 항상 오른쪽 박스 자리 기준 (라이브러리 정의와 일치: restIndex=1)
  return (
    <g>
      <ValveBody boxW={60} boxes={valve52Boxes} restIndex={1} current={current}>
        <Valve52Stubs />
      </ValveBody>
      <PilotGlyph x={-60} dir={-1} />
      <PilotGlyph x={60} dir={1} />
      <text x={-69} y={-11} fontSize={9} fill="currentColor" stroke="none">X</text>
      <text x={63} y={-11} fontSize={9} fill="currentColor" stroke="none">Y</text>
    </g>
  );
}

function Valve52SinglePilot({ runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  return (
    <g>
      <ValveBody
        boxW={60}
        boxes={valve52Boxes}
        restIndex={1}
        current={current}
        sliding={<SpringH x={60} dir={1} />}
      >
        <Valve52Stubs />
      </ValveBody>
      <PilotGlyph x={-60} dir={-1} />
      <text x={-69} y={-11} fontSize={9} fill="currentColor" stroke="none">X</text>
    </g>
  );
}

function cylinderPiston(properties: Record<string, unknown>, runtime?: SymbolRuntime): number {
  const pos =
    runtime?.cylinderPos ?? (properties.initialPosition === "extended" ? 1 : 0);
  return -26 + pos * 40;
}

function CylinderDouble({ properties, runtime }: SymbolProps): ReactElement {
  const pistonX = cylinderPiston(properties, runtime);
  return (
    <g>
      <rect x={-40} y={-15} width={70} height={30} {...S} />
      <line x1={pistonX} y1={-15} x2={pistonX} y2={15} {...S} strokeWidth={4} />
      {/* 로드: 후진 시에도 몸통 밖으로 돌출 (피스톤 + 70) */}
      <line x1={pistonX} y1={0} x2={pistonX + 70} y2={0} {...S} strokeWidth={3} />
      <line x1={pistonX + 70} y1={-6} x2={pistonX + 70} y2={6} {...S} strokeWidth={3} />
      <line x1={-30} y1={15} x2={-30} y2={20} {...S} />
      <line x1={20} y1={15} x2={20} y2={20} {...S} />
      <text x={-40} y={-19} fontSize={10} fontWeight={700} fill="currentColor" stroke="none">
        {String(properties.label ?? "")}
      </text>
    </g>
  );
}

function CylinderSingle({ properties, runtime }: SymbolProps): ReactElement {
  const pistonX = cylinderPiston(properties, runtime);
  return (
    <g>
      <rect x={-40} y={-15} width={70} height={30} {...S} />
      <line x1={pistonX} y1={-15} x2={pistonX} y2={15} {...S} strokeWidth={4} />
      {/* 로드: 후진 시에도 몸통 밖으로 돌출 (피스톤 + 70) */}
      <line x1={pistonX} y1={0} x2={pistonX + 70} y2={0} {...S} strokeWidth={3} />
      <line x1={pistonX + 70} y1={-6} x2={pistonX + 70} y2={6} {...S} strokeWidth={3} />
      {/* 복귀 스프링 (피스톤~로드측 단부 사이 압축) */}
      <polyline
        points={`${pistonX + 2},0 ${pistonX + 8},-9 ${pistonX + 14},9 ${pistonX + 20},-9 ${Math.min(pistonX + 26, 28)},9 30,0`}
        {...Sthin}
      />
      <line x1={-30} y1={15} x2={-30} y2={20} {...S} />
      <text x={-40} y={-19} fontSize={10} fontWeight={700} fill="currentColor" stroke="none">
        {String(properties.label ?? "")}
      </text>
    </g>
  );
}

/**
 * 일방향 유량제어밸브 (속도제어밸브) — ISO 1219:
 * 점선 테두리 안에 가변 교축(마주보는 호 + 대각 화살표)과 병렬 체크밸브(볼·시트).
 * 체크 자유 흐름 A→B, 교축은 B→A 방향에 작용 (restrictor 동작 명세와 일치).
 */
function SpeedController({ properties }: SymbolProps): ReactElement {
  return (
    <g>
      <rect x={-22} y={-22} width={44} height={44} {...Sthin} strokeDasharray="3 2" />
      {/* 외부 포트 접속 + 내부 분기 */}
      <line x1={-30} y1={0} x2={-18} y2={0} {...S} />
      <line x1={18} y1={0} x2={30} y2={0} {...S} />
      <circle cx={-18} cy={0} r={1.5} fill="currentColor" stroke="none" />
      <circle cx={18} cy={0} r={1.5} fill="currentColor" stroke="none" />

      {/* 상단 가지: 가변 교축 */}
      <line x1={-18} y1={0} x2={-18} y2={-10} {...Sthin} />
      <line x1={18} y1={0} x2={18} y2={-10} {...Sthin} />
      <line x1={-18} y1={-10} x2={-4} y2={-10} {...Sthin} />
      <line x1={4} y1={-10} x2={18} y2={-10} {...Sthin} />
      <path d="M -6 -17 Q 0 -10 -6 -3" {...Sthin} />
      <path d="M 6 -17 Q 0 -10 6 -3" {...Sthin} />
      <line x1={-4} y1={-10} x2={4} y2={-10} {...Sthin} />
      {/* 가변(조절) 대각 화살표 */}
      <line x1={-9} y1={-1} x2={9} y2={-19} {...Sthin} />
      <polygon points="9,-19 3.5,-17.5 7.5,-13.5" fill="currentColor" stroke="none" />

      {/* 하단 가지: 체크밸브 (자유 흐름 A→B, 볼이 시트에서 밀려남) */}
      <line x1={-18} y1={0} x2={-18} y2={12} {...Sthin} />
      <line x1={18} y1={0} x2={18} y2={12} {...Sthin} />
      <line x1={-18} y1={12} x2={-8} y2={12} {...Sthin} />
      <line x1={8} y1={12} x2={18} y2={12} {...Sthin} />
      <polyline points="-8,7 -2,12 -8,17" {...Sthin} />
      <circle cx={3} cy={12} r={4.5} {...Sthin} />

      <text x={-30} y={-12} fontSize={9} fill="currentColor" stroke="none">A</text>
      <text x={25} y={-12} fontSize={9} fill="currentColor" stroke="none">B</text>
      <text x={-20} y={34} fontSize={8} fill="currentColor" stroke="none">
        개도 {Number(properties.openness ?? 0.5).toFixed(2)}
      </text>
    </g>
  );
}

function Shuttle({ runtime }: SymbolProps): ReactElement {
  const x1On = runtime?.portState?.X1 === "pressurized";
  const x2On = runtime?.portState?.X2 === "pressurized";
  const ballX = x1On && !x2On ? 8 : x2On && !x1On ? -8 : 0;
  return (
    <g>
      <rect x={-20} y={-10} width={40} height={20} rx={10} {...S} />
      <circle cx={ballX} cy={0} r={6} fill="currentColor" stroke="none" />
      <line x1={-30} y1={0} x2={-20} y2={0} {...S} />
      <line x1={20} y1={0} x2={30} y2={0} {...S} />
      <line x1={0} y1={-10} x2={0} y2={-20} {...S} />
    </g>
  );
}

function TwoPressure(_: SymbolProps): ReactElement {
  return (
    <g>
      <rect x={-20} y={-10} width={40} height={20} {...S} />
      {/* 양쪽에서 중앙으로 */}
      <line x1={-14} y1={0} x2={-4} y2={0} {...Sthin} />
      <line x1={14} y1={0} x2={4} y2={0} {...Sthin} />
      <line x1={-4} y1={-5} x2={-4} y2={5} {...Sthin} />
      <line x1={4} y1={-5} x2={4} y2={5} {...Sthin} />
      <line x1={-30} y1={0} x2={-20} y2={0} {...S} />
      <line x1={20} y1={0} x2={30} y2={0} {...S} />
      <line x1={0} y1={-10} x2={0} y2={-20} {...S} />
    </g>
  );
}

function QuickExhaust(_: SymbolProps): ReactElement {
  return (
    <g>
      <rect x={-20} y={-12} width={40} height={24} {...S} />
      <line x1={-30} y1={0} x2={-20} y2={0} {...S} />
      <line x1={0} y1={-12} x2={0} y2={-20} {...S} />
      <line x1={0} y1={12} x2={0} y2={20} {...S} />
      <polygon points="-4,14 4,14 0,20" fill="currentColor" stroke="none" />
      <text x={-27} y={-14} fontSize={9} fill="currentColor" stroke="none">P</text>
      <text x={5} y={-16} fontSize={9} fill="currentColor" stroke="none">A</text>
    </g>
  );
}

// ---------- 솔레노이드 밸브 ----------

/** 솔레노이드 조작부 (사각형 + 대각선), 라벨 표시 */
function SolenoidGlyph({ x, dir, label, active }: { x: number; dir: 1 | -1; label: string; active?: boolean }) {
  const w = 14;
  const x0 = dir === -1 ? x - w : x;
  return (
    <g>
      {active && <ActiveGlow cx={x0 + w / 2} r={14} />}
      <rect x={x0} y={-8} width={w} height={16} {...Sthin} fill={active ? "currentColor" : "none"} />
      <line x1={x0} y1={8} x2={x0 + w} y2={-8} {...Sthin} />
      <text x={x0 - 2} y={dir === -1 ? -12 : 22} fontSize={9} fill="currentColor" stroke="none">
        {label}
      </text>
    </g>
  );
}

function Valve32Solenoid({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  const boxes = [
    <g key="0">
      <FlowArrow x1={10} y1={20} x2={20} y2={-20} />
      <BlockedT x={30} side="bottom" />
    </g>,
    <g key="1">
      <FlowArrow x1={20} y1={-20} x2={30} y2={20} />
      <BlockedT x={10} side="bottom" />
    </g>,
  ];
  return (
    <g>
      <ValveBody
        boxW={40}
        boxes={boxes}
        restIndex={1}
        current={current}
        sliding={
          <>
            <SolenoidGlyph x={-40} dir={-1} label={String(properties.solenoidLeft ?? "")} active={current === 0} />
            <SpringH x={40} dir={1} />
          </>
        }
      >
        <line x1={20} y1={-20} x2={20} y2={-30} {...S} />
        <line x1={10} y1={20} x2={10} y2={30} {...S} />
        <line x1={30} y1={20} x2={30} y2={30} {...S} />
        <text x={13} y={-33} fontSize={9} fill="currentColor" stroke="none">A</text>
        <text x={2} y={40} fontSize={9} fill="currentColor" stroke="none">P</text>
        <text x={34} y={40} fontSize={9} fill="currentColor" stroke="none">R</text>
      </ValveBody>
    </g>
  );
}

function Valve52Solenoid({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  return (
    <g>
      <ValveBody
        boxW={60}
        boxes={valve52Boxes}
        restIndex={1}
        current={current}
        sliding={
          <>
            <SolenoidGlyph x={-60} dir={-1} label={String(properties.solenoidLeft ?? "")} active={current === 0} />
            <SpringH x={60} dir={1} />
          </>
        }
      >
        <Valve52Stubs />
      </ValveBody>
    </g>
  );
}

function Valve52DoubleSolenoid({ properties, runtime }: SymbolProps): ReactElement {
  const rest = properties.initialPosition === "left" ? 0 : 1;
  const current = runtime?.valvePosition ?? rest;
  return (
    <g>
      <ValveBody
        boxW={60}
        boxes={valve52Boxes}
        restIndex={1}
        current={current}
        sliding={
          <>
            <SolenoidGlyph x={-60} dir={-1} label={String(properties.solenoidLeft ?? "")} active={current === 0} />
            <SolenoidGlyph x={60} dir={1} label={String(properties.solenoidRight ?? "")} active={current === 1} />
          </>
        }
      >
        <Valve52Stubs />
      </ValveBody>
    </g>
  );
}

/** 5/3 클로즈드 센터 — 포트는 중앙 박스 (박스 왼쪽 x=-30) */
function Valve53DoubleSolenoid({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  const boxes = [
    // 박스0: P→A, B→R2 (중앙 박스 기준 상대 위치와 동일 배치: A rel20, B rel40, R1 rel10, P rel30, R2 rel50)
    <g key="0">
      <FlowArrow x1={30} y1={20} x2={20} y2={-20} />
      <FlowArrow x1={40} y1={-20} x2={50} y2={20} />
      <BlockedT x={10} side="bottom" />
    </g>,
    // 박스1: 클로즈드 센터 — 전부 차단
    <g key="1">
      <BlockedT x={20} side="top" />
      <BlockedT x={40} side="top" />
      <BlockedT x={10} side="bottom" />
      <BlockedT x={30} side="bottom" />
      <BlockedT x={50} side="bottom" />
    </g>,
    // 박스2: P→B, A→R1
    <g key="2">
      <FlowArrow x1={30} y1={20} x2={40} y2={-20} />
      <FlowArrow x1={20} y1={-20} x2={10} y2={20} />
      <BlockedT x={50} side="bottom" />
    </g>,
  ];
  // 포트가 중앙 박스에 붙으므로 restIndex=1. 포트 스텁은 중앙 박스 자리(-30..30) 기준.
  return (
    <g transform="translate(-30, 0)">
      {/* ValveBody는 restIndex 박스 왼쪽을 x=0으로 두므로 -30 이동해 부품 원점(중앙 박스 중심)과 맞춘다 */}
      <ValveBody
        boxW={60}
        boxes={boxes}
        restIndex={1}
        current={current}
        sliding={
          <>
            <SolenoidGlyph x={-60} dir={-1} label={String(properties.solenoidLeft ?? "")} active={current === 0} />
            <SolenoidGlyph x={120} dir={1} label={String(properties.solenoidRight ?? "")} active={current === 2} />
            <g transform="translate(-8,0)"><SpringH x={-60} dir={-1} /></g>
            <g transform="translate(8,0)"><SpringH x={120} dir={1} /></g>
          </>
        }
      >
        <Valve52Stubs />
      </ValveBody>
    </g>
  );
}

// ---------- 유압 기호 ----------

function HydPowerUnit(_: SymbolProps): ReactElement {
  return (
    <g>
      {/* 펌프 (P 라인) */}
      <circle cx={-10} cy={-5} r={12} {...S} />
      <polygon points="-16,-1 -4,-1 -10,-14" fill="currentColor" stroke="none" />
      <line x1={-10} y1={-17} x2={-10} y2={-30} {...S} />
      {/* 탱크 (T 라인) */}
      <line x1={20} y1={-30} x2={20} y2={12} {...S} />
      <polyline points="8,12 8,24 32,24 32,12" {...S} />
      <text x={-16} y={-34} fontSize={9} fill="currentColor" stroke="none">P</text>
      <text x={16} y={-34} fontSize={9} fill="currentColor" stroke="none">T</text>
    </g>
  );
}

function HydTank(_: SymbolProps): ReactElement {
  return (
    <g>
      <line x1={0} y1={-20} x2={0} y2={4} {...S} />
      <polyline points="-12,4 -12,16 12,16 12,4" {...S} />
    </g>
  );
}

function HydGauge({ runtime }: SymbolProps): ReactElement {
  const hot = runtime?.portState?.P === "pressurized";
  const level = runtime?.portLevel?.P ?? 0;
  // 바늘: 0bar 좌측(-60도) ~ 100bar 우측(+60도)
  const angle = -60 + Math.min(level / 100, 1) * 120;
  const rad = ((angle - 90) * Math.PI) / 180;
  return (
    <g>
      <circle cx={0} cy={-3} r={11} {...S} fill={hot ? "var(--energized)" : "none"} />
      <line x1={0} y1={-3} x2={9 * Math.cos(rad)} y2={-3 + 9 * Math.sin(rad)} {...Sthin} />
      <line x1={0} y1={8} x2={0} y2={20} {...S} />
      {runtime && (
        <text x={13} y={0} fontSize={9} fontWeight={700} fill="currentColor" stroke="none">
          {Math.round(level * 10) / 10} bar
        </text>
      )}
    </g>
  );
}

function HydRelief(_: SymbolProps): ReactElement {
  return (
    <g>
      <rect x={-15} y={-20} width={30} height={40} {...S} />
      {/* 정상 차단 + 압력 초과 시 열림 (화살표 오프셋) */}
      <FlowArrow x1={-8} y1={14} x2={-8} y2={-14} />
      <SpringH x={15} dir={1} />
      <line x1={0} y1={-30} x2={0} y2={-20} {...S} />
      <line x1={0} y1={20} x2={0} y2={30} {...S} />
      <text x={4} y={-33} fontSize={9} fill="currentColor" stroke="none">P</text>
      <text x={4} y={39} fontSize={9} fill="currentColor" stroke="none">T</text>
    </g>
  );
}

/** 4포트 밸브 스텁 (A,B 상단 / P,T 하단) */
function Valve4Stubs(): ReactElement {
  return (
    <g>
      <line x1={20} y1={-20} x2={20} y2={-30} {...S} />
      <line x1={40} y1={-20} x2={40} y2={-30} {...S} />
      <line x1={20} y1={20} x2={20} y2={30} {...S} />
      <line x1={40} y1={20} x2={40} y2={30} {...S} />
      <text x={14} y={-33} fontSize={9} fill="currentColor" stroke="none">A</text>
      <text x={37} y={-33} fontSize={9} fill="currentColor" stroke="none">B</text>
      <text x={14} y={40} fontSize={9} fill="currentColor" stroke="none">P</text>
      <text x={37} y={40} fontSize={9} fill="currentColor" stroke="none">T</text>
    </g>
  );
}

const valve42Boxes = [
  // 박스0: P→A(수직), B→T(수직 하향)
  <g key="0">
    <FlowArrow x1={20} y1={20} x2={20} y2={-20} />
    <FlowArrow x1={40} y1={-20} x2={40} y2={20} />
  </g>,
  // 박스1: P→B, A→T (교차)
  <g key="1">
    <FlowArrow x1={20} y1={20} x2={40} y2={-20} />
    <FlowArrow x1={20} y1={-20} x2={40} y2={20} />
  </g>,
];

function HydValve42Lever({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  const active = runtime?.manualActive ?? false;
  const isLever = (properties.actuation ?? "lever") === "lever";
  return (
    <g>
      <ValveBody
        boxW={60}
        boxes={valve42Boxes}
        restIndex={1}
        current={current}
        sliding={
          <>
            {isLever ? <Lever x={-60} active={active} /> : <PushButton x={-60} active={active} />}
            <SpringH x={60} dir={1} />
          </>
        }
      >
        <Valve4Stubs />
      </ValveBody>
    </g>
  );
}

function HydValve43({ properties, runtime, center }: SymbolProps & { center: "closed" | "tandem" }): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  const boxes = [
    <g key="0">
      <FlowArrow x1={20} y1={20} x2={20} y2={-20} />
      <FlowArrow x1={40} y1={-20} x2={40} y2={20} />
    </g>,
    center === "closed" ? (
      <g key="1">
        <BlockedT x={20} side="top" />
        <BlockedT x={40} side="top" />
        <BlockedT x={20} side="bottom" />
        <BlockedT x={40} side="bottom" />
      </g>
    ) : (
      <g key="1">
        {/* 탠덤: P→T 우회, A/B 차단 */}
        <polyline points="20,20 20,6 40,6" {...S} />
        <FlowArrow x1={40} y1={6} x2={40} y2={20} />
        <BlockedT x={20} side="top" />
        <BlockedT x={40} side="top" />
      </g>
    ),
    <g key="2">
      <FlowArrow x1={20} y1={20} x2={40} y2={-20} />
      <FlowArrow x1={20} y1={-20} x2={40} y2={20} />
    </g>,
  ];
  return (
    <g transform="translate(-30, 0)">
      <ValveBody
        boxW={60}
        boxes={boxes}
        restIndex={1}
        current={current}
        sliding={
          <>
            <SolenoidGlyph x={-60} dir={-1} label={String(properties.solenoidLeft ?? "")} active={current === 0} />
            <SolenoidGlyph x={120} dir={1} label={String(properties.solenoidRight ?? "")} active={current === 2} />
          </>
        }
      >
        <Valve4Stubs />
      </ValveBody>
    </g>
  );
}

function HydCheck({ pilot }: { pilot?: boolean }): ReactElement {
  return (
    <g>
      <line x1={-30} y1={0} x2={-12} y2={0} {...S} />
      {/* 시트(V) + 볼: A→B 자유 */}
      <polyline points="-2,-8 -12,0 -2,8" {...S} />
      <circle cx={-4} cy={0} r={6} {...S} />
      <line x1={2} y1={0} x2={30} y2={0} {...S} />
      {pilot && <line x1={0} y1={30} x2={-4} y2={8} {...Sthin} strokeDasharray="4 3" />}
      <text x={-30} y={-12} fontSize={9} fill="currentColor" stroke="none">A</text>
      <text x={24} y={-12} fontSize={9} fill="currentColor" stroke="none">B</text>
    </g>
  );
}

/** 감압밸브: 정상 열림 + 출구 파일럿 점선 + 스프링 */
function HydReducing({ properties }: SymbolProps): ReactElement {
  return (
    <g>
      <rect x={-20} y={-15} width={40} height={30} {...S} />
      <FlowArrow x1={-20} y1={0} x2={14} y2={0} />
      <line x1={-30} y1={0} x2={-20} y2={0} {...S} />
      <line x1={20} y1={0} x2={30} y2={0} {...S} />
      {/* 출구압 파일럿 (점선) + 스프링 */}
      <polyline points="24,0 24,22 0,22 0,15" {...Sthin} strokeDasharray="4 3" />
      <g transform="translate(0,-15) rotate(90)"><SpringH x={0} dir={-1} /></g>
      <text x={-14} y={28} fontSize={8} fill="currentColor" stroke="none">
        {Number(properties.pressure ?? 20)} bar
      </text>
    </g>
  );
}

/** 압력 스위치: 접점 + 압력 파일럿 표시 (공압/유압 공용) */
function PressureSwitchSymbol({ properties, runtime }: SymbolProps): ReactElement {
  const closed = contactClosedNow(properties, runtime);
  const isNC = properties.contactType === "NC";
  return (
    <g>
      <ContactGlyph closed={closed} />
      {isNC && <NcBar />}
      {/* 압력 파일럿 (왼쪽 아래 유체 포트에서 점선) */}
      <line x1={-20} y1={10} x2={-6} y2={4} {...Sthin} strokeDasharray="3 2" />
      <polygon points="-8,2 -3,7 -9,8" fill="currentColor" stroke="none" />
      <text x={6} y={4} fontSize={9} fill="currentColor" stroke="none">
        {String(properties.name ?? "")} ≥{Number(properties.threshold ?? 0)}
      </text>
    </g>
  );
}

/** 유압 모터: 원 + 채운 삼각형, 축 표시선이 motorAngle만큼 회전 */
function HydMotor({ runtime }: SymbolProps): ReactElement {
  const angle = runtime?.motorAngle ?? 0;
  return (
    <g>
      <circle cx={0} cy={0} r={16} {...S} />
      <polygon points="-6,10 6,10 0,-2" fill="currentColor" stroke="none" />
      <g transform={`rotate(${angle})`}>
        <line x1={0} y1={0} x2={0} y2={-13} {...Sthin} />
        <circle cx={0} cy={-13} r={2} fill="currentColor" stroke="none" />
      </g>
      <line x1={-10} y1={12.5} x2={-10} y2={30} {...S} />
      <line x1={10} y1={12.5} x2={10} y2={30} {...S} />
      <text x={-17} y={40} fontSize={9} fill="currentColor" stroke="none">A</text>
      <text x={13} y={40} fontSize={9} fill="currentColor" stroke="none">B</text>
    </g>
  );
}

// ---------- 전기 기호 (세로 배치: T 위, B 아래) ----------

/** 접점 공용: 열림/닫힘 상태로 작도. 세로 단자 (0,-20)-(0,20) */
function ContactGlyph({ closed }: { closed: boolean }) {
  return (
    <g>
      <line x1={0} y1={-20} x2={0} y2={-8} {...S} />
      <line x1={0} y1={8} x2={0} y2={20} {...S} />
      {closed ? (
        <line x1={0} y1={-8} x2={0} y2={8} {...S} />
      ) : (
        <line x1={0} y1={8} x2={-9} y2={-7} {...S} />
      )}
    </g>
  );
}

/** NC 표시용 가로 막대 */
function NcBar() {
  return <line x1={-2} y1={-8} x2={7} y2={-8} {...S} />;
}

function contactClosedNow(properties: Record<string, unknown>, runtime?: SymbolRuntime): boolean {
  if (runtime?.contactClosed !== undefined) return runtime.contactClosed;
  return properties.contactType === "NC"; // 편집 모드: 정상 상태로 작도
}

function ElecPushbutton({ properties, runtime }: SymbolProps): ReactElement {
  const closed = contactClosedNow(properties, runtime);
  const pressed = runtime?.manualActive ?? false;
  const isNC = properties.contactType === "NC";
  return (
    <g>
      <ContactGlyph closed={closed} />
      {isNC && <NcBar />}
      {/* 조작부 (왼쪽): 버튼 캡 + 점선 연결 */}
      {pressed && <ActiveGlow cx={-20} r={12} />}
      <line x1={-18 + (pressed ? 5 : 0)} y1={0} x2={-6} y2={0} {...Sthin} strokeDasharray="2 2" />
      <line x1={-18 + (pressed ? 5 : 0)} y1={-6} x2={-18 + (pressed ? 5 : 0)} y2={6} {...S} />
      <line x1={-24 + (pressed ? 5 : 0)} y1={-6} x2={-24 + (pressed ? 5 : 0)} y2={6} {...S} />
      <text x={6} y={4} fontSize={9} fill="currentColor" stroke="none">
        {String(properties.name ?? "")}
      </text>
    </g>
  );
}

function ElecLimitSwitch({ properties, runtime }: SymbolProps): ReactElement {
  const closed = contactClosedNow(properties, runtime);
  const isNC = properties.contactType === "NC";
  return (
    <g>
      <ContactGlyph closed={closed} />
      {isNC && <NcBar />}
      <line x1={-16} y1={0} x2={-6} y2={0} {...Sthin} strokeDasharray="2 2" />
      <circle cx={-19} cy={0} r={4} {...Sthin} />
      <text x={6} y={4} fontSize={9} fill="currentColor" stroke="none">
        {String(properties.name ?? "")} ({String(properties.cylinderLabel ?? "")}
        {properties.triggerAt === "retracted" ? "▾" : "▴"})
      </text>
    </g>
  );
}

function ElecRelayContact({ properties, runtime }: SymbolProps): ReactElement {
  const closed = contactClosedNow(properties, runtime);
  const isNC = properties.contactType === "NC";
  return (
    <g>
      <ContactGlyph closed={closed} />
      {isNC && <NcBar />}
      <text x={6} y={4} fontSize={9} fill="currentColor" stroke="none">
        {String(properties.deviceLabel ?? "")}
      </text>
    </g>
  );
}

/** 부하 공용: 통전 시 채움 표시 */
function LoadBox({ energized, children, label }: { energized: boolean; children?: ReactNode; label?: string }) {
  return (
    <g>
      <line x1={0} y1={-20} x2={0} y2={-12} {...S} />
      <line x1={0} y1={12} x2={0} y2={20} {...S} />
      <rect
        x={-12}
        y={-12}
        width={24}
        height={24}
        {...S}
        fill={energized ? "var(--energized)" : "none"}
      />
      {children}
      {label !== undefined && (
        <text x={16} y={4} fontSize={9} fill="currentColor" stroke="none">
          {label}
        </text>
      )}
    </g>
  );
}

function ElecRelayCoil({ properties, runtime }: SymbolProps): ReactElement {
  return (
    <LoadBox energized={runtime?.energized ?? false} label={String(properties.label ?? "")}>
      <text x={-5} y={4} fontSize={10} fill="currentColor" stroke="none">K</text>
    </LoadBox>
  );
}

function ElecTimer({ properties, runtime }: SymbolProps): ReactElement {
  return (
    <LoadBox
      energized={runtime?.energized ?? false}
      label={`${String(properties.label ?? "")} ${Number(properties.preset ?? 0)}s`}
    >
      <text x={-5} y={4} fontSize={10} fill="currentColor" stroke="none">T</text>
    </LoadBox>
  );
}

function ElecCounter({ properties, runtime }: SymbolProps): ReactElement {
  return (
    <LoadBox
      energized={runtime?.energized ?? false}
      label={`${String(properties.label ?? "")} ×${Number(properties.preset ?? 0)}`}
    >
      <text x={-5} y={4} fontSize={10} fill="currentColor" stroke="none">C</text>
    </LoadBox>
  );
}

function ElecCounterReset({ properties, runtime }: SymbolProps): ReactElement {
  return (
    <LoadBox energized={runtime?.energized ?? false} label={`${String(properties.label ?? "")} RST`}>
      <text x={-6} y={4} fontSize={9} fill="currentColor" stroke="none">CR</text>
    </LoadBox>
  );
}

function ElecSolenoid({ properties, runtime }: SymbolProps): ReactElement {
  return (
    <LoadBox energized={runtime?.energized ?? false} label={String(properties.label ?? "")}>
      <line x1={-12} y1={12} x2={12} y2={-12} {...Sthin} />
    </LoadBox>
  );
}

function ElecLamp({ properties, runtime }: SymbolProps): ReactElement {
  const on = runtime?.energized ?? false;
  return (
    <g>
      <line x1={0} y1={-20} x2={0} y2={-12} {...S} />
      <line x1={0} y1={12} x2={0} y2={20} {...S} />
      <circle cx={0} cy={0} r={12} {...S} fill={on ? "var(--lamp-on)" : "none"} />
      <line x1={-8.5} y1={-8.5} x2={8.5} y2={8.5} {...Sthin} />
      <line x1={-8.5} y1={8.5} x2={8.5} y2={-8.5} {...Sthin} />
      <text x={16} y={4} fontSize={9} fill="currentColor" stroke="none">
        {String(properties.name ?? "")}
      </text>
    </g>
  );
}

function ElecBuzzer({ properties, runtime }: SymbolProps): ReactElement {
  const on = runtime?.energized ?? false;
  return (
    <g>
      <line x1={0} y1={-20} x2={0} y2={-12} {...S} />
      <line x1={0} y1={12} x2={0} y2={20} {...S} />
      <path d="M -12 -12 A 12 12 0 0 1 12 -12 L 12 12 L -12 12 Z" {...S} fill={on ? "var(--energized)" : "none"} />
      <text x={16} y={4} fontSize={9} fill="currentColor" stroke="none">
        {String(properties.name ?? "")}
      </text>
    </g>
  );
}

function Supply24V(_: SymbolProps): ReactElement {
  return (
    <g>
      <line x1={-20} y1={0} x2={20} y2={0} {...S} strokeWidth={3} />
      <line x1={0} y1={0} x2={0} y2={20} {...S} />
      <text x={-22} y={-8} fontSize={10} fontWeight={700} fill="currentColor" stroke="none">+24V</text>
    </g>
  );
}

function Supply0V(_: SymbolProps): ReactElement {
  return (
    <g>
      <line x1={-20} y1={0} x2={20} y2={0} {...S} strokeWidth={3} />
      <line x1={0} y1={0} x2={0} y2={-20} {...S} />
      <text x={-12} y={16} fontSize={10} fontWeight={700} fill="currentColor" stroke="none">0V</text>
    </g>
  );
}

const symbolRegistry: Record<string, SymbolComponent> = {
  "pneu.source": PneumaticSource,
  "pneu.service-unit": ServiceUnit,
  "pneu.silencer": Silencer,
  "pneu.tee": Tee,
  "pneu.valve.3-2-manual": (p) => <Valve32 {...p} leftKind="manual" />,
  "pneu.valve.3-2-roller": (p) => <Valve32 {...p} leftKind="roller" />,
  "pneu.valve.5-2-manual": Valve52Manual,
  "pneu.valve.5-2-double-pilot": Valve52DoublePilot,
  "pneu.valve.5-2-single-pilot": Valve52SinglePilot,
  "pneu.valve.3-2-solenoid": Valve32Solenoid,
  "pneu.valve.5-2-solenoid": Valve52Solenoid,
  "pneu.valve.5-2-double-solenoid": Valve52DoubleSolenoid,
  "pneu.valve.5-3-double-solenoid": Valve53DoubleSolenoid,
  "pneu.cylinder.double": CylinderDouble,
  "pneu.cylinder.single": CylinderSingle,
  "pneu.speed-controller": SpeedController,
  "pneu.shuttle": Shuttle,
  "pneu.two-pressure": TwoPressure,
  "pneu.quick-exhaust": QuickExhaust,
  "hyd.power-unit": HydPowerUnit,
  "hyd.tank": HydTank,
  "hyd.gauge": HydGauge,
  "hyd.relief": HydRelief,
  "hyd.valve.4-2-lever": HydValve42Lever,
  "hyd.valve.4-3-closed-solenoid": (p) => <HydValve43 {...p} center="closed" />,
  "hyd.valve.4-3-tandem-solenoid": (p) => <HydValve43 {...p} center="tandem" />,
  "hyd.check": () => <HydCheck />,
  "hyd.pilot-check": () => <HydCheck pilot />,
  "hyd.flow-control": SpeedController,
  "hyd.reducing": HydReducing,
  "hyd.motor": HydMotor,
  "elec.pressure-switch": PressureSwitchSymbol,
  "hyd.cylinder.double": CylinderDouble,
  "elec.supply-24v": Supply24V,
  "elec.supply-0v": Supply0V,
  "elec.pushbutton": ElecPushbutton,
  "elec.limit-switch": ElecLimitSwitch,
  "elec.relay-contact": ElecRelayContact,
  "elec.relay-coil": ElecRelayCoil,
  "elec.timer": ElecTimer,
  "elec.counter": ElecCounter,
  "elec.counter-reset": ElecCounterReset,
  "elec.solenoid": ElecSolenoid,
  "elec.lamp": ElecLamp,
  "elec.buzzer": ElecBuzzer,
};

export function getSymbol(symbolId: string): SymbolComponent {
  const sym = symbolRegistry[symbolId];
  if (sym) return sym;
  return () => (
    <g>
      <rect x={-20} y={-20} width={40} height={40} {...S} strokeDasharray="4 3" />
      <text x={-6} y={4} fontSize={10} fill="currentColor" stroke="none">?</text>
    </g>
  );
}
