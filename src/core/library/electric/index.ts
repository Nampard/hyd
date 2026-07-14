import { registerComponent } from "../registry";
import type { ComponentDefinition, PropertyField } from "../types";

/**
 * 전기 (시퀀스 제어) 부품 라이브러리 — Phase 2.
 * 2단자 부품은 세로 배치 기준: T(위, 0,-20) → B(아래, 0,20).
 * 사다리형 회로는 24V 단자를 위, 0V 단자를 아래에 두고 세로로 배선한다.
 */

const twoPorts = [
  { id: "T", kind: "electric" as const, offset: { x: 0, y: -20 }, direction: "up" as const },
  { id: "B", kind: "electric" as const, offset: { x: 0, y: 20 }, direction: "down" as const },
];

const contactTypeProperty: PropertyField = {
  key: "contactType",
  label: "접점 종류",
  type: "select",
  default: "NO",
  options: [
    { value: "NO", label: "a접점 (NO)" },
    { value: "NC", label: "b접점 (NC)" },
  ],
};

// ---------- 전원 ----------

export const supply24V: ComponentDefinition = {
  type: "elec.supply-24v",
  domain: "electric",
  name: "전원 +24V",
  category: "전기 · 전원",
  ports: [{ id: "P", kind: "electric", offset: { x: 0, y: 20 }, direction: "down" }],
  propertySchema: [],
  symbolId: "elec.supply-24v",
  bounds: { x: -25, y: -12, width: 50, height: 32 },
  behavior: { role: "elec-supply", polarity: "positive", port: "P" },
};

export const supply0V: ComponentDefinition = {
  type: "elec.supply-0v",
  domain: "electric",
  name: "전원 0V",
  category: "전기 · 전원",
  ports: [{ id: "P", kind: "electric", offset: { x: 0, y: -20 }, direction: "up" }],
  propertySchema: [],
  symbolId: "elec.supply-0v",
  bounds: { x: -25, y: -20, width: 50, height: 32 },
  behavior: { role: "elec-supply", polarity: "negative", port: "P" },
};

// ---------- 입력 (접점) ----------

export const pushbutton: ComponentDefinition = {
  type: "elec.pushbutton",
  domain: "electric",
  name: "푸시버튼 스위치",
  category: "전기 · 입력",
  ports: twoPorts,
  propertySchema: [
    contactTypeProperty,
    {
      key: "actuation",
      label: "동작",
      type: "select",
      default: "momentary",
      options: [
        { value: "momentary", label: "푸시버튼 (누르는 동안)" },
        { value: "maintained", label: "셀렉터 (토글 유지)" },
      ],
    },
    { key: "name", label: "이름", type: "text", default: "PB1" },
  ],
  symbolId: "elec.pushbutton",
  bounds: { x: -25, y: -20, width: 50, height: 40 },
  behavior: { role: "elec-contact", portA: "T", portB: "B", source: "manual" },
};

export const limitSwitch: ComponentDefinition = {
  type: "elec.limit-switch",
  domain: "electric",
  name: "리밋 스위치",
  category: "전기 · 입력",
  ports: twoPorts,
  propertySchema: [
    contactTypeProperty,
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
    { key: "name", label: "이름", type: "text", default: "S1" },
  ],
  symbolId: "elec.limit-switch",
  bounds: { x: -25, y: -20, width: 50, height: 40 },
  behavior: { role: "elec-contact", portA: "T", portB: "B", source: "limit" },
};

export const relayContact: ComponentDefinition = {
  type: "elec.relay-contact",
  domain: "electric",
  name: "릴레이 접점",
  category: "전기 · 입력",
  ports: twoPorts,
  propertySchema: [
    contactTypeProperty,
    { key: "deviceLabel", label: "릴레이/타이머/카운터 이름", type: "text", default: "K1" },
  ],
  symbolId: "elec.relay-contact",
  bounds: { x: -25, y: -20, width: 50, height: 40 },
  behavior: { role: "elec-contact", portA: "T", portB: "B", source: "device" },
};

// ---------- 출력 (부하) ----------

export const relayCoil: ComponentDefinition = {
  type: "elec.relay-coil",
  domain: "electric",
  name: "릴레이 코일",
  category: "전기 · 출력",
  ports: twoPorts,
  propertySchema: [{ key: "label", label: "이름", type: "text", default: "K1" }],
  symbolId: "elec.relay-coil",
  bounds: { x: -20, y: -20, width: 40, height: 40 },
  behavior: { role: "elec-load", portA: "T", portB: "B", device: "relay" },
};

export const timerRelay: ComponentDefinition = {
  type: "elec.timer",
  domain: "electric",
  name: "타이머 릴레이",
  category: "전기 · 출력",
  ports: twoPorts,
  propertySchema: [
    { key: "label", label: "이름", type: "text", default: "T1" },
    {
      key: "mode",
      label: "동작 모드",
      type: "select",
      default: "on-delay",
      options: [
        { value: "on-delay", label: "온 딜레이 (여자 후 지연 ON)" },
        { value: "off-delay", label: "오프 딜레이 (소자 후 지연 OFF)" },
      ],
    },
    { key: "preset", label: "설정 시간", type: "number", default: 3, min: 0.1, max: 600, step: 0.1, unit: "초" },
  ],
  symbolId: "elec.timer",
  bounds: { x: -20, y: -20, width: 40, height: 40 },
  behavior: { role: "elec-load", portA: "T", portB: "B", device: "timer-on" }, // mode 속성이 엔진에서 재해석
};

export const counter: ComponentDefinition = {
  type: "elec.counter",
  domain: "electric",
  name: "카운터",
  category: "전기 · 출력",
  ports: twoPorts,
  propertySchema: [
    { key: "label", label: "이름", type: "text", default: "C1" },
    { key: "preset", label: "설정 횟수", type: "number", default: 3, min: 1, max: 9999, step: 1, unit: "회" },
  ],
  symbolId: "elec.counter",
  bounds: { x: -20, y: -20, width: 40, height: 40 },
  behavior: { role: "elec-load", portA: "T", portB: "B", device: "counter" },
};

export const counterReset: ComponentDefinition = {
  type: "elec.counter-reset",
  domain: "electric",
  name: "카운터 리셋 코일",
  category: "전기 · 출력",
  ports: twoPorts,
  propertySchema: [{ key: "label", label: "대상 카운터 이름", type: "text", default: "C1" }],
  symbolId: "elec.counter-reset",
  bounds: { x: -20, y: -20, width: 40, height: 40 },
  behavior: { role: "elec-load", portA: "T", portB: "B", device: "counter-reset" },
};

export const solenoid: ComponentDefinition = {
  type: "elec.solenoid",
  domain: "electric",
  name: "솔레노이드",
  category: "전기 · 출력",
  ports: twoPorts,
  propertySchema: [{ key: "label", label: "이름 (밸브와 매칭)", type: "text", default: "Y1" }],
  symbolId: "elec.solenoid",
  bounds: { x: -20, y: -20, width: 40, height: 40 },
  behavior: { role: "elec-load", portA: "T", portB: "B", device: "solenoid" },
};

export const lamp: ComponentDefinition = {
  type: "elec.lamp",
  domain: "electric",
  name: "표시 램프",
  category: "전기 · 출력",
  ports: twoPorts,
  propertySchema: [{ key: "name", label: "이름", type: "text", default: "L1" }],
  symbolId: "elec.lamp",
  bounds: { x: -20, y: -20, width: 40, height: 40 },
  behavior: { role: "elec-load", portA: "T", portB: "B", device: "lamp" },
};

export const buzzer: ComponentDefinition = {
  type: "elec.buzzer",
  domain: "electric",
  name: "부저 (표시형 — 소리 없음)",
  category: "전기 · 출력",
  ports: twoPorts,
  propertySchema: [{ key: "name", label: "이름", type: "text", default: "BZ1" }],
  symbolId: "elec.buzzer",
  bounds: { x: -20, y: -20, width: 40, height: 40 },
  behavior: { role: "elec-load", portA: "T", portB: "B", device: "buzzer" },
};

const allDefinitions = [
  supply24V,
  supply0V,
  pushbutton,
  limitSwitch,
  relayContact,
  relayCoil,
  timerRelay,
  counter,
  counterReset,
  solenoid,
  lamp,
  buzzer,
];

let registered = false;

export function registerElectricLibrary(): void {
  if (registered) return;
  registered = true;
  for (const def of allDefinitions) registerComponent(def);
}
