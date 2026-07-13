import { registerComponent } from "../registry";
import type { ComponentDefinition, PropertyField } from "../types";

/**
 * 공압 부품 라이브러리 (Phase 1).
 * 포트 좌표는 그리드(10px) 정렬, rotation 0 기준.
 * 밸브 기호 규약: 위치 박스는 왼쪽부터 index 0. 포트는 initial 위치 박스에 접속.
 */

const labelProperty: PropertyField = {
  key: "label",
  label: "실린더 이름표",
  type: "text",
  default: "A",
};

// ---------- 동력원 · 배기 ----------

export const pneumaticSource: ComponentDefinition = {
  type: "pneu.source",
  domain: "pneumatic",
  name: "공압원",
  category: "공압 · 동력원",
  ports: [{ id: "P", kind: "pneumatic", offset: { x: 0, y: -30 }, direction: "up" }],
  propertySchema: [
    { key: "pressure", label: "공급 압력", type: "number", default: 6, min: 1, max: 10, step: 0.5, unit: "bar" },
  ],
  symbolId: "pneu.source",
  bounds: { x: -20, y: -30, width: 40, height: 50 },
  behavior: { role: "source", port: "P" },
};

export const serviceUnit: ComponentDefinition = {
  type: "pneu.service-unit",
  domain: "pneumatic",
  name: "서비스 유닛 (FRL)",
  category: "공압 · 동력원",
  ports: [
    { id: "P", label: "IN", kind: "pneumatic", offset: { x: -30, y: 0 }, direction: "left" },
    { id: "A", label: "OUT", kind: "pneumatic", offset: { x: 30, y: 0 }, direction: "right" },
  ],
  propertySchema: [],
  symbolId: "pneu.service-unit",
  bounds: { x: -30, y: -25, width: 60, height: 50 },
  behavior: { role: "conduit", connections: [["P", "A"]] },
};

export const silencer: ComponentDefinition = {
  type: "pneu.silencer",
  domain: "pneumatic",
  name: "소음기 (배기)",
  category: "공압 · 동력원",
  ports: [{ id: "R", kind: "pneumatic", offset: { x: 0, y: -20 }, direction: "up" }],
  propertySchema: [],
  symbolId: "pneu.silencer",
  bounds: { x: -15, y: -20, width: 30, height: 40 },
  behavior: { role: "exhaust", port: "R" },
};

export const teeJunction: ComponentDefinition = {
  type: "pneu.tee",
  domain: "pneumatic",
  name: "T 분기",
  category: "공압 · 동력원",
  ports: [
    { id: "1", kind: "pneumatic", offset: { x: -20, y: 0 }, direction: "left" },
    { id: "2", kind: "pneumatic", offset: { x: 20, y: 0 }, direction: "right" },
    { id: "3", kind: "pneumatic", offset: { x: 0, y: 20 }, direction: "down" },
  ],
  propertySchema: [],
  symbolId: "pneu.tee",
  bounds: { x: -20, y: -10, width: 40, height: 30 },
  behavior: { role: "conduit", connections: [["1", "2"], ["1", "3"]] },
};

// ---------- 3/2 방향제어밸브 ----------

/** 3/2 NC: 박스0(조작) P→A, 박스1(정지) A→R·P차단. 포트는 박스1에 접속 */
const valve32Positions = [
  { connections: [["P", "A"]] as [string, string][] },
  { connections: [["A", "R"]] as [string, string][] },
];

export const valve32Manual: ComponentDefinition = {
  type: "pneu.valve.3-2-manual",
  domain: "pneumatic",
  name: "3/2 밸브 (수동, 스프링 복귀)",
  category: "공압 · 방향제어밸브",
  ports: [
    { id: "A", label: "A", kind: "pneumatic", offset: { x: 20, y: -30 }, direction: "up" },
    { id: "P", label: "P", kind: "pneumatic", offset: { x: 10, y: 30 }, direction: "down" },
    { id: "R", label: "R", kind: "pneumatic", offset: { x: 30, y: 30 }, direction: "down" },
  ],
  propertySchema: [
    {
      key: "actuation",
      label: "조작 방식",
      type: "select",
      default: "pushbutton",
      options: [
        { value: "pushbutton", label: "푸시버튼 (누르는 동안)" },
        { value: "lever", label: "레버 (디텐트, 토글)" },
      ],
    },
  ],
  symbolId: "pneu.valve.3-2-manual",
  bounds: { x: -62, y: -30, width: 126, height: 60 },
  behavior: {
    role: "valve",
    positions: valve32Positions,
    initial: 1,
    left: { kind: "manual" },
    right: { kind: "spring" },
    exhaustPorts: ["R"],
  },
};

export const valve32Roller: ComponentDefinition = {
  type: "pneu.valve.3-2-roller",
  domain: "pneumatic",
  name: "3/2 밸브 (롤러 리밋)",
  category: "공압 · 방향제어밸브",
  ports: [
    { id: "A", label: "A", kind: "pneumatic", offset: { x: 20, y: -30 }, direction: "up" },
    { id: "P", label: "P", kind: "pneumatic", offset: { x: 10, y: 30 }, direction: "down" },
    { id: "R", label: "R", kind: "pneumatic", offset: { x: 30, y: 30 }, direction: "down" },
  ],
  propertySchema: [
    { key: "cylinderLabel", label: "감지 실린더 이름표", type: "text", default: "A" },
    {
      key: "triggerAt",
      label: "감지 위치",
      type: "select",
      default: "extended",
      options: [
        { value: "extended", label: "전진단" },
        { value: "retracted", label: "후진단" },
      ],
    },
  ],
  symbolId: "pneu.valve.3-2-roller",
  bounds: { x: -62, y: -30, width: 126, height: 74 },
  behavior: {
    role: "valve",
    positions: valve32Positions,
    initial: 1,
    left: { kind: "roller" },
    right: { kind: "spring" },
    exhaustPorts: ["R"],
  },
};

// ---------- 5/2 방향제어밸브 ----------

/**
 * 5/2 포트 배치 (60폭 박스, initial 박스 기준):
 * 상단 A(+20), B(+40) / 하단 R1(+10), P(+30), R2(+50)
 * 박스0: P→A, B→R2 · 박스1: P→B, A→R1
 */
const valve52Positions = [
  { connections: [["P", "A"], ["B", "R2"]] as [string, string][] },
  { connections: [["P", "B"], ["A", "R1"]] as [string, string][] },
];

const valve52Ports = (boxLeft: number) => [
  { id: "A", label: "A", kind: "pneumatic" as const, offset: { x: boxLeft + 20, y: -30 }, direction: "up" as const },
  { id: "B", label: "B", kind: "pneumatic" as const, offset: { x: boxLeft + 40, y: -30 }, direction: "up" as const },
  { id: "R1", label: "R1", kind: "pneumatic" as const, offset: { x: boxLeft + 10, y: 30 }, direction: "down" as const },
  { id: "P", label: "P", kind: "pneumatic" as const, offset: { x: boxLeft + 30, y: 30 }, direction: "down" as const },
  { id: "R2", label: "R2", kind: "pneumatic" as const, offset: { x: boxLeft + 50, y: 30 }, direction: "down" as const },
];

export const valve52Manual: ComponentDefinition = {
  type: "pneu.valve.5-2-manual",
  domain: "pneumatic",
  name: "5/2 밸브 (수동 레버)",
  category: "공압 · 방향제어밸브",
  // initial=1 (오른쪽 박스, x 0..60)
  ports: valve52Ports(0),
  propertySchema: [
    {
      key: "actuation",
      label: "조작 방식",
      type: "select",
      default: "lever",
      options: [
        { value: "lever", label: "레버 (디텐트, 토글)" },
        { value: "pushbutton", label: "푸시버튼 (누르는 동안)" },
      ],
    },
  ],
  symbolId: "pneu.valve.5-2-manual",
  bounds: { x: -82, y: -30, width: 166, height: 60 },
  behavior: {
    role: "valve",
    positions: valve52Positions,
    initial: 1,
    left: { kind: "manual" },
    right: { kind: "spring" },
    exhaustPorts: ["R1", "R2"],
  },
};

export const valve52DoublePilot: ComponentDefinition = {
  type: "pneu.valve.5-2-double-pilot",
  domain: "pneumatic",
  name: "5/2 밸브 (양측 파일럿, 임펄스)",
  category: "공압 · 방향제어밸브",
  ports: [
    ...valve52Ports(0),
    { id: "X", label: "X", kind: "pneumatic", offset: { x: -70, y: 0 }, direction: "left" },
    { id: "Y", label: "Y", kind: "pneumatic", offset: { x: 70, y: 0 }, direction: "right" },
  ],
  propertySchema: [
    {
      key: "initialPosition",
      label: "초기 위치",
      type: "select",
      default: "right",
      options: [
        { value: "right", label: "P→B (오른쪽 박스)" },
        { value: "left", label: "P→A (왼쪽 박스)" },
      ],
    },
  ],
  symbolId: "pneu.valve.5-2-double-pilot",
  bounds: { x: -70, y: -30, width: 140, height: 60 },
  behavior: {
    role: "valve",
    positions: valve52Positions,
    initial: 1, // initialPosition 속성이 엔진에서 재해석
    left: { kind: "pilot", pilotPort: "X" },
    right: { kind: "pilot", pilotPort: "Y" },
    exhaustPorts: ["R1", "R2"],
  },
};

export const valve52SinglePilot: ComponentDefinition = {
  type: "pneu.valve.5-2-single-pilot",
  domain: "pneumatic",
  name: "5/2 밸브 (편측 파일럿, 스프링 복귀)",
  category: "공압 · 방향제어밸브",
  ports: [
    ...valve52Ports(0),
    { id: "X", label: "X", kind: "pneumatic", offset: { x: -70, y: 0 }, direction: "left" },
  ],
  propertySchema: [],
  symbolId: "pneu.valve.5-2-single-pilot",
  bounds: { x: -70, y: -30, width: 156, height: 60 },
  behavior: {
    role: "valve",
    positions: valve52Positions,
    initial: 1,
    left: { kind: "pilot", pilotPort: "X" },
    right: { kind: "spring" },
    exhaustPorts: ["R1", "R2"],
  },
};

// ---------- 솔레노이드 밸브 (전기공압, Phase 2) ----------

export const valve32Solenoid: ComponentDefinition = {
  type: "pneu.valve.3-2-solenoid",
  domain: "pneumatic",
  name: "3/2 밸브 (솔레노이드, 스프링 복귀)",
  category: "공압 · 방향제어밸브",
  ports: [
    { id: "A", label: "A", kind: "pneumatic", offset: { x: 20, y: -30 }, direction: "up" },
    { id: "P", label: "P", kind: "pneumatic", offset: { x: 10, y: 30 }, direction: "down" },
    { id: "R", label: "R", kind: "pneumatic", offset: { x: 30, y: 30 }, direction: "down" },
  ],
  propertySchema: [
    { key: "solenoidLeft", label: "솔레노이드 이름", type: "text", default: "Y1" },
  ],
  symbolId: "pneu.valve.3-2-solenoid",
  bounds: { x: -58, y: -30, width: 122, height: 60 },
  behavior: {
    role: "valve",
    positions: valve32Positions,
    initial: 1,
    left: { kind: "solenoid", solenoidProp: "solenoidLeft" },
    right: { kind: "spring" },
    exhaustPorts: ["R"],
  },
};

export const valve52Solenoid: ComponentDefinition = {
  type: "pneu.valve.5-2-solenoid",
  domain: "pneumatic",
  name: "5/2 밸브 (편측 솔레노이드, 스프링 복귀)",
  category: "공압 · 방향제어밸브",
  ports: valve52Ports(0),
  propertySchema: [
    { key: "solenoidLeft", label: "솔레노이드 이름", type: "text", default: "Y1" },
  ],
  symbolId: "pneu.valve.5-2-solenoid",
  bounds: { x: -78, y: -30, width: 162, height: 60 },
  behavior: {
    role: "valve",
    positions: valve52Positions,
    initial: 1,
    left: { kind: "solenoid", solenoidProp: "solenoidLeft" },
    right: { kind: "spring" },
    exhaustPorts: ["R1", "R2"],
  },
};

export const valve52DoubleSolenoid: ComponentDefinition = {
  type: "pneu.valve.5-2-double-solenoid",
  domain: "pneumatic",
  name: "5/2 밸브 (양측 솔레노이드, 임펄스)",
  category: "공압 · 방향제어밸브",
  ports: valve52Ports(0),
  propertySchema: [
    { key: "solenoidLeft", label: "왼쪽 솔레노이드 (→P-A)", type: "text", default: "Y1" },
    { key: "solenoidRight", label: "오른쪽 솔레노이드 (→P-B)", type: "text", default: "Y2" },
    {
      key: "initialPosition",
      label: "초기 위치",
      type: "select",
      default: "right",
      options: [
        { value: "right", label: "P→B (오른쪽 박스)" },
        { value: "left", label: "P→A (왼쪽 박스)" },
      ],
    },
  ],
  symbolId: "pneu.valve.5-2-double-solenoid",
  bounds: { x: -78, y: -30, width: 156, height: 60 },
  behavior: {
    role: "valve",
    positions: valve52Positions,
    initial: 1,
    left: { kind: "solenoid", solenoidProp: "solenoidLeft" },
    right: { kind: "solenoid", solenoidProp: "solenoidRight" },
    exhaustPorts: ["R1", "R2"],
  },
};

/** 5/3 클로즈드 센터: 포트는 중앙 박스(-30..30)에 접속 */
export const valve53DoubleSolenoid: ComponentDefinition = {
  type: "pneu.valve.5-3-double-solenoid",
  domain: "pneumatic",
  name: "5/3 밸브 (양측 솔레노이드, 클로즈드 센터)",
  category: "공압 · 방향제어밸브",
  ports: [
    { id: "A", label: "A", kind: "pneumatic", offset: { x: -10, y: -30 }, direction: "up" },
    { id: "B", label: "B", kind: "pneumatic", offset: { x: 10, y: -30 }, direction: "up" },
    { id: "R1", label: "R1", kind: "pneumatic", offset: { x: -20, y: 30 }, direction: "down" },
    { id: "P", label: "P", kind: "pneumatic", offset: { x: 0, y: 30 }, direction: "down" },
    { id: "R2", label: "R2", kind: "pneumatic", offset: { x: 20, y: 30 }, direction: "down" },
  ],
  propertySchema: [
    { key: "solenoidLeft", label: "왼쪽 솔레노이드 (→P-A)", type: "text", default: "Y1" },
    { key: "solenoidRight", label: "오른쪽 솔레노이드 (→P-B)", type: "text", default: "Y2" },
  ],
  symbolId: "pneu.valve.5-3-double-solenoid",
  bounds: { x: -108, y: -30, width: 216, height: 60 },
  behavior: {
    role: "valve",
    positions: [
      { connections: [["P", "A"], ["B", "R2"]] },
      { connections: [] }, // 클로즈드 센터
      { connections: [["P", "B"], ["A", "R1"]] },
    ],
    initial: 1,
    left: { kind: "solenoid", solenoidProp: "solenoidLeft" },
    right: { kind: "solenoid", solenoidProp: "solenoidRight" },
    exhaustPorts: ["R1", "R2"],
    springCentered: true,
  },
};

// ---------- 액추에이터 ----------

export const cylinderDouble: ComponentDefinition = {
  type: "pneu.cylinder.double",
  domain: "pneumatic",
  name: "복동 실린더",
  category: "공압 · 액추에이터",
  ports: [
    { id: "HEAD", label: "헤드측", kind: "pneumatic", offset: { x: -30, y: 20 }, direction: "down" },
    { id: "ROD", label: "로드측", kind: "pneumatic", offset: { x: 20, y: 20 }, direction: "down" },
  ],
  propertySchema: [
    labelProperty,
    {
      key: "initialPosition",
      label: "초기 위치",
      type: "select",
      default: "retracted",
      options: [
        { value: "retracted", label: "후진 (수축)" },
        { value: "extended", label: "전진 (신장)" },
      ],
    },
    { key: "strokeTime", label: "전 행정 시간", type: "number", default: 1, min: 0.2, max: 10, step: 0.1, unit: "초" },
  ],
  symbolId: "pneu.cylinder.double",
  bounds: { x: -40, y: -32, width: 130, height: 57 },
  behavior: { role: "cylinder", headPort: "HEAD", rodPort: "ROD" },
};

export const cylinderSingle: ComponentDefinition = {
  type: "pneu.cylinder.single",
  domain: "pneumatic",
  name: "단동 실린더 (스프링 복귀)",
  category: "공압 · 액추에이터",
  ports: [
    { id: "HEAD", label: "헤드측", kind: "pneumatic", offset: { x: -30, y: 20 }, direction: "down" },
  ],
  propertySchema: [
    labelProperty,
    { key: "strokeTime", label: "전 행정 시간", type: "number", default: 1, min: 0.2, max: 10, step: 0.1, unit: "초" },
  ],
  symbolId: "pneu.cylinder.single",
  bounds: { x: -40, y: -32, width: 130, height: 57 },
  behavior: { role: "cylinder", headPort: "HEAD", singleActing: true },
};

// ---------- 유량 · 논리 밸브 ----------

export const speedController: ComponentDefinition = {
  type: "pneu.speed-controller",
  domain: "pneumatic",
  name: "속도제어밸브 (스로틀+체크)",
  category: "공압 · 유량/논리",
  ports: [
    { id: "A", label: "A", kind: "pneumatic", offset: { x: -30, y: 0 }, direction: "left" },
    { id: "B", label: "B", kind: "pneumatic", offset: { x: 30, y: 0 }, direction: "right" },
  ],
  propertySchema: [
    { key: "openness", label: "교축 개도 (B→A)", type: "number", default: 0.5, min: 0.05, max: 1, step: 0.05 },
  ],
  symbolId: "pneu.speed-controller",
  bounds: { x: -30, y: -25, width: 60, height: 50 },
  behavior: { role: "restrictor", portA: "A", portB: "B" },
};

export const shuttleValve: ComponentDefinition = {
  type: "pneu.shuttle",
  domain: "pneumatic",
  name: "셔틀밸브 (OR)",
  category: "공압 · 유량/논리",
  ports: [
    { id: "X1", label: "X1", kind: "pneumatic", offset: { x: -30, y: 0 }, direction: "left" },
    { id: "X2", label: "X2", kind: "pneumatic", offset: { x: 30, y: 0 }, direction: "right" },
    { id: "A", label: "A", kind: "pneumatic", offset: { x: 0, y: -20 }, direction: "up" },
  ],
  propertySchema: [],
  symbolId: "pneu.shuttle",
  bounds: { x: -30, y: -20, width: 60, height: 32 },
  behavior: { role: "shuttle", inA: "X1", inB: "X2", out: "A" },
};

export const twoPressureValve: ComponentDefinition = {
  type: "pneu.two-pressure",
  domain: "pneumatic",
  name: "2압밸브 (AND)",
  category: "공압 · 유량/논리",
  ports: [
    { id: "X1", label: "X1", kind: "pneumatic", offset: { x: -30, y: 0 }, direction: "left" },
    { id: "X2", label: "X2", kind: "pneumatic", offset: { x: 30, y: 0 }, direction: "right" },
    { id: "A", label: "A", kind: "pneumatic", offset: { x: 0, y: -20 }, direction: "up" },
  ],
  propertySchema: [],
  symbolId: "pneu.two-pressure",
  bounds: { x: -30, y: -20, width: 60, height: 32 },
  behavior: { role: "two-pressure", inA: "X1", inB: "X2", out: "A" },
};

export const quickExhaust: ComponentDefinition = {
  type: "pneu.quick-exhaust",
  domain: "pneumatic",
  name: "급속배기밸브",
  category: "공압 · 유량/논리",
  ports: [
    { id: "P", label: "P", kind: "pneumatic", offset: { x: -30, y: 0 }, direction: "left" },
    { id: "A", label: "A", kind: "pneumatic", offset: { x: 0, y: -20 }, direction: "up" },
    { id: "R", label: "R", kind: "pneumatic", offset: { x: 0, y: 20 }, direction: "down" },
  ],
  propertySchema: [],
  symbolId: "pneu.quick-exhaust",
  bounds: { x: -30, y: -20, width: 60, height: 40 },
  behavior: { role: "quick-exhaust", inP: "P", outA: "A", exhaustR: "R" },
};

export const pneuPressureSwitch: ComponentDefinition = {
  type: "pneu.pressure-switch",
  domain: "pneumatic",
  name: "압력 스위치 (공압)",
  category: "공압 · 유량/논리",
  ports: [
    { id: "T", kind: "electric", offset: { x: 0, y: -20 }, direction: "up" },
    { id: "B", kind: "electric", offset: { x: 0, y: 20 }, direction: "down" },
    { id: "P", label: "P", kind: "pneumatic", offset: { x: -20, y: 10 }, direction: "left" },
  ],
  propertySchema: [
    {
      key: "contactType",
      label: "접점 종류",
      type: "select",
      default: "NO",
      options: [
        { value: "NO", label: "a접점 (NO)" },
        { value: "NC", label: "b접점 (NC)" },
      ],
    },
    { key: "threshold", label: "동작 압력", type: "number", default: 4, min: 0.5, max: 12, step: 0.5, unit: "bar" },
    { key: "name", label: "이름", type: "text", default: "PS1" },
  ],
  symbolId: "elec.pressure-switch",
  bounds: { x: -25, y: -20, width: 50, height: 40 },
  behavior: { role: "elec-contact", portA: "T", portB: "B", source: "pressure", pressurePort: "P" },
};

const allDefinitions = [
  pneumaticSource,
  serviceUnit,
  silencer,
  teeJunction,
  valve32Manual,
  valve32Roller,
  valve52Manual,
  valve52DoublePilot,
  valve52SinglePilot,
  valve32Solenoid,
  valve52Solenoid,
  valve52DoubleSolenoid,
  valve53DoubleSolenoid,
  cylinderDouble,
  cylinderSingle,
  speedController,
  shuttleValve,
  twoPressureValve,
  quickExhaust,
  pneuPressureSwitch,
];

let registered = false;

/** 라이브러리 전체를 레지스트리에 등록. 앱/테스트 시작 시 1회 호출. */
export function registerPneumaticLibrary(): void {
  if (registered) return;
  registered = true;
  for (const def of allDefinitions) registerComponent(def);
}
