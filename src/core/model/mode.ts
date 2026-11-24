import type { CircuitDocument } from "./types";
import { getComponentDefinition, hasComponentDefinition } from "../library/registry";

/**
 * 작업 모드 (Phase 37).
 * - circuit: 공유압 회로 — 기호를 놓고 배선해 공압·유압·전기·PLC 회로를 작도한다.
 * - conveyor: 컨베이어 시스템 — 자동화설비 스테이션 한 대를 PLC 래더로 운전한다.
 * - plc: PLC 래더 — 부품 없이 래더만 쓰고, 화면의 입력 스위치·출력 램프로 확인한다 (Phase 38).
 *
 * 모드는 문서에 따로 저장하지 않고 문서 내용에서 정한다(스키마 변경 없음). 회로 배선 대신
 * PLC ioMap 채널로 물리는 복합 장비(정의에 ioChannels가 있는 부품)가 있으면 컨베이어 문서다 —
 * 부품 이름이 아니라 정의 데이터로 판정하므로 복합 장비가 늘어도 이 함수는 그대로다.
 * 부품이 하나도 없고 래더 프로그램만 있으면 PLC 래더 문서다.
 */
export type AppMode = "circuit" | "conveyor" | "plc";

export function documentMode(doc: CircuitDocument): AppMode {
  const hasChannelEquipment = doc.components.some(
    (c) => hasComponentDefinition(c.type) && (getComponentDefinition(c.type).ioChannels?.length ?? 0) > 0,
  );
  if (hasChannelEquipment) return "conveyor";
  if (doc.components.length === 0 && doc.plcProgram !== undefined) return "plc";
  return "circuit";
}
