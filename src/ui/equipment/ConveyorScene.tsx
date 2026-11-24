import { useEffect, useId, useRef, useState } from "react";
import { automationInputs, CONVEYOR_TRAVEL, GATE_WINDOW, type AutomationStationState, type WorkpieceMaterial } from "../../core/sim/automation-station";
import plate from "./assets/automation-station.webp";

/** 공개문제 그림 1의 접점들을 한 카메라에 투영한 좌표. */
// 정면 투영에서 A 축은 화면 세로, C와 벨트 축은 가로다. 두 축은 B 지그에서 만난다.
const nest = { x: 513, y: 530 };
const magazine = { x: nest.x, y: 615 };
const inlet = { x: 683, y: nest.y };
const aRestY = 640;
const cRestX = 411;
const puckHalfWidth = 26;
const puckHalfDepth = 8;
const easeStroke = (u: number) => u * u * (3 - 2 * u);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const aTip = (u: number) => mix(aRestY, nest.y + puckHalfDepth, easeStroke(u));
const cTip = (u: number) => mix(cRestX, inlet.x - puckHalfWidth, easeStroke(u));

function SensorFlag({ name, active, x, y, headX, headY, k = 1 }: {
  name: string; active: boolean; x: number; y: number; headX: number; headY: number;
  /** 카메라 확대 시 이름표가 화면에서 같은 크기로 보이도록 줄이는 배율 (Phase 35) */
  k?: number;
}) {
  const color = active ? "#8af6c6" : "#c3caca";
  // 확대 구역에서는 이름표를 센서 머리 쪽으로 당겨 붙이고 크기를 줄인다. 지시선은
  // 배경 좌표에서 그려 센서 머리를 정확히 가리킨다.
  const fx = headX + (x - headX) * k;
  const fy = headY + (y - headY) * k;
  return <g data-sensor-label={name} data-on={active}>
    <path d={`M${fx + 78 * k} ${fy + 44 * k} v${14 * k} L${headX} ${headY}`} fill="none" stroke={color} strokeWidth={2 * k}/>
    <g transform={`translate(${fx} ${fy}) scale(${k})`}>
    <rect width={156} height={44} rx={8} fill={active ? "#123b33" : "#252d32"} stroke={color} strokeWidth={2}/>
    <circle cx={15} cy={22} r={5} fill={active ? "#74ffc2" : "#81888d"}/>
    <text x={26} y={30} fontSize={22} fontWeight={650} fill="#fff">{name}</text>
    <text x={104} y={29} fontSize={19} fill={color}>{active ? "감지" : "대기"}</text>
    </g>
  </g>;
}

const beltLength = 1467 - inlet.x;
const beltX = (progress: number) => inlet.x + beltLength * progress;
// 분기 장치를 실제 접촉 위치로 옮긴다. 공작물의 이송 속도는 구간마다 같아야 한다.
const gateOffset = 50;
const pushFraction = (d: number) => Math.max(0, (d - 0.23) / 0.77);

function BracketProbe({ name, active, transform, steel }: {
  name: string; active: boolean; transform: string; steel: string;
}) {
  return <g transform={transform} strokeLinejoin="round">
    <path d="M0 -24 C-1 -35 4 -38 2 -47" fill="none" stroke="#34373a" strokeWidth={5}/>
    <rect x={-5} y={-27} width={10} height={10} rx={3} fill="#53585a"/>
    <rect x={-8} y={-19} width={16} height={37} rx={3} fill={steel} stroke="#565b5c"/>
    {[-10,-6,-2,8,12].map(y=><path key={y} d={`M-7 ${y+2} l14 -3`} stroke="#666d70" strokeWidth={1.2}/>)}
    <path d="M-12 1 l5 -4 h14 l5 4 -4 6 H-8Z" fill={steel} stroke="#555b5e"/>
    <ellipse cy={18} rx={8} ry={3} fill="#374349" stroke="#a6abad"/>
    <circle cy={-13} r={3} data-sensor={name} data-on={active} fill={active ? "#ffca54" : "#5e503b"}/>
  </g>;
}

/**
 * 시그널 타워 (Phase 36) — 적(상)·황(중)·녹(하) 적층 램프. 자동화설비 배치도의 신호등으로,
 * 배경 사진에는 없어서 SVG로 덧그린다. 켜진 램프는 렌즈가 밝아지고 빛이 번진다.
 */
const TOWER = { x: 1638, top: 240, base: 628 };
function SignalTower({ lamps, glowId }: { lamps: AutomationStationState["lamps"]; glowId: string }) {
  const seg = 46;
  const w = 40;
  const x0 = TOWER.x - w / 2;
  const colors = [
    ["red", "#ef4444", "#7f1d1d"],
    ["yellow", "#facc15", "#78590a"],
    ["green", "#22c55e", "#14532d"],
  ] as const;
  return <g data-signal-tower>
    {/* 기둥 + 받침 */}
    <rect x={TOWER.x - 5} y={TOWER.top + seg * 3 + 22} width={10} height={TOWER.base - TOWER.top - seg * 3 - 22} fill="#b9c1c3" stroke="#454a4d"/>
    <path d={`M${TOWER.x - 22} ${TOWER.base} h44 l-6 -9 h-32Z`} fill="#3a3f44"/>
    {/* 램프 몸통 — 위 캡, 렌즈 3단, 아래 목 */}
    <rect x={x0 + 4} y={TOWER.top - 10} width={w - 8} height={12} rx={4} fill="#2b2f33"/>
    {colors.map(([key, on, off], i) => {
      const lit = lamps[key];
      const y = TOWER.top + i * seg;
      return <g key={key} data-lamp={key} data-on={lit}>
        {lit && <ellipse cx={TOWER.x} cy={y + seg / 2} rx={58} ry={44} fill={on} opacity={.28} filter={`url(#${glowId})`}/>}
        <rect x={x0} y={y} width={w} height={seg - 2} rx={5} fill={lit ? on : off} opacity={lit ? 1 : .55} stroke="#1b1e21" strokeWidth={2}/>
        <rect x={x0 + 6} y={y + 5} width={7} height={seg - 14} rx={3} fill="#fff" opacity={lit ? .55 : .14}/>
        {[0.33, 0.66].map(t => <line key={t} x1={x0 + 2} x2={x0 + w - 2} y1={y + (seg - 2) * t} y2={y + (seg - 2) * t} stroke="#000" opacity={.12}/>)}
      </g>;
    })}
    <rect x={x0 + 6} y={TOWER.top + seg * 3 - 2} width={w - 12} height={24} rx={3} fill="#2b2f33"/>
  </g>;
}

function ChromeRod({ x1,y1,x2,y2,width = 11 }: { x1:number; y1:number; x2:number; y2:number; width?:number }) {
  return <g strokeLinecap="round">
    <line {...{x1,y1,x2,y2}} stroke="#454a4d" strokeWidth={width}/>
    <line {...{x1,y1,x2,y2}} stroke="#b9c1c3" strokeWidth={width*.75}/>
    <line x1={x1-1} x2={x2-1} y1={y1-1} y2={y2-1} stroke="#f2f1eb" strokeWidth={width*.22}/>
  </g>;
}

/**
 * 카메라 구역 (Phase 35). 배경 그림 좌표(1672×941)에서 공정 단계별로 볼 영역.
 * 가로세로비를 화면(16:9 근처)에 맞춰 확대해도 여백 없이 꽉 차게 잡았다.
 */
export type StationZone = "all" | "supply" | "belt" | "detect" | "sort";
const ZONE_BOX: Record<StationZone, [number, number, number, number]> = {
  all: [0, 0, 1672, 941],
  /** 벨트 전 구간 (검출부 ~ 끝 저장함) — 자동 추적이 검출·분류를 한 시점으로 묶어 본다 */
  belt: [470, 150, 1202, 676],
  supply: [130, 170, 760, 428],
  detect: [500, 200, 640, 360],
  sort: [860, 210, 812, 457],
};

/** 공정 단계 (Phase 35) — 모니터의 단계 표시줄·자동 추적 카메라가 같은 판정을 쓴다 */
export type StationStage = "supply" | "drill" | "send" | "detect" | "sort";
export const STAGE_ZONE: Record<StationStage, StationZone> = {
  supply: "supply",
  drill: "supply",
  send: "supply",
  detect: "detect",
  sort: "sort",
};

/** 지금 움직이고 있는 공정 단계들 (여러 공작물이 동시에 다른 단계에 있을 수 있다) */
export function activeStages(station: AutomationStationState): Set<StationStage> {
  const on = new Set<StationStage>();
  const { A, B, C, D } = station.cyl;
  if (A > 0.02 || station.feedStroke > 0) on.add("supply");
  if (B > 0.02) on.add("drill");
  if (C > 0.02 || station.sendStroke > 0) on.add("send");
  if (station.belt.some((p) => p.progress < GATE_WINDOW[0])) on.add("detect");
  if (D > 0.02 || station.falling.length > 0 || station.belt.some((p) => p.progress >= GATE_WINDOW[0])) on.add("sort");
  return on;
}

/**
 * 자동 추적 카메라가 볼 구역 — 가장 하류(나중) 단계를 우선한다. 공작물이 검출·분류
 * 구간에 있으면 그쪽이 수업에서 놓치기 쉬운 장면이고, 공급부는 다음 사이클에 다시 온다.
 */
export function followZone(station: AutomationStationState): StationZone {
  const on = activeStages(station);
  if (on.has("sort")) return "sort";
  if (on.has("detect")) return "detect";
  if (on.has("supply") || on.has("drill") || on.has("send")) return "supply";
  return "all";
}

/**
 * 자동 추적이 실제로 쓰는 시점 (Phase 36). 단계마다 시점을 바꾸면 검출→분류처럼 짧은 구간에서
 * 화면이 연달아 움직여 어지럽다. 그래서 자동 추적은 시점을 셋으로만 쓴다 —
 * 공급부(공급·가공·송출) / 벨트 전체(검출·분류) / 전체(정지).
 */
export function autoZone(station: AutomationStationState): StationZone {
  const zone = followZone(station);
  return zone === "detect" || zone === "sort" ? "belt" : zone;
}

/**
 * 자동 추적 시점 결정기 (Phase 36) — 판정이 잠깐 흔들려도 화면이 따라 흔들리지 않게 한다.
 * - 새 시점은 판정이 SETTLE_MS 동안 그대로일 때만 받아들인다 (단계 사이 빈틈에서 튀지 않음)
 * - 한 번 옮긴 뒤 HOLD_MS 동안은 머문다 (연속 전환 방지)
 * - "전체"(정지)로 물러나는 것은 IDLE_MS 동안 아무것도 안 움직일 때만 — 사이클 사이 잠깐의
 *   정지에서 확대가 풀렸다 다시 잡히던 문제를 막는다
 */
export class ZoneFollower {
  static SETTLE_MS = 500;
  static HOLD_MS = 1800;
  static IDLE_MS = 3000;
  private zone: StationZone = "all";
  private since = -Infinity;
  private pending: StationZone | null = null;
  private pendingSince = 0;

  update(candidate: StationZone, now: number): StationZone {
    if (candidate === this.zone) {
      this.pending = null;
      return this.zone;
    }
    if (candidate !== this.pending) {
      this.pending = candidate;
      this.pendingSince = now;
    }
    const settle = candidate === "all" ? ZoneFollower.IDLE_MS : ZoneFollower.SETTLE_MS;
    if (now - this.pendingSince >= settle && now - this.since >= ZoneFollower.HOLD_MS) {
      this.zone = candidate;
      this.since = now;
      this.pending = null;
    }
    return this.zone;
  }
}

/**
 * viewBox를 목표 구역으로 부드럽게 옮긴다 (SVG viewBox는 CSS 전환이 안 돼 rAF로 보간).
 * 경과 시간 기반 지수 감쇠(시정수 0.45초)라 화면 주사율과 무관하게 같은 속도로 움직이고,
 * 이동 중에 목표가 바뀌어도 지금 위치에서 이어서 간다.
 */
function useAnimatedBox(target: [number, number, number, number]): [number, number, number, number] {
  const [box, setBox] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const alpha = 1 - Math.exp(-dt / 0.45);
      const next = current.current.map((v, i) => v + (target[i] - v) * alpha) as [number, number, number, number];
      const done = next.every((v, i) => Math.abs(v - target[i]) < 0.5);
      current.current = done ? target : next;
      setBox(current.current);
      if (!done) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target[0], target[1], target[2], target[3]]);
  return box;
}

export function ConveyorScene({
  station,
  zone = "all",
  compact = false,
}: {
  station: AutomationStationState;
  /** 카메라 구역 (Phase 35 — 예전 supplyCloseup을 일반화) */
  zone?: StationZone;
  /** 장비 뷰 카드처럼 작게 그릴 때 — 센서 이름표를 숨긴다 */
  compact?: boolean;
}) {
  const id = useId();
  const box = useAnimatedBox(ZONE_BOX[zone]);
  // 이름표는 화면 기준으로 크기를 유지 — 확대할수록(보이는 폭이 좁을수록) 배경 좌표에서 작게
  const flagScale = Math.max(0.45, Math.min(1, box[2] / 1672 * 1.25));
  const paint = (name: string) => `url(#${id}-${name})`;
  const { A, B, C, D } = station.cyl;
  const inputs = automationInputs(station);
  const faceX = 1005 + 24 * D;
  const faceY = 463 + 112 * D;

  function puck(material: WorkpieceMaterial, x: number, y: number, key: string, stage: string, drilled = false) {
    return <g key={key} transform={`translate(${x} ${y})`} data-piece={material} data-stage={stage}>
      <ellipse cy={9} rx={27} ry={7} fill="#101419" opacity={.36}/>
      <path d="M-26 -5 a26 8 0 0 1 52 0 v9 a26 8 0 0 1 -52 0Z" fill={material === "metal" ? paint("steel") : "#a45c1c"}/>
      <ellipse cy={-5} rx={26} ry={8} fill={material === "metal" ? paint("cap") : "#e5a354"} stroke="#d9d3c3"/>
      {drilled && <ellipse cy={-5} rx={5.4} ry={2.4} fill="#3b4141" stroke="#d0cebf" strokeWidth={.8}/>}
    </g>;
  }
  const feedY = Math.min(magazine.y, aTip(station.feedStroke) - puckHalfDepth);
  const sendX = Math.max(nest.x, cTip(station.sendStroke) + puckHalfWidth);
  const quill = easeStroke(B);
  const stackLift = station.aPushed ? Math.max(0, (A - .5) * 2) : 0;
  const bitPhase = station.drillAngle * Math.PI / 180;
  return <svg viewBox={box.join(" ")} width="100%" height="100%" role="img" aria-label="매거진 공급, 드릴 가공, 컨베이어 송출과 재질별 분기 배출">
    <defs>
      <linearGradient id={id+"-steel"}><stop stopColor="#565855"/><stop offset=".14" stopColor="#eeede8"/><stop offset=".35" stopColor="#a8aaa6"/><stop offset=".68" stopColor="#646765"/><stop offset=".9" stopColor="#cfd2cd"/><stop offset="1" stopColor="#5a5b56"/></linearGradient>
      <linearGradient id={id+"-cap"} x2=".8" y2="1"><stop stopColor="#898d89"/><stop offset=".45" stopColor="#f5f4ed"/><stop offset="1" stopColor="#929692"/></linearGradient>
      <clipPath id={id+"-side-rim"}><path d="M0 0 H1672 V668 H923 L908 594 H0Z" transform={`translate(${gateOffset})`}/></clipPath>
      <clipPath id={id+"-end-rim"}><path d="M1380 385 H1640 V533 L1486 537 H1380Z"/></clipPath>
      <image id={id+"-bed"} href={plate} width="1672" height="941"/>
      <linearGradient id={id+"-join"}><stop offset=".94" stopColor="white"/><stop offset="1" stopColor="black"/></linearGradient>
      <filter id={id+"-glow"} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
      <mask id={id+"-left"}><rect x={0} y={385} width={665} height={235} fill={paint("join")}/></mask>
    </defs>
    <use href={"#"+id+"-bed"}/>
    {/* 왼쪽 이송 테이블만 투영 보정해 정지 배경의 지그 중심(493)을 벨트 중심(530)에 맞춘다. */}
    <g mask={paint("left")}>
      <svg x={0} y={385} width={665} height={145} viewBox="0 385 665 108" preserveAspectRatio="none"><use href={"#"+id+"-bed"}/></svg>
      <svg x={0} y={530} width={665} height={90} viewBox="0 493 665 127" preserveAspectRatio="none"><use href={"#"+id+"-bed"}/></svg>
    </g>
    {/* 배경의 D 몸체와 배출함을 함께 정렬한다. 양옆의 빈 프레임만 폭을 보간한다. */}
    <svg x={800} width={75+gateOffset} height={941} viewBox="800 0 75 941" preserveAspectRatio="none"><use href={"#"+id+"-bed"}/></svg>
    <svg x={875+gateOffset} width={295} height={941} viewBox="875 0 295 941"><use href={"#"+id+"-bed"}/></svg>
    <svg x={1170+gateOffset} width={190-gateOffset} height={941} viewBox="1170 0 190 941" preserveAspectRatio="none"><use href={"#"+id+"-bed"}/></svg>
    {/* A는 매거진 밑에서 가공점으로, C는 가공점에서 벨트 입구로 민다. */}
    <ChromeRod x1={406} y1={nest.y-4} x2={cTip(C)-4} y2={nest.y-4} width={12}/>
    <g transform={`translate(${cTip(C)-5} ${nest.y-4})`} data-axis="C">
      <path d="M-9 -8 l7 -4 7 3 -6 4Z" fill="#e1e3df"/>
      <path d="M-9 -8 l8 3 v13 l-8 -4Z" fill={paint("steel")}/><path d="M-1 -5 l6 -4 v13 l-6 4Z" fill="#666e70"/>
    </g>
    <ChromeRod x1={nest.x} y1={649} x2={nest.x} y2={aTip(A)} width={10}/>
    <g transform={`translate(${nest.x} ${aTip(A)})`} data-axis="A">
      <path d="M-18 0 h36 v5 l-4 2 h-31Z" fill={paint("steel")} stroke="#64696b"/>
    </g>
    {station.magazine.map((m,i) => {
      if (i === 0 && feedY < magazine.y) return puck(m,magazine.x,feedY,"feed","공급");
      return puck(m,magazine.x,magazine.y-(i+stackLift)*15,"m"+i,"적재");
    })}
    <path d="M480 577 v40 m66 -40 v40" stroke="#dfe9f2" opacity={.55} strokeWidth={3}/>
    {station.supply && puck(station.supply,sendX,nest.y,"nest",sendX>nest.x ? "송출" : "가공",station.supplyDrilled)}
    {/* B의 퀼·척·절삭날은 한 축에서 함께 하강하고 가공물은 지그에 고정된다. */}
    <ChromeRod x1={nest.x} y1={380} x2={nest.x} y2={392+98*quill} width={24}/>
    <g transform={`translate(${nest.x} ${390+98*quill})`} data-drill={B} data-angle={station.drillAngle}>
      <path d="M-14 -6 h28 v9 l-5 10 -5 4 h-8 l-6 -4 -4 -10Z" fill={paint("steel")} stroke="#42464a"/>
      <ellipse cy={-4} rx={13} ry={3.5} fill={paint("cap")}/>
      {[0, 2.1, 4.2].map(phase => <path key={phase} d={`M${10*Math.sin(bitPhase+phase)} 1 l-1 8`} opacity={Math.max(0,Math.cos(bitPhase+phase))} stroke="#414746" strokeWidth={2.6}/>)}
      <path d="M-3.3 16 h6.6 v18 l-3.3 4 -3.3 -4Z" fill="#697173"/>
      <path d="M-3 18 l6 3 -6 3 6 3 -6 3 6 3" fill="none" stroke="#ecece6" strokeWidth={1.7} strokeDasharray="4 2" strokeDashoffset={station.drillAngle/30}/>
    </g>
    <svg x={inlet.x} y={492} width={beltLength} height={84} overflow="hidden">
      <g data-belt-phase={station.beltOffset} transform={`translate(${(station.beltOffset / CONVEYOR_TRAVEL * beltLength) % 112})`}>
        {Array.from({length: 8}, (_, i) => <path key={i} d={`M${(i-1)*112+10} 65 l-3 11`} stroke="#b9bfc0" opacity={.55} strokeWidth={3}/>)}
      </g>
    </svg>
    {/* 문틀형 검출부. 먼쪽 다리와 측면 유도형 헤드를 먼저 그리고, 가까운 다리는 공작물 뒤에 덧그린다. */}
    <g fill={paint("steel")} stroke="#4e5559" strokeWidth={2}>
      <path d="M777 489 v-57 l9 -4 h13 v63 l-8 5Z"/>
      <path d="M776 490 l17 -5 12 5 -14 6Z" fill={paint("cap")}/>
      <circle cx={792} cy={482} r={2.5} fill="#505457"/>
    </g>
    <BracketProbe name="유도형" active={inputs.유도형} transform="translate(789 470) rotate(56)" steel={paint("steel")}/>
    <g data-stroke={D} transform={`translate(${gateOffset})`}>
      <ChromeRod x1={1004} y1={451} x2={faceX} y2={faceY} width={16}/>
      <g transform={`translate(${faceX} ${faceY})`}><path d="M-33 -8 l5 -4 h66 l-5 4Z" fill="#e2e1d9"/><rect x={-33} y={-8} width={66} height={18} rx={2} fill={paint("steel")} stroke="#666968"/>{[-25,25].map(x=><circle key={x} cx={x} r={2.5} fill="#424548"/>)}</g>
    </g>
    {station.belt.map((p,i) => {
      const push = p.progress >= GATE_WINDOW[0] && p.progress <= GATE_WINDOW[1] ? pushFraction(D) : 0;
      return puck(p.material,beltX(p.progress),inlet.y+69*push,"b"+i,"이송",p.drilled);
    })}
    {station.falling.map((p,i) => {
      const end = p.destination === "store";
      const x = end ? beltX(1)+70*p.fraction : beltX(p.progress)+7*p.fraction;
      const y = end ? 530-20*p.fraction+55*p.fraction*p.fraction : 530+69*pushFraction(p.stroke)+116*p.fraction*p.fraction;
      return <g key={i} clipPath={paint(end ? "end-rim" : "side-rim")}>{puck(p.material,x,y,"drop",end ? "끝 저장" : "옆 배출",p.drilled)}</g>;
    })}
    {/* ∩ 상부 가로대가 벨트 폭을 건너며 용량형 헤드는 위에서 아래를 향한다. */}
    <g fill={paint("steel")} stroke="#50575a" strokeWidth={2}>
      <path d="M699 474 l78 -50 24 2 -79 51Z" fill={paint("cap")}/>
      <path d="M722 477 l79 -51 v8 l-79 51Z" fill="#949a9c"/>
      <path d="M699 474 l23 3 v95 l-23 -3Z"/>
      <path d="M722 477 l6 -4 v95 l-6 4Z" fill="#82898c"/>
      <path d="M699 565 l23 3 -5 9 -29 -3Z" fill={paint("cap")}/>
      <circle cx={706} cy={557} r={2.5} fill="#545859"/>
      <circle cx={715} cy={483} r={2} fill="#545859"/>
    </g>
    <BracketProbe name="포토" active={inputs.포토} transform="translate(709 540) rotate(-124)" steel={paint("steel")}/>
    <BracketProbe name="용량형" active={inputs.용량형} transform="translate(751 445)" steel={paint("steel")}/>
    <SignalTower lamps={station.lamps} glowId={id+"-glow"}/>
    {!compact && zone !== "supply" && <>
      <SensorFlag name="포토" active={inputs.포토} x={542} y={338} headX={704} headY={540} k={flagScale}/>
      <SensorFlag name="용량형" active={inputs.용량형} x={653} y={251} headX={751} headY={432} k={flagScale}/>
      <SensorFlag name="유도형" active={inputs.유도형} x={822} y={322} headX={800} headY={463} k={flagScale}/>
    </>}
  </svg>;
}
