import type { ReactElement, ReactNode } from "react";
import type { SymbolProps } from "../symbols";

/**
 * 장비 뷰 일러스트 스프라이트 — 실습장비의 실물 느낌 묘사 (ARCHITECTURE 4.6).
 * 기호와 같은 로컬 좌표계·같은 런타임 상태를 사용한다.
 *
 * Phase 22 리디자인: 실습 트레이너(알루미늄 프로파일 판 위에 부품을 고정하는 형태)를
 * 한 가지 재질 팔레트로 통일했다. 공용 그라디언트·그림자는 `EquipmentDefs`가 한 번만
 * 정의하고 스프라이트는 `url(#eq-…)`로 참조한다. 포트 위치에는 원터치 피팅(공압)·
 * 호스 니플(유압)·나사 단자(전기)를 그려 배선이 붙는 자리를 실물처럼 보여 준다.
 * 부품 정의의 포트 좌표는 바꾸지 않는다 — 배선 끝점이 그대로 맞아야 한다.
 */

type SpriteComponent = (props: SymbolProps) => ReactElement;

// ---------- 공용 팔레트 · defs ----------

const INK = "#1e293b";
const INK_SOFT = "#475569";
/** 상태 색 — 배선 색 규약(가압·통전)과 같은 계열 */
const LED_ON = "#facc15";
const PNEU_ON = "#0284c7";
const HYD_ON = "#ea580c";

/** 장비 뷰 SVG에 한 번 넣는 공용 정의 (그라디언트·그림자·프로파일 판 무늬) */
export function EquipmentDefs(): ReactElement {
  const v = (id: string, stops: [number, string][]) => (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </linearGradient>
  );
  return (
    <defs>
      {v("eq-alu", [[0, "#f8fafc"], [0.35, "#dbe3ec"], [0.75, "#aab7c6"], [1, "#8a99ab"]])}
      {v("eq-alu-dark", [[0, "#7b8a9c"], [0.5, "#556476"], [1, "#3b4757"]])}
      {v("eq-chrome", [[0, "#ffffff"], [0.3, "#e5e9ef"], [0.65, "#9aa5b3"], [1, "#d5dbe3"]])}
      {v("eq-valve", [[0, "#c9d6e6"], [0.4, "#9fb3cc"], [1, "#6d84a2"]])}
      {v("eq-hyd", [[0, "#6b7280"], [0.45, "#4b5563"], [1, "#2b313b"]])}
      {v("eq-coil", [[0, "#4b4b55"], [1, "#16161b"]])}
      {v("eq-panel", [[0, "#ffffff"], [1, "#e3e8ee"]])}
      {v("eq-brass", [[0, "#fde8a8"], [0.5, "#d6a84a"], [1, "#9a6b1c"]])}
      {v("eq-belt", [[0, "#3f4652"], [0.5, "#2a2f38"], [1, "#1b1f26"]])}
      {v("eq-glass", [[0, "#ffffff"], [1, "#dbeafe"]])}
      <radialGradient id="eq-led" cx="0.4" cy="0.35" r="0.7">
        <stop offset={0} stopColor="#fffbe6" />
        <stop offset={0.45} stopColor={LED_ON} />
        <stop offset={1} stopColor="#ca8a04" />
      </radialGradient>
      <radialGradient id="eq-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset={0} stopColor="#fde047" stopOpacity={0.75} />
        <stop offset={1} stopColor="#fde047" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="eq-cap-green" cx="0.4" cy="0.35" r="0.7">
        <stop offset={0} stopColor="#86efac" />
        <stop offset={0.55} stopColor="#16a34a" />
        <stop offset={1} stopColor="#14532d" />
      </radialGradient>
      <radialGradient id="eq-cap-red" cx="0.4" cy="0.35" r="0.7">
        <stop offset={0} stopColor="#fca5a5" />
        <stop offset={0.55} stopColor="#dc2626" />
        <stop offset={1} stopColor="#7f1d1d" />
      </radialGradient>
      <radialGradient id="eq-dial" cx="0.5" cy="0.4" r="0.65">
        <stop offset={0} stopColor="#ffffff" />
        <stop offset={1} stopColor="#e2e8f0" />
      </radialGradient>
      <filter id="eq-shadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx={0} dy={1.6} stdDeviation={1.3} floodColor="#0f172a" floodOpacity={0.28} />
      </filter>
      {/* 알루미늄 프로파일 판 — 가로 T홈이 일정 간격으로 난 실습 트레이너 바닥판 */}
      <pattern id="eq-slots" width={100} height={25} patternUnits="userSpaceOnUse">
        <rect width={100} height={25} fill="#e8edf2" />
        <rect y={10} width={100} height={5} fill="#cfd7e0" />
        <rect y={10} width={100} height={1} fill="#b3bfcc" />
        <rect y={15} width={100} height={1} fill="#f8fafc" />
      </pattern>
    </defs>
  );
}

// ---------- 공용 부품 조각 ----------

/** 원터치 피팅 (공압) — 몸체 가장자리(edge)에서 포트(port)까지. 파란 해제 링이 포트 끝 */
function PneuFitting({ x, edge, port }: { x: number; edge: number; port: number }) {
  const top = Math.min(edge, port);
  const h = Math.abs(port - edge);
  const ringY = port < edge ? port : port - 2.5;
  return (
    <g>
      <rect x={x - 3.5} y={top} width={7} height={h} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.8} />
      <rect x={x - 4.5} y={ringY} width={9} height={2.5} rx={1} fill="#2563eb" stroke="#1e3a8a" strokeWidth={0.6} />
    </g>
  );
}

/** 가로 방향 피팅 (좌우 포트) */
function PneuFittingH({ y, edge, port }: { y: number; edge: number; port: number }) {
  const left = Math.min(edge, port);
  const w = Math.abs(port - edge);
  const ringX = port < edge ? port : port - 2.5;
  return (
    <g>
      <rect x={left} y={y - 3.5} width={w} height={7} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.8} />
      <rect x={ringX} y={y - 4.5} width={2.5} height={9} rx={1} fill="#2563eb" stroke="#1e3a8a" strokeWidth={0.6} />
    </g>
  );
}

/** 유압 호스 니플 — 황동 육각 */
function HydNipple({ x, edge, port }: { x: number; edge: number; port: number }) {
  const top = Math.min(edge, port);
  const h = Math.abs(port - edge);
  return (
    <g>
      <rect x={x - 4} y={top} width={8} height={h} fill="url(#eq-brass)" stroke="#7c5a17" strokeWidth={0.8} />
      <line x1={x - 4} y1={top + h / 2} x2={x + 4} y2={top + h / 2} stroke="#7c5a17" strokeWidth={0.6} />
    </g>
  );
}

function HydNippleH({ y, edge, port }: { y: number; edge: number; port: number }) {
  const left = Math.min(edge, port);
  const w = Math.abs(port - edge);
  return (
    <g>
      <rect x={left} y={y - 4} width={w} height={8} fill="url(#eq-brass)" stroke="#7c5a17" strokeWidth={0.8} />
      <line x1={left + w / 2} y1={y - 4} x2={left + w / 2} y2={y + 4} stroke="#7c5a17" strokeWidth={0.6} />
    </g>
  );
}

/** 나사 단자 (전기) — 몸체에서 포트까지 단자 러그 + 나사머리 */
function Terminal({ x, edge, port }: { x: number; edge: number; port: number }) {
  const top = Math.min(edge, port);
  const h = Math.abs(port - edge);
  const cy = port < edge ? port + 2.5 : port - 2.5;
  return (
    <g>
      <rect x={x - 3} y={top} width={6} height={h} fill="#cbd5e1" stroke={INK_SOFT} strokeWidth={0.7} />
      <circle cx={x} cy={cy} r={2.6} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.7} />
      <line x1={x - 1.6} y1={cy} x2={x + 1.6} y2={cy} stroke={INK_SOFT} strokeWidth={0.7} />
    </g>
  );
}

/** 이름표 — 흰 알약 배경 위 굵은 글자 */
function Tag({ x, y, text, anchor = "start" }: { x: number; y: number; text: string; anchor?: "start" | "middle" }) {
  if (!text) return null;
  const w = text.length * 5.6 + 6;
  const left = anchor === "middle" ? x - w / 2 : x;
  return (
    <g>
      <rect x={left} y={y - 8} width={w} height={11} rx={5.5} fill="#ffffff" opacity={0.9} stroke="#cbd5e1" strokeWidth={0.6} />
      <text x={left + w / 2} y={y} fontSize={8.5} fontWeight={700} textAnchor="middle" fill={INK} stroke="none">
        {text}
      </text>
    </g>
  );
}

/** 표시 LED */
function Led({ x, y, on, r = 3 }: { x: number; y: number; on: boolean; r?: number }) {
  return (
    <g>
      {on && <circle cx={x} cy={y} r={r * 2.6} fill="url(#eq-glow)" />}
      <circle cx={x} cy={y} r={r} fill={on ? "url(#eq-led)" : "#3f4652"} stroke={INK} strokeWidth={0.6} />
    </g>
  );
}

/** 몸체 블록 — 그라디언트 + 윗면 하이라이트 + 그림자 */
function Body({
  x,
  y,
  w,
  h,
  fill = "url(#eq-alu)",
  stroke = INK_SOFT,
  rx = 3,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  rx?: number;
  children?: ReactNode;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth={1.2} filter="url(#eq-shadow)" />
      <rect x={x + 1.5} y={y + 1.2} width={w - 3} height={Math.min(3, h / 4)} rx={1.5} fill="#ffffff" opacity={0.35} />
      {children}
    </g>
  );
}

// ---------- 공압원 · 보조기기 ----------

/** 공압원: 소형 컴프레서 (탱크 + 모터 + 압력계) */
function CompressorSprite(_: SymbolProps): ReactElement {
  return (
    <g>
      <rect x={-16} y={16} width={4} height={4} fill={INK_SOFT} />
      <rect x={12} y={16} width={4} height={4} fill={INK_SOFT} />
      <rect x={-19} y={0} width={38} height={17} rx={8.5} fill="#dc2626" stroke="#7f1d1d" strokeWidth={1.2} filter="url(#eq-shadow)" />
      <rect x={-15} y={2} width={30} height={3} rx={1.5} fill="#ffffff" opacity={0.35} />
      <rect x={-16} y={-12} width={17} height={12} rx={2} fill="url(#eq-coil)" stroke={INK} strokeWidth={1} />
      {[-13, -10, -7, -4].map((fx) => (
        <line key={fx} x1={fx} y1={-10} x2={fx} y2={-2} stroke="#6b7280" strokeWidth={0.8} />
      ))}
      <rect x={1} y={-9} width={5} height={9} fill="url(#eq-alu)" stroke={INK_SOFT} strokeWidth={0.8} />
      <circle cx={11} cy={-6} r={5.5} fill="url(#eq-dial)" stroke={INK_SOFT} strokeWidth={1} />
      <line x1={11} y1={-6} x2={13.5} y2={-9} stroke="#dc2626" strokeWidth={1} />
      <line x1={0} y1={-12} x2={0} y2={-24} stroke={INK_SOFT} strokeWidth={3} />
      <PneuFitting x={0} edge={-24} port={-30} />
    </g>
  );
}

/** 서비스 유닛 (필터·레귤레이터): 조절 노브 + 압력계 + 투명 보울 */
function ServiceUnitSprite(_: SymbolProps): ReactElement {
  return (
    <g>
      <PneuFittingH y={0} edge={-14} port={-30} />
      <PneuFittingH y={0} edge={14} port={30} />
      <Body x={-14} y={-8} w={28} h={16} fill="url(#eq-alu)" />
      <rect x={-5} y={-19} width={10} height={11} rx={2} fill="url(#eq-coil)" stroke={INK} strokeWidth={0.8} />
      {[-3, 0, 3].map((kx) => (
        <line key={kx} x1={kx} y1={-18} x2={kx} y2={-10} stroke="#6b7280" strokeWidth={0.7} />
      ))}
      <circle cx={10} cy={-15} r={5.5} fill="url(#eq-dial)" stroke={INK_SOFT} strokeWidth={1} />
      <line x1={10} y1={-15} x2={12.5} y2={-18} stroke="#dc2626" strokeWidth={1} />
      <path d="M -9 8 L 9 8 L 7 21 Q 0 25 -7 21 Z" fill="url(#eq-glass)" stroke={INK_SOFT} strokeWidth={1} opacity={0.95} />
      <path d="M -7 17 L 7 17 L 6.5 21 Q 0 24 -6.5 21 Z" fill="#93c5fd" opacity={0.6} />
      <line x1={0} y1={22.5} x2={0} y2={25} stroke={INK_SOFT} strokeWidth={1.5} />
    </g>
  );
}

/** 소음기: 소결 황동 머플러 */
function SilencerSprite(_: SymbolProps): ReactElement {
  return (
    <g>
      <rect x={-5} y={-20} width={10} height={7} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.8} />
      <rect x={-7} y={-13} width={14} height={22} rx={4} fill="url(#eq-brass)" stroke="#7c5a17" strokeWidth={1} filter="url(#eq-shadow)" />
      {[-9, -5, -1, 3].map((dy) =>
        [-3.5, 0, 3.5].map((dx) => <circle key={`${dx}${dy}`} cx={dx} cy={dy} r={0.8} fill="#7c5a17" opacity={0.7} />),
      )}
    </g>
  );
}

/** T 분기 피팅 (공압/유압 공용 — 유압은 황동) */
function makeTeeSprite(hyd: boolean): SpriteComponent {
  return function TeeSprite(): ReactElement {
    const fill = hyd ? "url(#eq-brass)" : "#e2e8f0";
    const stroke = hyd ? "#7c5a17" : INK_SOFT;
    return (
      <g filter="url(#eq-shadow)">
        <rect x={-20} y={-4} width={40} height={8} rx={2} fill={fill} stroke={stroke} strokeWidth={1} />
        <rect x={-4} y={-4} width={8} height={24} rx={2} fill={fill} stroke={stroke} strokeWidth={1} />
        <rect x={-5} y={-5} width={10} height={10} rx={2} fill={fill} stroke={stroke} strokeWidth={1} />
        {!hyd && (
          <>
            <rect x={-20} y={-4.5} width={2.5} height={9} rx={1} fill="#2563eb" />
            <rect x={17.5} y={-4.5} width={2.5} height={9} rx={1} fill="#2563eb" />
            <rect x={-4.5} y={17.5} width={9} height={2.5} rx={1} fill="#2563eb" />
          </>
        )}
      </g>
    );
  };
}

// ---------- 실린더 ----------

/** 복동/단동/유압 실린더: 프로파일 배럴 + 크롬 로드 + 로드 끝 캠 */
function makeCylinderSprite(kind: "pneu-double" | "pneu-single" | "hyd"): SpriteComponent {
  return function CylinderSprite({ properties, runtime }: SymbolProps): ReactElement {
    const pos = runtime?.cylinderPos ?? (properties.initialPosition === "extended" ? 1 : 0);
    const rodX = -22 + pos * 40;
    const hyd = kind === "hyd";
    const barrel = hyd ? "url(#eq-hyd)" : "url(#eq-alu)";
    const cap = hyd ? "#1f2937" : "url(#eq-alu-dark)";
    return (
      <g>
        {/* 로드 + 로드 끝 캠 (리밋 스위치 롤러를 미는 부분, Phase 19-2) */}
        <rect x={rodX} y={-3.5} width={70} height={7} rx={1.5} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.9} />
        <rect x={rodX + 64} y={-7} width={8} height={14} rx={2} fill={INK_SOFT} stroke={INK} strokeWidth={0.8} />
        <circle cx={rodX + 70} cy={0} r={5} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={1.2} />
        {/* 배럴 */}
        <rect x={-40} y={-13} width={62} height={26} rx={3} fill={barrel} stroke={INK_SOFT} strokeWidth={1.2} filter="url(#eq-shadow)" />
        <line x1={-37} y1={-6} x2={19} y2={-6} stroke="#ffffff" strokeWidth={1} opacity={hyd ? 0.2 : 0.55} />
        <line x1={-37} y1={6} x2={19} y2={6} stroke={INK} strokeWidth={0.6} opacity={0.25} />
        {/* 엔드 캡 */}
        <rect x={-45} y={-15} width={8} height={30} rx={2} fill={cap} stroke={INK} strokeWidth={1} />
        <rect x={18} y={-15} width={8} height={30} rx={2} fill={cap} stroke={INK} strokeWidth={1} />
        {[-11, 11].map((cy) => (
          <g key={cy}>
            <circle cx={-41} cy={cy} r={1.4} fill="url(#eq-chrome)" />
            <circle cx={22} cy={cy} r={1.4} fill="url(#eq-chrome)" />
          </g>
        ))}
        {/* 포트 */}
        {hyd ? (
          <>
            <HydNipple x={-30} edge={13} port={20} />
            <HydNipple x={20} edge={15} port={20} />
          </>
        ) : (
          <>
            <PneuFitting x={-30} edge={13} port={20} />
            {kind === "pneu-double" ? (
              <PneuFitting x={20} edge={15} port={20} />
            ) : (
              // 단동: 로드측은 배기 필터(통기구)
              <rect x={17} y={15} width={6} height={4} rx={1} fill="url(#eq-brass)" stroke="#7c5a17" strokeWidth={0.6} />
            )}
          </>
        )}
        <Tag x={-44} y={-19} text={String(properties.label ?? "")} />
      </g>
    );
  };
}

// ---------- 방향제어밸브 ----------

type ValveTheme = "pneu" | "hyd";

/** 밸브 본체 공용: 몸체 + 스풀 위치창 + 포트 피팅 */
function ValveBlock({
  width,
  topPorts,
  bottomPorts,
  positions,
  current,
  theme = "pneu",
  children,
}: {
  width: number;
  topPorts: number[];
  bottomPorts: number[];
  /** 스풀 위치 수 (2 또는 3) */
  positions: number;
  current: number;
  theme?: ValveTheme;
  children?: ReactNode;
}): ReactElement {
  const x0 = -width / 2;
  const hyd = theme === "hyd";
  // 스풀 위치창: 현재 위치에 따라 표시 블록이 좌/중/우로 이동
  const winW = 34;
  const winX = x0 + 8;
  const slot = (winW - 12) / Math.max(1, positions - 1);
  return (
    <g>
      {topPorts.map((px) =>
        hyd ? <HydNipple key={`t${px}`} x={px} edge={-20} port={-30} /> : <PneuFitting key={`t${px}`} x={px} edge={-20} port={-30} />,
      )}
      {bottomPorts.map((px) =>
        hyd ? <HydNipple key={`b${px}`} x={px} edge={20} port={30} /> : <PneuFitting key={`b${px}`} x={px} edge={20} port={30} />,
      )}
      <Body x={x0} y={-20} w={width} h={40} fill={hyd ? "url(#eq-hyd)" : "url(#eq-valve)"} stroke={INK} rx={4} />
      {/* 서브플레이트 이음선 */}
      <line x1={x0 + 2} y1={12} x2={x0 + width - 2} y2={12} stroke={INK} strokeWidth={0.6} opacity={0.35} />
      <rect x={winX} y={-6} width={winW} height={10} rx={2} fill="#0f172a" opacity={0.8} />
      <rect x={winX + 2 + (positions - 1 - current) * slot} y={-4.5} width={8} height={7} rx={1.5} fill={hyd ? HYD_ON : PNEU_ON} />
      {children}
    </g>
  );
}

/** 솔레노이드 코일 (검은 큐브 + LED + 이름표). side: 몸체 끝 x, dir: 바깥 방향 */
function Coil({ side, dir, on, label }: { side: number; dir: 1 | -1; on: boolean; label: string }) {
  const w = 16;
  const x = dir === -1 ? side - w : side;
  return (
    <g>
      <rect x={x} y={-15} width={w} height={30} rx={3} fill="url(#eq-coil)" stroke={INK} strokeWidth={1} filter="url(#eq-shadow)" />
      <rect x={x + 3} y={-11} width={w - 6} height={10} rx={1.5} fill="#27272a" stroke="#52525b" strokeWidth={0.6} />
      <Led x={x + w / 2} y={7} on={on} r={2.6} />
      <Tag x={x + w / 2} y={-19} text={label} anchor="middle" />
    </g>
  );
}

/** 공압 파일럿 캡 + 파일럿 피팅 (X/Y 포트) */
function PilotCap({ side, dir, on, label, port }: { side: number; dir: 1 | -1; on: boolean; label: string; port: number }) {
  const w = 9;
  const x = dir === -1 ? side - w : side;
  return (
    <g>
      <PneuFittingH y={0} edge={dir === -1 ? x : x + w} port={port} />
      <rect x={x} y={-12} width={w} height={24} rx={2} fill={on ? PNEU_ON : "url(#eq-alu-dark)"} stroke={INK} strokeWidth={1} />
      <text x={x + w / 2} y={-15} fontSize={7.5} fontWeight={700} textAnchor="middle" fill={INK} stroke="none">
        {label}
      </text>
    </g>
  );
}

/** 수동 레버 */
function LeverHandle({ x, on }: { x: number; on: boolean }) {
  return (
    <g transform={`translate(${x}, 0) rotate(${on ? 32 : -32})`}>
      <rect x={-4} y={-4} width={8} height={8} rx={2} fill={INK_SOFT} />
      <rect x={-2.2} y={-22} width={4.4} height={20} rx={2.2} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.7} />
      <circle cx={0} cy={-23} r={5} fill="url(#eq-cap-red)" stroke="#7f1d1d" strokeWidth={0.8} />
    </g>
  );
}

/** 수동 누름 버튼 (밸브용) */
function ValveButton({ side, on }: { side: number; on: boolean }) {
  const push = on ? 4 : 0;
  return (
    <g transform={`translate(${push}, 0)`}>
      <rect x={side - 6} y={-5} width={6} height={10} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.7} />
      <rect x={side - 13} y={-10} width={8} height={20} rx={3} fill="url(#eq-cap-green)" stroke="#14532d" strokeWidth={0.8} />
    </g>
  );
}

/** 롤러 레버 (3/2 롤러 밸브) */
function RollerLever({ side, on }: { side: number; on: boolean }) {
  return (
    <g>
      <rect x={side - 8} y={-6} width={8} height={12} rx={1.5} fill="url(#eq-alu-dark)" stroke={INK} strokeWidth={0.8} />
      <line x1={side - 6} y1={0} x2={side - 18} y2={on ? 7 : -9} stroke={INK_SOFT} strokeWidth={3} strokeLinecap="round" />
      <circle cx={side - 19} cy={on ? 8 : -10} r={5} fill={on ? LED_ON : "url(#eq-chrome)"} stroke={INK} strokeWidth={1.2} />
    </g>
  );
}

/** 복귀 스프링 캡 */
function SpringCap({ side, dir }: { side: number; dir: 1 | -1 }) {
  const w = 12;
  const x = dir === -1 ? side - w : side;
  return (
    <g>
      <rect x={x} y={-9} width={w} height={18} rx={3} fill="url(#eq-alu-dark)" stroke={INK} strokeWidth={0.9} />
      <polyline
        points={`${x + 2},-5 ${x + 5},5 ${x + 7},-5 ${x + 10},5`}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={0.9}
        opacity={0.8}
      />
    </g>
  );
}

function Valve32ManualSprite({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  const pressed = runtime?.manualActive ?? false;
  return (
    <ValveBlock width={70} topPorts={[20]} bottomPorts={[10, 30]} positions={2} current={current}>
      <>
        {properties.actuation === "lever" ? <LeverHandle x={-42} on={pressed} /> : <ValveButton side={-35} on={pressed} />}
        <SpringCap side={35} dir={1} />
      </>
    </ValveBlock>
  );
}

function Valve32RollerSprite({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  return (
    <g>
      <ValveBlock width={70} topPorts={[20]} bottomPorts={[10, 30]} positions={2} current={current}>
        <>
          <RollerLever side={-35} on={current === 0} />
          <SpringCap side={35} dir={1} />
        </>
      </ValveBlock>
      <Tag
        x={-50}
        y={38}
        text={`${String(properties.cylinderLabel ?? "")}${properties.triggerAt === "retracted" ? "▾" : "▴"}`}
        anchor="middle"
      />
    </g>
  );
}

function Valve32SolenoidSprite({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  return (
    <ValveBlock width={70} topPorts={[20]} bottomPorts={[10, 30]} positions={2} current={current}>
      <>
        <Coil side={-35} dir={-1} on={current === 0} label={String(properties.solenoidLeft ?? "")} />
        <SpringCap side={35} dir={1} />
      </>
    </ValveBlock>
  );
}

function makeValve52Sprite(kind: "manual" | "pilot-double" | "pilot-single" | "sol-single" | "sol-double") {
  return function Valve52Sprite({ properties, runtime }: SymbolProps): ReactElement {
    const rest = kind === "pilot-double" || kind === "sol-double" ? (properties.initialPosition === "left" ? 0 : 1) : 1;
    const current = runtime?.valvePosition ?? rest;
    const pressed = runtime?.manualActive ?? false;
    const left = String(properties.solenoidLeft ?? "");
    const right = String(properties.solenoidRight ?? "");
    return (
      <ValveBlock width={100} topPorts={[20, 40]} bottomPorts={[10, 30, 50]} positions={2} current={current}>
        <>
          {kind === "manual" &&
            ((properties.actuation ?? "lever") === "lever" ? (
              <LeverHandle x={-57} on={pressed} />
            ) : (
              <ValveButton side={-50} on={pressed} />
            ))}
          {(kind === "sol-single" || kind === "sol-double") && <Coil side={-50} dir={-1} on={current === 0} label={left} />}
          {kind === "sol-double" && <Coil side={50} dir={1} on={current === 1} label={right} />}
          {(kind === "pilot-single" || kind === "pilot-double") && (
            <PilotCap side={-50} dir={-1} on={runtime?.portState?.X === "pressurized"} label="X" port={-70} />
          )}
          {kind === "pilot-double" && (
            <PilotCap side={50} dir={1} on={runtime?.portState?.Y === "pressurized"} label="Y" port={70} />
          )}
          {(kind === "manual" || kind === "sol-single" || kind === "pilot-single") && <SpringCap side={50} dir={1} />}
        </>
      </ValveBlock>
    );
  };
}

/** 5/3 양솔 (공압) — 스프링 센터링, 포트는 중앙 기준 */
function Valve53Sprite({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  return (
    <ValveBlock width={110} topPorts={[-10, 10]} bottomPorts={[-20, 0, 20]} positions={3} current={current}>
      <>
        <Coil side={-55} dir={-1} on={current === 0} label={String(properties.solenoidLeft ?? "")} />
        <Coil side={55} dir={1} on={current === 2} label={String(properties.solenoidRight ?? "")} />
      </>
    </ValveBlock>
  );
}

/** 유압 4/2 레버 */
function HydValve42Sprite({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  const pressed = runtime?.manualActive ?? false;
  return (
    <ValveBlock width={100} topPorts={[20, 40]} bottomPorts={[20, 40]} positions={2} current={current} theme="hyd">
      <>
        {(properties.actuation ?? "lever") === "lever" ? <LeverHandle x={-57} on={pressed} /> : <ValveButton side={-50} on={pressed} />}
        <SpringCap side={50} dir={1} />
      </>
    </ValveBlock>
  );
}

/** 유압 4/3 솔레노이드 (클로즈드·탠덤·오픈 센터 공용) */
function HydValve43Sprite({ properties, runtime }: SymbolProps): ReactElement {
  const current = runtime?.valvePosition ?? 1;
  return (
    <ValveBlock width={110} topPorts={[-10, 10]} bottomPorts={[-10, 10]} positions={3} current={current} theme="hyd">
      <>
        <Coil side={-55} dir={-1} on={current === 0} label={String(properties.solenoidLeft ?? "")} />
        <Coil side={55} dir={1} on={current === 2} label={String(properties.solenoidRight ?? "")} />
      </>
    </ValveBlock>
  );
}

// ---------- 공압 논리·유량 요소 ----------

/** 인라인 밸브 공용 (속도제어·체크 등): 좌우 포트 + 원통 몸체 */
function InlineBody({ hyd, children }: { hyd: boolean; children?: ReactNode }) {
  return (
    <g>
      {hyd ? (
        <>
          <HydNippleH y={0} edge={-16} port={-30} />
          <HydNippleH y={0} edge={16} port={30} />
        </>
      ) : (
        <>
          <PneuFittingH y={0} edge={-16} port={-30} />
          <PneuFittingH y={0} edge={16} port={30} />
        </>
      )}
      <rect x={-16} y={-9} width={32} height={18} rx={4} fill={hyd ? "url(#eq-hyd)" : "url(#eq-alu)"} stroke={INK} strokeWidth={1.1} filter="url(#eq-shadow)" />
      <rect x={-14} y={-7.5} width={28} height={3} rx={1.5} fill="#ffffff" opacity={hyd ? 0.15 : 0.45} />
      {children}
    </g>
  );
}

/** 속도제어밸브 / 유량제어밸브: 널링 노브 + 개도 눈금 */
function makeFlowControlSprite(hyd: boolean): SpriteComponent {
  return function FlowControlSprite({ properties }: SymbolProps): ReactElement {
    const openness = Math.max(0, Math.min(1, Number(properties.openness ?? 0.5)));
    return (
      <InlineBody hyd={hyd}>
        <rect x={-6} y={-22} width={12} height={13} rx={2} fill="url(#eq-coil)" stroke={INK} strokeWidth={0.8} />
        {[-3.5, -1, 1.5, 4].map((kx) => (
          <line key={kx} x1={kx} y1={-21} x2={kx} y2={-10} stroke="#71717a" strokeWidth={0.7} />
        ))}
        {/* 흐름 방향 각인 + 개도 막대 */}
        <path d="M -9 3 L 6 3 M 3 0 L 6 3 L 3 6" fill="none" stroke={hyd ? "#e5e7eb" : INK_SOFT} strokeWidth={1} />
        <rect x={-12} y={12} width={24} height={4} rx={2} fill="#cbd5e1" />
        <rect x={-12} y={12} width={24 * openness} height={4} rx={2} fill={hyd ? HYD_ON : PNEU_ON} />
      </InlineBody>
    );
  };
}

/** 체크 / 파일럿 체크 (유압) */
function makeCheckSprite(pilot: boolean): SpriteComponent {
  return function CheckSprite(): ReactElement {
    return (
      <g>
        {pilot && <HydNipple x={0} edge={9} port={30} />}
        <InlineBody hyd>
          <path d="M -8 0 L 6 0 M 2 -4 L 6 0 L 2 4" fill="none" stroke="#e5e7eb" strokeWidth={1.4} />
        </InlineBody>
      </g>
    );
  };
}

/** 셔틀 / 2압 / 급속배기 — 3포트 로직 블록 */
function makeLogicSprite(kind: "OR" | "AND" | "QE"): SpriteComponent {
  return function LogicSprite(): ReactElement {
    return (
      <g>
        {kind === "QE" ? (
          <>
            <PneuFittingH y={0} edge={-14} port={-30} />
            <PneuFitting x={0} edge={-10} port={-20} />
            <rect x={-6} y={10} width={12} height={10} rx={3} fill="url(#eq-brass)" stroke="#7c5a17" strokeWidth={0.8} />
          </>
        ) : (
          <>
            <PneuFittingH y={0} edge={-16} port={-30} />
            <PneuFittingH y={0} edge={16} port={30} />
            <PneuFitting x={0} edge={-10} port={-20} />
          </>
        )}
        <Body x={kind === "QE" ? -14 : -16} y={-10} w={kind === "QE" ? 28 : 32} h={20} fill="url(#eq-alu)" rx={3}>
          <text x={0} y={4} fontSize={8} fontWeight={800} textAnchor="middle" fill={INK_SOFT} stroke="none">
            {kind === "QE" ? "QE" : kind}
          </text>
        </Body>
      </g>
    );
  };
}

/** 압력 스위치 (공압/유압): 다이어프램 하우징 + 접점 LED */
function makePressureSwitchSprite(hyd: boolean): SpriteComponent {
  return function PressureSwitchSprite({ properties, runtime }: SymbolProps): ReactElement {
    const closed = runtime?.contactClosed ?? properties.contactType === "NC";
    const actuated = properties.contactType === "NC" ? !closed : closed;
    return (
      <g>
        <Terminal x={0} edge={-12} port={-20} />
        <Terminal x={0} edge={12} port={20} />
        <line x1={-20} y1={10} x2={-12} y2={6} stroke={hyd ? "#7c5a17" : INK_SOFT} strokeWidth={3} />
        <Body x={-12} y={-12} w={24} h={24} fill="url(#eq-panel)" rx={4}>
          <circle cx={-3} cy={2} r={6} fill={hyd ? "url(#eq-hyd)" : "url(#eq-alu)"} stroke={INK_SOFT} strokeWidth={0.8} />
          <Led x={6} y={-6} on={actuated} r={2.4} />
        </Body>
        <Tag x={14} y={-4} text={`${String(properties.name ?? "")} ≥${Number(properties.threshold ?? 0)}`} />
      </g>
    );
  };
}

// ---------- 유압원 · 보조기기 ----------

/** 유압 파워 유닛: 오일 탱크 + 전동기 + 펌프 + 유면계 */
function HydPowerUnitSprite(_: SymbolProps): ReactElement {
  return (
    <g>
      <HydNipple x={-10} edge={-19} port={-30} />
      <HydNipple x={20} edge={-4} port={-30} />
      <rect x={-33} y={-4} width={66} height={30} rx={3} fill="url(#eq-hyd)" stroke={INK} strokeWidth={1.2} filter="url(#eq-shadow)" />
      <rect x={-31} y={-2.5} width={62} height={3} rx={1.5} fill="#ffffff" opacity={0.15} />
      {/* 유면계 */}
      <rect x={20} y={6} width={8} height={16} rx={2} fill="#0f172a" stroke="#94a3b8" strokeWidth={0.7} />
      <rect x={21.5} y={12} width={5} height={8.5} rx={1} fill="#f59e0b" opacity={0.85} />
      {/* 전동기 + 펌프 */}
      <rect x={-31} y={-19} width={16} height={15} rx={3} fill="#2563eb" stroke="#1e3a8a" strokeWidth={1} />
      {[-28, -25, -22, -19].map((fx) => (
        <line key={fx} x1={fx} y1={-17} x2={fx} y2={-6} stroke="#93c5fd" strokeWidth={0.7} />
      ))}
      <rect x={-15} y={-16} width={10} height={12} rx={2} fill="url(#eq-alu)" stroke={INK_SOFT} strokeWidth={0.8} />
      <text x={-2} y={17} fontSize={8} fontWeight={700} fill="#e5e7eb" stroke="none">
        HPU
      </text>
    </g>
  );
}

/** 오일 탱크 (귀환) */
function HydTankSprite(_: SymbolProps): ReactElement {
  return (
    <g>
      <HydNipple x={0} edge={-6} port={-20} />
      <rect x={-14} y={-6} width={28} height={21} rx={3} fill="url(#eq-hyd)" stroke={INK} strokeWidth={1.1} filter="url(#eq-shadow)" />
      <rect x={-11} y={3} width={22} height={9} rx={1.5} fill="#f59e0b" opacity={0.55} />
    </g>
  );
}

/** 압력계: 흰 다이얼 + 눈금 + 바늘(portLevel) */
function GaugeSprite({ runtime }: SymbolProps): ReactElement {
  const level = runtime?.portLevel?.P ?? 0;
  const angle = -120 + Math.min(level / 300, 1) * 240;
  const hot = runtime?.portState?.P === "pressurized";
  return (
    <g>
      <HydNipple x={0} edge={9} port={20} />
      <circle cx={0} cy={-2} r={12.5} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={1} filter="url(#eq-shadow)" />
      <circle cx={0} cy={-2} r={10} fill="url(#eq-dial)" stroke="#94a3b8" strokeWidth={0.6} />
      {Array.from({ length: 9 }, (_, i) => {
        const a = ((-120 + i * 30 - 90) * Math.PI) / 180;
        return (
          <line
            key={i}
            x1={8 * Math.cos(a)}
            y1={-2 + 8 * Math.sin(a)}
            x2={9.6 * Math.cos(a)}
            y2={-2 + 9.6 * Math.sin(a)}
            stroke={INK_SOFT}
            strokeWidth={0.7}
          />
        );
      })}
      <g transform={`rotate(${angle}, 0, -2)`}>
        <line x1={0} y1={-2} x2={0} y2={-10} stroke="#dc2626" strokeWidth={1.2} strokeLinecap="round" />
      </g>
      <circle cx={0} cy={-2} r={1.4} fill={INK} />
      {runtime && (
        <Tag x={15} y={-1} text={`${Math.round(level * 10) / 10} bar`} />
      )}
      {hot && <circle cx={0} cy={-2} r={12.5} fill="none" stroke={HYD_ON} strokeWidth={1.2} opacity={0.7} />}
    </g>
  );
}

/** 압력제어 밸브 블록 공용 (릴리프·감압·시퀀스·카운터밸런스): 몸체 + 조절 나사 + 설정값 */
function PressureBlock({
  open,
  setpoint,
  screw = "right",
  tagAt,
  children,
}: {
  /** 설정값 표시 위치 (기본: 조절 나사 옆) */
  tagAt?: { x: number; y: number };
  open: boolean;
  setpoint: number;
  /** 조절 나사 방향 — 포트가 좌우로 난 인라인형은 위쪽 */
  screw?: "right" | "top";
  children?: ReactNode;
}) {
  return (
    <g>
      <rect x={-12} y={-12} width={24} height={24} rx={3} fill="url(#eq-hyd)" stroke={open ? HYD_ON : INK} strokeWidth={open ? 2 : 1.1} filter="url(#eq-shadow)" />
      <rect x={-10} y={-10.5} width={20} height={3} rx={1.5} fill="#ffffff" opacity={0.15} />
      {/* 조절 나사 + 잠금 너트 */}
      {screw === "right" ? (
        <>
          <rect x={12} y={-5} width={5} height={10} fill="url(#eq-brass)" stroke="#7c5a17" strokeWidth={0.7} />
          <rect x={17} y={-2.5} width={7} height={5} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.7} />
        </>
      ) : (
        <>
          <rect x={-5} y={-17} width={10} height={5} fill="url(#eq-brass)" stroke="#7c5a17" strokeWidth={0.7} />
          <rect x={-2.5} y={-24} width={5} height={7} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.7} />
        </>
      )}
      <Led x={-5} y={2} on={open} r={2.4} />
      {children}
      <Tag x={tagAt?.x ?? (screw === "top" ? 5 : -14)} y={tagAt?.y ?? (screw === "top" ? -17 : -16)} text={`${setpoint} bar`} />
    </g>
  );
}

function ReliefSprite({ properties, runtime }: SymbolProps): ReactElement {
  return (
    <g>
      <HydNipple x={0} edge={-12} port={-30} />
      <HydNipple x={0} edge={12} port={30} />
      <PressureBlock open={runtime?.reliefActive === true} setpoint={Number(properties.pressure ?? 50)} tagAt={{ x: 7, y: 25 }} />
    </g>
  );
}

function ReducingSprite({ properties }: SymbolProps): ReactElement {
  return (
    <g>
      <HydNippleH y={0} edge={-12} port={-30} />
      <HydNippleH y={0} edge={12} port={30} />
      <PressureBlock open setpoint={Number(properties.pressure ?? 20)} screw="top" />
    </g>
  );
}

function makePressureValveSprite(external: boolean): SpriteComponent {
  return function PressureValveSprite({ properties, runtime }: SymbolProps): ReactElement {
    return (
      <g>
        <HydNippleH y={0} edge={-12} port={-30} />
        <HydNippleH y={0} edge={12} port={30} />
        {external && <HydNipple x={0} edge={12} port={30} />}
        <PressureBlock open={runtime?.pressureValveOpen === true} setpoint={Number(properties.pressure ?? 30)} screw="top" />
        <text x={0} y={-30} fontSize={7} textAnchor="middle" fill={INK_SOFT} stroke="none">
          {external ? "카운터밸런스" : "시퀀스"}
        </text>
      </g>
    );
  };
}

/** 축압기: 세로 봄베 + 충전량 창 */
function AccumulatorSprite({ runtime }: SymbolProps): ReactElement {
  const charge = Math.max(0, Math.min(1, Number(runtime?.accumulatorCharge ?? 0)));
  return (
    <g>
      <HydNipple x={0} edge={20} port={30} />
      <rect x={-12} y={-26} width={24} height={46} rx={12} fill="#b91c1c" stroke="#7f1d1d" strokeWidth={1.2} filter="url(#eq-shadow)" />
      <rect x={-8} y={-23} width={4} height={38} rx={2} fill="#ffffff" opacity={0.25} />
      <rect x={-1} y={-14} width={7} height={28} rx={2} fill="#0f172a" />
      <rect x={0} y={13 - 26 * charge} width={5} height={26 * charge} rx={1} fill="#f59e0b" />
      <rect x={-4} y={-30} width={8} height={5} fill="url(#eq-brass)" stroke="#7c5a17" strokeWidth={0.7} />
    </g>
  );
}

/** 유압 모터: 몸체 + 축 커플링 회전 표시 */
function HydMotorSprite({ runtime }: SymbolProps): ReactElement {
  const angle = runtime?.motorAngle ?? 0;
  return (
    <g>
      <HydNipple x={-10} edge={12} port={30} />
      <HydNipple x={10} edge={12} port={30} />
      <circle cx={0} cy={0} r={16} fill="url(#eq-hyd)" stroke={INK} strokeWidth={1.2} filter="url(#eq-shadow)" />
      <circle cx={0} cy={0} r={9} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.8} />
      <g transform={`rotate(${angle})`}>
        <rect x={-1.6} y={-9} width={3.2} height={18} fill={INK_SOFT} />
        <circle cx={0} cy={-6} r={1.8} fill={HYD_ON} />
      </g>
    </g>
  );
}

// ---------- 전기 ----------

/** 전원 레일 (+24V 빨강 / 0V 파랑) */
function makeSupplySprite(positive: boolean): SpriteComponent {
  return function SupplySprite(): ReactElement {
    const color = positive ? "#dc2626" : "#2563eb";
    return (
      <g>
        {positive ? <Terminal x={0} edge={5} port={20} /> : <Terminal x={0} edge={-5} port={-20} />}
        <rect x={-22} y={-5} width={44} height={10} rx={2} fill={color} stroke={INK} strokeWidth={1} filter="url(#eq-shadow)" />
        <rect x={-20} y={-3.8} width={40} height={2.5} rx={1} fill="#ffffff" opacity={0.3} />
        <text
          x={0}
          y={positive ? -9 : 16}
          fontSize={9}
          fontWeight={800}
          textAnchor="middle"
          fill={color}
          stroke="#ffffff"
          strokeWidth={2.5}
          paintOrder="stroke"
        >
          {positive ? "+24V" : "0V"}
        </text>
      </g>
    );
  };
}

/** 전기 푸시버튼: 패널 베젤 + 광택 캡 (a접점 초록 / b접점 빨강) */
function PushbuttonSprite({ properties, runtime }: SymbolProps): ReactElement {
  const pressed = runtime?.manualActive ?? false;
  const isNC = properties.contactType === "NC";
  return (
    <g>
      <Terminal x={0} edge={-15} port={-20} />
      <Terminal x={0} edge={15} port={20} />
      <rect x={-15} y={-15} width={30} height={30} rx={5} fill="url(#eq-panel)" stroke={INK_SOFT} strokeWidth={1.1} filter="url(#eq-shadow)" />
      <circle cx={0} cy={0} r={11} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={0.8} />
      <circle
        cx={0}
        cy={pressed ? 0.6 : 0}
        r={pressed ? 7.4 : 8.4}
        fill={isNC ? "url(#eq-cap-red)" : "url(#eq-cap-green)"}
        stroke={isNC ? "#7f1d1d" : "#14532d"}
        strokeWidth={0.8}
      />
      {!pressed && <ellipse cx={-2.5} cy={-3.5} rx={3} ry={1.8} fill="#ffffff" opacity={0.45} />}
      <Tag x={18} y={4} text={String(properties.name ?? "")} />
    </g>
  );
}

/**
 * 리밋 스위치 — **전기 배선 자리**의 패널 부품 (Phase 19-4).
 * 실린더 옆 몸체 그림은 LimitSwitchDeviceSprite가 따로 담당하므로, 여기서는 배선이
 * 붙는 접점 블록만 간결하게 그린다.
 */
function LimitSwitchSprite({ properties, runtime }: SymbolProps): ReactElement {
  const closed = runtime?.contactClosed ?? false;
  const active = properties.contactType === "NC" ? !closed : closed;
  return (
    <g>
      <Terminal x={0} edge={-11} port={-20} />
      <Terminal x={0} edge={11} port={20} />
      <rect x={-13} y={-11} width={26} height={22} rx={3} fill="#fde68a" stroke="#92400e" strokeWidth={1.2} filter="url(#eq-shadow)" />
      <rect x={-11} y={-9.5} width={22} height={3} rx={1.5} fill="#ffffff" opacity={0.5} />
      {/* 접점 — 붙으면 수평, 떨어지면 사선 */}
      <circle cx={-7} cy={3} r={1.6} fill="#92400e" />
      <circle cx={7} cy={3} r={1.6} fill="#92400e" />
      <line x1={-7} y1={3} x2={7} y2={active ? 3 : -4} stroke="#92400e" strokeWidth={2.2} strokeLinecap="round" />
      <Tag x={16} y={4} text={String(properties.name ?? "")} />
    </g>
  );
}

/**
 * 리밋 스위치 **장치 몸체** (Phase 19-4) — 장비 뷰에서 실린더 옆에 덧그리는 표시.
 * 실기 도면의 배치도 표기를 따른다: 사각 몸체를 대각선으로 나누고 위 칸에 접점,
 * 좌상단에 복귀 스프링, 아래로 플런저와 롤러. 실린더 로드의 캠이 롤러를 민다.
 */
export function LimitSwitchDeviceSprite({
  names,
  atRetracted,
  pressed,
}: {
  names: string;
  atRetracted: boolean;
  pressed: boolean;
}): ReactElement {
  return (
    <g>
      <rect x={-13} y={-13} width={26} height={26} rx={2.5} fill="#fde68a" stroke="#92400e" strokeWidth={1.4} filter="url(#eq-shadow)" />
      <line x1={-13} y1={13} x2={13} y2={-13} stroke="#b45309" strokeWidth={1} opacity={0.7} />
      {/* 위 칸 접점 */}
      <circle cx={-1} cy={-6} r={1.4} fill="#92400e" />
      <line x1={9} y1={-6} x2={12} y2={-6} stroke="#92400e" strokeWidth={1.6} />
      <line x1={-1} y1={-6} x2={9} y2={pressed ? -6 : -11} stroke="#92400e" strokeWidth={2.2} strokeLinecap="round" />
      {/* 좌상단 복귀 스프링 */}
      <polyline
        points="-9,-13 -13,-17 -7,-20 -14,-23 -9,-26"
        fill="none"
        stroke="#92400e"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 플런저 + 롤러 — 캠에 눌리면 밀려 들어간다 */}
      <line x1={0} y1={13} x2={0} y2={pressed ? 18 : 22} stroke="#92400e" strokeWidth={2.6} strokeLinecap="round" />
      <circle cx={0} cy={pressed ? 21 : 25} r={3.2} fill={pressed ? LED_ON : "url(#eq-chrome)"} stroke="#92400e" strokeWidth={1.5} />
      <Tag x={0} y={-30} text={`${names}${atRetracted ? "↓" : "↑"}`} anchor="middle" />
    </g>
  );
}

/** 릴레이·타이머·카운터 모듈 공용: DIN 레일형 흰 하우징 + 투명 커버 + LED */
function RelayModule({
  on,
  label,
  accent,
  children,
}: {
  on: boolean;
  label: string;
  accent: string;
  children?: ReactNode;
}) {
  return (
    <g>
      <Terminal x={0} edge={-15} port={-20} />
      <Terminal x={0} edge={15} port={20} />
      <rect x={-13} y={-15} width={26} height={30} rx={3} fill="url(#eq-panel)" stroke={INK_SOFT} strokeWidth={1.1} filter="url(#eq-shadow)" />
      <rect x={-13} y={-15} width={26} height={5} rx={2} fill={accent} />
      <rect x={-10} y={-8} width={20} height={14} rx={2} fill="url(#eq-glass)" stroke="#94a3b8" strokeWidth={0.6} />
      {children}
      <Led x={7} y={10.5} on={on} r={2.2} />
      <Tag x={16} y={4} text={label} />
    </g>
  );
}

function RelayCoilSprite({ properties, runtime }: SymbolProps): ReactElement {
  const on = runtime?.energized ?? false;
  return (
    <RelayModule on={on} label={String(properties.label ?? "")} accent="#64748b">
      {/* 코일 + 가동 접점 — 통전 시 접점이 당겨진다 */}
      <rect x={-7} y={-6} width={6} height={10} rx={1} fill="#b45309" />
      <line x1={1} y1={on ? -3 : -5} x2={8} y2={on ? -3 : -6} stroke={INK_SOFT} strokeWidth={1.4} strokeLinecap="round" />
    </RelayModule>
  );
}

function TimerSprite({ properties, runtime }: SymbolProps): ReactElement {
  return (
    <RelayModule on={runtime?.energized ?? false} label={`${String(properties.label ?? "")} ${Number(properties.preset ?? 0)}s`} accent="#0d9488">
      <circle cx={0} cy={-1} r={5.5} fill="#ffffff" stroke={INK_SOFT} strokeWidth={0.8} />
      <line x1={0} y1={-1} x2={2.5} y2={-4.5} stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
    </RelayModule>
  );
}

function CounterSprite({ properties, runtime }: SymbolProps): ReactElement {
  return (
    <RelayModule on={runtime?.energized ?? false} label={`${String(properties.label ?? "")} ×${Number(properties.preset ?? 0)}`} accent="#7c3aed">
      <rect x={-8} y={-6} width={16} height={9} rx={1} fill="#0f172a" />
      <text x={0} y={1.5} fontSize={7} fontWeight={700} textAnchor="middle" fill="#f87171" stroke="none">
        {Number(properties.preset ?? 0)}
      </text>
    </RelayModule>
  );
}

function CounterResetSprite({ properties, runtime }: SymbolProps): ReactElement {
  return (
    <RelayModule on={runtime?.energized ?? false} label={`${String(properties.label ?? "")} RST`} accent="#7c3aed">
      <text x={0} y={2} fontSize={7} fontWeight={800} textAnchor="middle" fill={INK_SOFT} stroke="none">
        RST
      </text>
    </RelayModule>
  );
}

/** 릴레이 접점 (배선 자리) — 흰 접점 블록 */
function RelayContactSprite({ properties, runtime }: SymbolProps): ReactElement {
  const closed = runtime?.contactClosed ?? properties.contactType === "NC";
  return (
    <g>
      <Terminal x={0} edge={-11} port={-20} />
      <Terminal x={0} edge={11} port={20} />
      <rect x={-12} y={-11} width={24} height={22} rx={3} fill="url(#eq-panel)" stroke={INK_SOFT} strokeWidth={1.1} filter="url(#eq-shadow)" />
      <text x={-8} y={-3} fontSize={6} fontWeight={700} fill={INK_SOFT} stroke="none">
        {properties.contactType === "NC" ? "NC" : "NO"}
      </text>
      <circle cx={-6} cy={4} r={1.5} fill={INK_SOFT} />
      <circle cx={6} cy={4} r={1.5} fill={INK_SOFT} />
      <line x1={-6} y1={4} x2={6} y2={closed ? 4 : -2} stroke={closed ? "#16a34a" : INK_SOFT} strokeWidth={2} strokeLinecap="round" />
      <Tag x={15} y={4} text={String(properties.deviceLabel ?? "")} />
    </g>
  );
}

/** 표시 램프: 베젤 + 렌즈 (점등 시 발광) */
function LampSprite({ properties, runtime }: SymbolProps): ReactElement {
  const on = runtime?.energized ?? false;
  return (
    <g>
      <Terminal x={0} edge={-13} port={-20} />
      <Terminal x={0} edge={13} port={20} />
      {on && <circle cx={0} cy={0} r={24} fill="url(#eq-glow)" />}
      <circle cx={0} cy={0} r={13} fill="url(#eq-chrome)" stroke={INK_SOFT} strokeWidth={1} filter="url(#eq-shadow)" />
      <circle cx={0} cy={0} r={9.5} fill={on ? "url(#eq-led)" : "#6b7280"} stroke={INK} strokeWidth={0.6} />
      <ellipse cx={-3} cy={-3.5} rx={3.2} ry={2} fill="#ffffff" opacity={on ? 0.7 : 0.3} />
      <Tag x={17} y={4} text={String(properties.name ?? "")} />
    </g>
  );
}

/** 부저: 원형 몸체 + 음향 구멍 (통전 시 음파 표시) */
function BuzzerSprite({ properties, runtime }: SymbolProps): ReactElement {
  const on = runtime?.energized ?? false;
  return (
    <g>
      <Terminal x={0} edge={-12} port={-20} />
      <Terminal x={0} edge={12} port={20} />
      <circle cx={0} cy={0} r={12} fill="url(#eq-coil)" stroke={INK} strokeWidth={1} filter="url(#eq-shadow)" />
      <circle cx={0} cy={0} r={2} fill="#71717a" />
      {on && (
        <g fill="none" stroke="#f59e0b" strokeWidth={1.4} strokeLinecap="round">
          <path d="M 15 -6 Q 19 0 15 6" />
          <path d="M 19 -9 Q 25 0 19 9" />
        </g>
      )}
      <Tag x={on ? 27 : 16} y={4} text={String(properties.name ?? "")} />
    </g>
  );
}

/** 솔레노이드 (배선 자리): 코일 커넥터 + LED */
function SolenoidSprite({ properties, runtime }: SymbolProps): ReactElement {
  const on = runtime?.energized ?? false;
  return (
    <g>
      <Terminal x={0} edge={-13} port={-20} />
      <Terminal x={0} edge={13} port={20} />
      <rect x={-13} y={-13} width={26} height={26} rx={3} fill="url(#eq-coil)" stroke={INK} strokeWidth={1} filter="url(#eq-shadow)" />
      <rect x={-9} y={-9} width={18} height={9} rx={1.5} fill="#27272a" stroke="#52525b" strokeWidth={0.6} />
      <text x={0} y={-2} fontSize={6} fontWeight={700} textAnchor="middle" fill="#d4d4d8" stroke="none">
        SOL
      </text>
      <Led x={0} y={6.5} on={on} r={2.8} />
      <Tag x={16} y={4} text={String(properties.label ?? "")} />
    </g>
  );
}

const spriteRegistry: Record<string, SpriteComponent> = {
  "pneu.source": CompressorSprite,
  "pneu.service-unit": ServiceUnitSprite,
  "pneu.silencer": SilencerSprite,
  "pneu.tee": makeTeeSprite(false),
  "pneu.cylinder.double": makeCylinderSprite("pneu-double"),
  "pneu.cylinder.single": makeCylinderSprite("pneu-single"),
  "pneu.valve.3-2-manual": Valve32ManualSprite,
  "pneu.valve.3-2-roller": Valve32RollerSprite,
  "pneu.valve.5-2-manual": makeValve52Sprite("manual"),
  "pneu.valve.5-2-double-pilot": makeValve52Sprite("pilot-double"),
  "pneu.valve.5-2-single-pilot": makeValve52Sprite("pilot-single"),
  "pneu.valve.3-2-solenoid": Valve32SolenoidSprite,
  "pneu.valve.5-2-solenoid": makeValve52Sprite("sol-single"),
  "pneu.valve.5-2-double-solenoid": makeValve52Sprite("sol-double"),
  "pneu.valve.5-3-double-solenoid": Valve53Sprite,
  "pneu.speed-controller": makeFlowControlSprite(false),
  "pneu.shuttle": makeLogicSprite("OR"),
  "pneu.two-pressure": makeLogicSprite("AND"),
  "pneu.quick-exhaust": makeLogicSprite("QE"),
  "pneu.pressure-switch": makePressureSwitchSprite(false),
  "hyd.power-unit": HydPowerUnitSprite,
  "hyd.tank": HydTankSprite,
  "hyd.tee": makeTeeSprite(true),
  "hyd.gauge": GaugeSprite,
  "hyd.relief": ReliefSprite,
  "hyd.valve.4-2-lever": HydValve42Sprite,
  "hyd.valve.4-3-closed-solenoid": HydValve43Sprite,
  "hyd.valve.4-3-tandem-solenoid": HydValve43Sprite,
  "hyd.valve.4-3-open-solenoid": HydValve43Sprite,
  "hyd.check": makeCheckSprite(false),
  "hyd.pilot-check": makeCheckSprite(true),
  "hyd.flow-control": makeFlowControlSprite(true),
  "hyd.reducing": ReducingSprite,
  "hyd.sequence": makePressureValveSprite(false),
  "hyd.counterbalance": makePressureValveSprite(true),
  "hyd.accumulator": AccumulatorSprite,
  "hyd.pressure-switch": makePressureSwitchSprite(true),
  "hyd.cylinder.double": makeCylinderSprite("hyd"),
  "hyd.motor": HydMotorSprite,
  "elec.supply-24v": makeSupplySprite(true),
  "elec.supply-0v": makeSupplySprite(false),
  "elec.pushbutton": PushbuttonSprite,
  "elec.limit-switch": LimitSwitchSprite,
  "elec.relay-contact": RelayContactSprite,
  "elec.relay-coil": RelayCoilSprite,
  "elec.timer": TimerSprite,
  "elec.counter": CounterSprite,
  "elec.counter-reset": CounterResetSprite,
  "elec.solenoid": SolenoidSprite,
  "elec.lamp": LampSprite,
  "elec.buzzer": BuzzerSprite,
};

export function getSprite(type: string): SpriteComponent | null {
  return spriteRegistry[type] ?? null;
}
