import { registerComponent } from "../registry";
import type { ComponentDefinition } from "../types";

/**
 * 자동화설비 기능사(구 생산자동화 기능사) 부품 라이브러리 — Phase 14.
 * MPS 스테이션은 전기·유체 포트가 없는 장비 단위 부품으로, PLC ioMap의
 * channel로 I/O 26점이 물린다 (스키마 v4). 물리는 core/sim/mps-station.ts.
 */

export const mpsStation: ComponentDefinition = {
  type: "auto.mps-station",
  domain: "automation",
  name: "MPS 스테이션 (자동화설비 기능사)",
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
  symbolId: "auto.mps-station",
  bounds: { x: -140, y: -85, width: 280, height: 170 },
  behavior: { role: "mps-station" },
};

export function registerAutomationLibrary(): void {
  registerComponent(mpsStation);
}
