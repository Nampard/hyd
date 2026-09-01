import type { ReactElement } from "react";
import type { SymbolProps } from "../symbols";

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
      {/* 로드 끝 캠 — 리밋 스위치 롤러를 미는 부분 (도면 표기, Phase 19-2) */}
      <circle cx={rodX + 70} cy={0} r={5} fill="#cbd5e1" stroke="#475569" strokeWidth={1.5} />
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
      {/* 몸체 — 도면의 배치도 표기: 사각 박스를 대각선으로 나누고 위 칸에 접점을 그린다.
          두 스위치가 행정 길이(40px)만큼만 떨어져 있어 몸체는 좁게 유지한다 */}
      <rect x={-13} y={-13} width={26} height={26} rx={2} fill="#fde68a" stroke="#92400e" strokeWidth={1.6} />
      <line x1={-13} y1={13} x2={13} y2={-13} stroke="#b45309" strokeWidth={1} opacity={0.7} />
      {/* 접점 — 눌리면 수평으로 붙고, 떨어지면 사선 (도면의 위 칸 접점) */}
      <line x1={9} y1={-6} x2={12} y2={-6} stroke="#92400e" strokeWidth={1.6} />
      <circle cx={-1} cy={-6} r={1.4} fill="#92400e" />
      <line
        x1={-1}
        y1={-6}
        x2={9}
        y2={active ? -6 : -11}
        stroke="#92400e"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      {/* 복귀 스프링 — 도면처럼 좌상단 모서리에서 비스듬히 (짧고 굵게 정리) */}
      <polyline
        points="-9,-13 -13,-17 -7,-20 -14,-23 -9,-26"
        fill="none"
        stroke="#92400e"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 조작 플런저 + 롤러 — 눌리면 밀려 들어간다. 실린더 로드의 캠이 롤러를 민다 */}
      <line
        x1={0}
        y1={13}
        x2={0}
        y2={active ? 18 : 22}
        stroke="#92400e"
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <circle
        cx={0}
        cy={active ? 21 : 25}
        r={3.2}
        fill={active ? "#fbbf24" : "#e5e7eb"}
        stroke="#92400e"
        strokeWidth={1.5}
      />
      {/* 어느 실린더의 어느 끝을 감지하는지 표시 — 옆 스위치와 겹치지 않게 박스 위 중앙 */}
      <text
        x={0}
        y={-30}
        fontSize={8}
        fontWeight={700}
        textAnchor="middle"
        fill="#1f2937"
        stroke="none"
      >
        {String(properties.name ?? "")}
        {properties.triggerAt === "retracted" ? "↓" : "↑"}
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

