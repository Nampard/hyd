import { registerComponent } from "../registry";
import type { ComponentDefinition } from "../types";
import { AUTOMATION_IO_CHANNELS } from "./channels";

/**
 * 자동화설비 기능사(구 생산자동화 기능사) 부품 라이브러리 — Phase 14.
 * 자동화설비 스테이션은 전기·유체 포트가 없는 복합 장비로, PLC ioMap의 channel로
 * I/O 26점(입력 16+출력 10)이 물린다 (스키마 v4). 채널 목록은 ioChannels 메타데이터로
 * 선언하고, 실제 물리는 core/sim의 EquipmentAdapter가 담당한다 (부품 type 하드코딩 없이
 * 데이터 주도 확장 — codex-review-phase-14 P1-6).
 */

export const automationStation: ComponentDefinition = {
  type: "auto.automation-station",
  domain: "automation",
  name: "자동화설비 기능사 스테이션 (컨베이어 공정)",
  category: "자동화 · 설비",
  // 포트 없음 — 회로 배선 대신 PLC ioMap channel로 연결한다
  ports: [],
  propertySchema: [
    {
      key: "workpieces",
      label: "매거진 물품 (금/비, 쉼표 구분)",
      type: "text",
      default: "금,비,금",
    },
  ],
  symbolId: "auto.automation-station",
  bounds: { x: -140, y: -85, width: 280, height: 170 },
  behavior: { role: "automation-station" },
  ioChannels: AUTOMATION_IO_CHANNELS,
};

export function registerAutomationLibrary(): void {
  registerComponent(automationStation);
}
