import { registerComponent } from "../registry";
import type { ComponentDefinition } from "../types";

/**
 * 유압 부품 라이브러리 — Phase 3.
 * 유체 솔버를 공압과 공유한다. "배기" = 탱크 귀환.
 */

// ---------- 동력원 ----------

export const powerUnit: ComponentDefinition = {
  type: "hyd.power-unit",
  domain: "hydraulic",
  name: "유압 파워유닛 (펌프+탱크+릴리프)",
  category: "유압 · 동력원",
  ports: [
    { id: "P", label: "P", kind: "hydraulic", offset: { x: -10, y: -30 }, direction: "up" },
    { id: "T", label: "T", kind: "hydraulic", offset: { x: 20, y: -30 }, direction: "up" },
  ],
  propertySchema: [
    { key: "pressure", label: "설정 압력", type: "number", default: 40, min: 5, max: 300, step: 5, unit: "bar" },
  ],
  symbolId: "hyd.power-unit",
  bounds: { x: -35, y: -30, width: 70, height: 60 },
  behavior: { role: "hydraulic-power-unit", pressurePort: "P", tankPort: "T" },
};

export const tank: ComponentDefinition = {
  type: "hyd.tank",
  domain: "hydraulic",
  name: "탱크 (귀환)",
  category: "유압 · 동력원",
  ports: [{ id: "T", kind: "hydraulic", offset: { x: 0, y: -20 }, direction: "up" }],
  propertySchema: [],
  symbolId: "hyd.tank",
  bounds: { x: -15, y: -20, width: 30, height: 36 },
  behavior: { role: "exhaust", port: "T" },
};

export const hydTee: ComponentDefinition = {
  type: "hyd.tee",
  domain: "hydraulic",
  name: "T 분기 (유압)",
  category: "유압 · 동력원",
  ports: [
    { id: "1", kind: "hydraulic", offset: { x: -20, y: 0 }, direction: "left" },
    { id: "2", kind: "hydraulic", offset: { x: 20, y: 0 }, direction: "right" },
    { id: "3", kind: "hydraulic", offset: { x: 0, y: 20 }, direction: "down" },
  ],
  propertySchema: [],
  symbolId: "pneu.tee",
  bounds: { x: -20, y: -10, width: 40, height: 30 },
  behavior: { role: "conduit", connections: [["1", "2"], ["1", "3"]] },
};

export const pressureGauge: ComponentDefinition = {
  type: "hyd.gauge",
  domain: "hydraulic",
  name: "압력계",
  category: "유압 · 동력원",
  ports: [{ id: "P", kind: "hydraulic", offset: { x: 0, y: 20 }, direction: "down" }],
  propertySchema: [],
  symbolId: "hyd.gauge",
  bounds: { x: -15, y: -15, width: 30, height: 36 },
  behavior: { role: "conduit", connections: [] },
};

export const reliefValve: ComponentDefinition = {
  type: "hyd.relief",
  domain: "hydraulic",
  name: "릴리프 밸브",
  category: "유압 · 동력원",
  ports: [
    { id: "P", label: "P", kind: "hydraulic", offset: { x: 0, y: -30 }, direction: "up" },
    { id: "T", label: "T", kind: "hydraulic", offset: { x: 0, y: 30 }, direction: "down" },
  ],
  propertySchema: [
    { key: "pressure", label: "설정 압력", type: "number", default: 50, min: 5, max: 300, step: 5, unit: "bar" },
  ],
  symbolId: "hyd.relief",
  bounds: { x: -25, y: -30, width: 56, height: 60 },
  // 상태 기반 모델에서는 정상 상태에서 흐름 없음 (안전 요소로 작도만)
  behavior: { role: "conduit", connections: [] },
};

// ---------- 방향제어밸브 ----------

/** 4포트 배치 (60폭 박스 기준): 상단 A(+20) B(+40), 하단 P(+20) T(+40) */
const valve4Ports = (boxLeft: number) => [
  { id: "A", label: "A", kind: "hydraulic" as const, offset: { x: boxLeft + 20, y: -30 }, direction: "up" as const },
  { id: "B", label: "B", kind: "hydraulic" as const, offset: { x: boxLeft + 40, y: -30 }, direction: "up" as const },
  { id: "P", label: "P", kind: "hydraulic" as const, offset: { x: boxLeft + 20, y: 30 }, direction: "down" as const },
  { id: "T", label: "T", kind: "hydraulic" as const, offset: { x: boxLeft + 40, y: 30 }, direction: "down" as const },
];

export const valve42Lever: ComponentDefinition = {
  type: "hyd.valve.4-2-lever",
  domain: "hydraulic",
  name: "4/2 밸브 (수동 레버)",
  category: "유압 · 방향제어밸브",
  ports: valve4Ports(0),
  propertySchema: [
    {
      key: "actuation",
      label: "조작 방식",
      type: "select",
      default: "lever",
      options: [
        { value: "lever", label: "레버 (토글)" },
        { value: "pushbutton", label: "푸시버튼 (누르는 동안)" },
      ],
    },
  ],
  symbolId: "hyd.valve.4-2-lever",
  bounds: { x: -82, y: -30, width: 166, height: 60 },
  behavior: {
    role: "valve",
    positions: [
      { connections: [["P", "A"], ["B", "T"]] },
      { connections: [["P", "B"], ["A", "T"]] },
    ],
    initial: 1,
    left: { kind: "manual" },
    right: { kind: "spring" },
    exhaustPorts: [],
  },
};

export const valve43ClosedSolenoid: ComponentDefinition = {
  type: "hyd.valve.4-3-closed-solenoid",
  domain: "hydraulic",
  name: "4/3 밸브 (클로즈드 센터, 양측 솔레노이드)",
  category: "유압 · 방향제어밸브",
  // 포트는 중앙 박스(-30..30)에 접속
  ports: valve4Ports(-30),
  propertySchema: [
    { key: "solenoidLeft", label: "왼쪽 솔레노이드 (→P-A)", type: "text", default: "Y1" },
    { key: "solenoidRight", label: "오른쪽 솔레노이드 (→P-B)", type: "text", default: "Y2" },
  ],
  symbolId: "hyd.valve.4-3-closed-solenoid",
  bounds: { x: -108, y: -30, width: 216, height: 60 },
  behavior: {
    role: "valve",
    positions: [
      { connections: [["P", "A"], ["B", "T"]] },
      { connections: [] }, // 클로즈드 센터: 실린더 위치 유지
      { connections: [["P", "B"], ["A", "T"]] },
    ],
    initial: 1,
    left: { kind: "solenoid", solenoidProp: "solenoidLeft" },
    right: { kind: "solenoid", solenoidProp: "solenoidRight" },
    exhaustPorts: [],
    springCentered: true,
  },
};

export const valve43TandemSolenoid: ComponentDefinition = {
  type: "hyd.valve.4-3-tandem-solenoid",
  domain: "hydraulic",
  name: "4/3 밸브 (탠덤 센터, 양측 솔레노이드)",
  category: "유압 · 방향제어밸브",
  ports: valve4Ports(-30),
  propertySchema: [
    { key: "solenoidLeft", label: "왼쪽 솔레노이드 (→P-A)", type: "text", default: "Y1" },
    { key: "solenoidRight", label: "오른쪽 솔레노이드 (→P-B)", type: "text", default: "Y2" },
  ],
  symbolId: "hyd.valve.4-3-tandem-solenoid",
  bounds: { x: -108, y: -30, width: 216, height: 60 },
  behavior: {
    role: "valve",
    positions: [
      { connections: [["P", "A"], ["B", "T"]] },
      { connections: [["P", "T"]] }, // 탠덤 센터: 펌프 무부하, 실린더 유지
      { connections: [["P", "B"], ["A", "T"]] },
    ],
    initial: 1,
    left: { kind: "solenoid", solenoidProp: "solenoidLeft" },
    right: { kind: "solenoid", solenoidProp: "solenoidRight" },
    exhaustPorts: [],
    springCentered: true,
  },
};

export const reducingValve: ComponentDefinition = {
  type: "hyd.reducing",
  domain: "hydraulic",
  name: "감압밸브",
  category: "유압 · 체크/유량",
  ports: [
    { id: "P", label: "P", kind: "hydraulic", offset: { x: -30, y: 0 }, direction: "left" },
    { id: "A", label: "A", kind: "hydraulic", offset: { x: 30, y: 0 }, direction: "right" },
  ],
  propertySchema: [
    { key: "pressure", label: "감압 설정", type: "number", default: 20, min: 1, max: 300, step: 1, unit: "bar" },
  ],
  symbolId: "hyd.reducing",
  bounds: { x: -30, y: -25, width: 60, height: 56 },
  behavior: { role: "reducer", portIn: "P", portOut: "A" },
};

export const hydPressureSwitch: ComponentDefinition = {
  type: "hyd.pressure-switch",
  domain: "hydraulic",
  name: "압력 스위치 (유압)",
  category: "유압 · 체크/유량",
  ports: [
    { id: "T", kind: "electric", offset: { x: 0, y: -20 }, direction: "up" },
    { id: "B", kind: "electric", offset: { x: 0, y: 20 }, direction: "down" },
    { id: "P", label: "P", kind: "hydraulic", offset: { x: -20, y: 10 }, direction: "left" },
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
    { key: "threshold", label: "동작 압력", type: "number", default: 15, min: 1, max: 300, step: 1, unit: "bar" },
    { key: "name", label: "이름", type: "text", default: "PS1" },
  ],
  symbolId: "elec.pressure-switch",
  bounds: { x: -25, y: -20, width: 50, height: 40 },
  behavior: { role: "elec-contact", portA: "T", portB: "B", source: "pressure", pressurePort: "P" },
};

// ---------- 체크 · 유량 ----------

export const checkValve: ComponentDefinition = {
  type: "hyd.check",
  domain: "hydraulic",
  name: "체크밸브",
  category: "유압 · 체크/유량",
  ports: [
    { id: "A", label: "A", kind: "hydraulic", offset: { x: -30, y: 0 }, direction: "left" },
    { id: "B", label: "B", kind: "hydraulic", offset: { x: 30, y: 0 }, direction: "right" },
  ],
  propertySchema: [],
  symbolId: "hyd.check",
  bounds: { x: -30, y: -15, width: 60, height: 30 },
  behavior: { role: "check-valve", portA: "A", portB: "B" },
};

export const pilotCheckValve: ComponentDefinition = {
  type: "hyd.pilot-check",
  domain: "hydraulic",
  name: "파일럿 조작 체크밸브",
  category: "유압 · 체크/유량",
  ports: [
    { id: "A", label: "A", kind: "hydraulic", offset: { x: -30, y: 0 }, direction: "left" },
    { id: "B", label: "B", kind: "hydraulic", offset: { x: 30, y: 0 }, direction: "right" },
    { id: "X", label: "X", kind: "hydraulic", offset: { x: 0, y: 30 }, direction: "down" },
  ],
  propertySchema: [],
  symbolId: "hyd.pilot-check",
  bounds: { x: -30, y: -15, width: 60, height: 46 },
  behavior: { role: "pilot-check", portA: "A", portB: "B", pilotPort: "X" },
};

export const flowControl: ComponentDefinition = {
  type: "hyd.flow-control",
  domain: "hydraulic",
  name: "유량조절밸브 (체크 내장)",
  category: "유압 · 체크/유량",
  ports: [
    { id: "A", label: "A", kind: "hydraulic", offset: { x: -30, y: 0 }, direction: "left" },
    { id: "B", label: "B", kind: "hydraulic", offset: { x: 30, y: 0 }, direction: "right" },
  ],
  propertySchema: [
    { key: "openness", label: "교축 개도 (B→A)", type: "number", default: 0.5, min: 0.05, max: 1, step: 0.05 },
  ],
  symbolId: "hyd.flow-control",
  bounds: { x: -30, y: -25, width: 60, height: 50 },
  behavior: { role: "restrictor", portA: "A", portB: "B" },
};

// ---------- 액추에이터 ----------

export const hydCylinderDouble: ComponentDefinition = {
  type: "hyd.cylinder.double",
  domain: "hydraulic",
  name: "복동 유압 실린더",
  category: "유압 · 액추에이터",
  ports: [
    { id: "HEAD", label: "헤드측", kind: "hydraulic", offset: { x: -30, y: 20 }, direction: "down" },
    { id: "ROD", label: "로드측", kind: "hydraulic", offset: { x: 20, y: 20 }, direction: "down" },
  ],
  propertySchema: [
    { key: "label", label: "실린더 이름표", type: "text", default: "A" },
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
    { key: "strokeTime", label: "전 행정 시간", type: "number", default: 2, min: 0.2, max: 20, step: 0.1, unit: "초" },
  ],
  symbolId: "hyd.cylinder.double",
  bounds: { x: -40, y: -32, width: 130, height: 57 },
  behavior: { role: "cylinder", headPort: "HEAD", rodPort: "ROD" },
};

export const hydMotor: ComponentDefinition = {
  type: "hyd.motor",
  domain: "hydraulic",
  name: "유압 모터",
  category: "유압 · 액추에이터",
  ports: [
    { id: "A", label: "A", kind: "hydraulic", offset: { x: -10, y: 30 }, direction: "down" },
    { id: "B", label: "B", kind: "hydraulic", offset: { x: 10, y: 30 }, direction: "down" },
  ],
  propertySchema: [
    { key: "speed", label: "회전 속도", type: "number", default: 1, min: 0.1, max: 10, step: 0.1, unit: "rev/s" },
  ],
  symbolId: "hyd.motor",
  bounds: { x: -20, y: -20, width: 40, height: 50 },
  behavior: { role: "motor", portA: "A", portB: "B" },
};

const allDefinitions = [
  powerUnit,
  tank,
  hydTee,
  pressureGauge,
  reliefValve,
  valve42Lever,
  valve43ClosedSolenoid,
  valve43TandemSolenoid,
  checkValve,
  pilotCheckValve,
  flowControl,
  reducingValve,
  hydPressureSwitch,
  hydCylinderDouble,
  hydMotor,
];

let registered = false;

export function registerHydraulicLibrary(): void {
  if (registered) return;
  registered = true;
  for (const def of allDefinitions) registerComponent(def);
}
