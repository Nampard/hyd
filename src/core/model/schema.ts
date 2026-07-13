import type { CircuitDocument } from "./types";
import { CURRENT_SCHEMA_VERSION } from "./types";

export interface ParseResult {
  ok: boolean;
  document?: CircuitDocument;
  error?: string;
}

export function serializeDocument(doc: CircuitDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * JSON 문자열을 문서로 파싱한다. 구조 검증과 스키마 버전 마이그레이션을 담당.
 * 실패 시 예외 대신 error 메시지를 반환한다 (사용자 파일 입력이므로).
 */
export function parseDocument(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSON 형식이 아닙니다." };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "회로 문서 형식이 아닙니다." };
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.schemaVersion !== "number") {
    return { ok: false, error: "schemaVersion이 없습니다. 회로 파일이 맞는지 확인하세요." };
  }
  if (obj.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `이 파일은 더 새로운 버전(v${obj.schemaVersion})에서 저장되었습니다. 프로그램을 업데이트하세요.`,
    };
  }

  const migrated = migrate(obj);

  if (!Array.isArray(migrated.components) || !Array.isArray(migrated.wires)) {
    return { ok: false, error: "components/wires 목록이 없습니다." };
  }
  const meta = migrated.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta.title !== "string") {
    return { ok: false, error: "meta.title이 없습니다." };
  }

  return { ok: true, document: migrated as unknown as CircuitDocument };
}

/** 구버전 문서를 현재 스키마로 끌어올린다. 버전별 변환을 순차 적용. */
function migrate(obj: Record<string, unknown>): Record<string, unknown> {
  const version = obj.schemaVersion as number;
  let doc = obj;
  if (version < 2) doc = migrateV1toV2(doc);
  doc.schemaVersion = CURRENT_SCHEMA_VERSION;
  return doc;
}

/** v2: equipmentLayout(장비 뷰 자유 배치) 선택 필드 도입 — v1 문서는 빈 배치로 시작 */
function migrateV1toV2(doc: Record<string, unknown>): Record<string, unknown> {
  if (doc.equipmentLayout === undefined) doc.equipmentLayout = {};
  return doc;
}
