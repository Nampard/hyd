import { getComponentDefinition } from "../library/registry";

/**
 * ioMap(PLC 디바이스 ↔ 부품 채널 매핑) 경계 검증 (Phase 14 — schema.ts에서 분리).
 *
 * 다채널 부품 여부는 부품 type 하드코딩 대신 정의 메타데이터(ComponentDefinition.
 * ioChannels)로 판정한다 — sim 계층을 역참조하지 않는다 (codex-review-phase-14 P1-6).
 */

const MAX_IOMAP = 512;
const MAX_CHANNEL_LEN = 32;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * ioMap 배열을 검증한다. 문제가 있으면 한국어 오류 메시지, 없으면 null.
 * - componentIds: 문서에 존재하는 부품 id 집합 (참조 무결성)
 * - typeById: 부품 id → type (정의 메타데이터 조회용)
 */
export function validateIoMap(
  ioMap: unknown,
  componentIds: Set<string>,
  typeById: Map<string, string>,
): string | null {
  if (!Array.isArray(ioMap)) return "ioMap 형식이 잘못되었습니다.";
  if (ioMap.length > MAX_IOMAP) return "ioMap 항목 수가 상한(512개)을 넘습니다.";

  // 유일성 계약 (codex-review P1-3): 같은 (방향,디바이스)와 (부품,방향,채널)이
  // 두 번 나오면 스캔·매핑이 배열 순서에 의존해 결과가 뒤집힌다. 경계에서 거부.
  const seenDeviceDir = new Set<string>();
  const seenTarget = new Set<string>();

  for (const entry of ioMap) {
    if (
      !isRecord(entry) ||
      typeof entry.device !== "string" ||
      // 마지막 자리 16진 허용 (P0000A 등 — 셀 디바이스 규칙과 동일, Phase 14-3)
      !/^P[0-9]{0,4}[0-9A-F]$/.test(entry.device) ||
      (entry.direction !== "input" && entry.direction !== "output") ||
      typeof entry.componentId !== "string"
    ) {
      return "ioMap 항목 형식이 잘못되었습니다.";
    }
    // channel(v4): 다채널 부품의 채널 이름 — 형태 검증
    if (entry.channel !== undefined) {
      if (
        typeof entry.channel !== "string" ||
        entry.channel === "" ||
        entry.channel.length > MAX_CHANNEL_LEN
      ) {
        return `ioMap 채널 이름이 잘못되었습니다: ${entry.device}`;
      }
    }
    if (entry.componentId !== "" && !componentIds.has(entry.componentId)) {
      return `ioMap이 존재하지 않는 부품을 참조합니다: ${entry.device}`;
    }
    // (방향, 디바이스) 유일 — 같은 P 주소를 같은 방향으로 두 번 매핑 금지
    const deviceDirKey = `${entry.direction}:${entry.device}`;
    if (seenDeviceDir.has(deviceDirKey)) {
      return `ioMap에 같은 디바이스가 중복됩니다: ${entry.device} (${entry.direction})`;
    }
    seenDeviceDir.add(deviceDirKey);
    // (부품, 방향, 채널) 유일 — 같은 채널을 두 디바이스가 겹쳐 매핑 금지
    if (entry.componentId !== "") {
      const targetKey = `${entry.componentId}:${entry.direction}:${entry.channel ?? ""}`;
      if (seenTarget.has(targetKey)) {
        return `ioMap에 같은 대상이 중복됩니다: ${entry.channel ?? entry.device} (${entry.direction})`;
      }
      seenTarget.add(targetKey);
    }
    // 방향↔부품 적합성. 다채널 부품(ioChannels 있음)은 channel 필수 + 방향별
    // 채널 목록에 있어야 하고, 단채널 부품에는 channel을 허용하지 않는다.
    if (entry.componentId !== "") {
      const type = typeById.get(entry.componentId)!;
      const def = getComponentDefinition(type);
      const ioChannels = def.ioChannels;
      const role = def.behavior?.role;
      if (ioChannels) {
        const ok =
          typeof entry.channel === "string" &&
          ioChannels.some((ch) => ch.id === entry.channel && ch.direction === entry.direction);
        if (!ok) {
          return `ioMap ${entry.device}: 복합설비에는 유효한 채널 이름이 필요합니다.`;
        }
      } else if (entry.channel !== undefined) {
        return `ioMap ${entry.device}: 채널은 다채널 부품에만 쓸 수 있습니다.`;
      } else if (entry.direction === "input" && role !== "elec-contact") {
        return `ioMap 입력 ${entry.device}에 접점이 아닌 부품이 연결되었습니다.`;
      } else if (entry.direction === "output" && role !== "elec-load") {
        return `ioMap 출력 ${entry.device}에 부하가 아닌 부품이 연결되었습니다.`;
      }
    }
  }
  return null;
}
