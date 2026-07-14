import type { CircuitDocument, Point, Rotation } from "./types";
import { CURRENT_SCHEMA_VERSION } from "./types";
import { hasComponentDefinition, getComponentDefinition } from "../library/registry";
import { LADDER_COLS, isOutputKind, type LadderCellKind } from "../plc/model";

export interface ParseResult {
  ok: boolean;
  document?: CircuitDocument;
  error?: string;
}

export function serializeDocument(doc: CircuitDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * JSON 문자열을 문서로 파싱한다 (외부 경계 — codex-review H1).
 * 구조 전체(부품 타입·ID·배선 참조와 kind 일치·PLC·ioMap·equipmentLayout)를 검증하고
 * 스키마 버전 마이그레이션을 수행한다. 실패 시 예외 대신 error 메시지를 반환한다.
 */
export function parseDocument(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSON 형식이 아닙니다." };
  }
  if (!isRecord(raw)) {
    return { ok: false, error: "회로 문서 형식이 아닙니다." };
  }
  const obj = raw;

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

  const error = validateShape(migrated);
  if (error) return { ok: false, error };

  return { ok: true, document: migrated as unknown as CircuitDocument };
}

/** 문서 전체 구조 검증. 문제가 있으면 한국어 오류 메시지, 없으면 null */
function validateShape(doc: Record<string, unknown>): string | null {
  const meta = doc.meta;
  if (!isRecord(meta) || typeof meta.title !== "string") {
    return "meta.title이 없습니다.";
  }
  if (!Array.isArray(doc.components) || !Array.isArray(doc.wires)) {
    return "components/wires 목록이 없습니다.";
  }

  // --- 부품 ---
  const componentIds = new Set<string>();
  const portKinds = new Map<string, string>(); // `${componentId}:${portId}` → kind
  for (const comp of doc.components) {
    if (!isRecord(comp)) return "부품 항목이 객체가 아닙니다.";
    if (typeof comp.id !== "string" || comp.id === "") return "부품 id가 없습니다.";
    if (componentIds.has(comp.id)) return `부품 id가 중복되었습니다: ${comp.id}`;
    componentIds.add(comp.id);
    if (typeof comp.type !== "string" || !hasComponentDefinition(comp.type)) {
      return `등록되지 않은 부품 타입입니다: ${String(comp.type)}`;
    }
    if (!isPoint(comp.position)) return `부품 위치가 잘못되었습니다: ${comp.id}`;
    if (![0, 90, 180, 270].includes(comp.rotation as Rotation)) {
      return `부품 회전값이 잘못되었습니다: ${comp.id}`;
    }
    if (!isRecord(comp.properties)) return `부품 속성이 객체가 아닙니다: ${comp.id}`;
    for (const port of getComponentDefinition(comp.type).ports) {
      portKinds.set(`${comp.id}:${port.id}`, port.kind);
    }
  }

  // --- 배선 ---
  const wireIds = new Set<string>();
  for (const wire of doc.wires) {
    if (!isRecord(wire)) return "배선 항목이 객체가 아닙니다.";
    if (typeof wire.id !== "string" || wire.id === "") return "배선 id가 없습니다.";
    if (wireIds.has(wire.id)) return `배선 id가 중복되었습니다: ${wire.id}`;
    wireIds.add(wire.id);
    for (const end of ["from", "to"] as const) {
      const ref = wire[end];
      if (!isRecord(ref) || typeof ref.componentId !== "string" || typeof ref.portId !== "string") {
        return `배선 ${end} 참조가 잘못되었습니다: ${wire.id}`;
      }
      if (!portKinds.has(`${ref.componentId}:${ref.portId}`)) {
        return `배선이 존재하지 않는 포트를 참조합니다: ${wire.id}`;
      }
    }
    const from = wire.from as { componentId: string; portId: string };
    const to = wire.to as { componentId: string; portId: string };
    const kindFrom = portKinds.get(`${from.componentId}:${from.portId}`);
    const kindTo = portKinds.get(`${to.componentId}:${to.portId}`);
    if (kindFrom !== kindTo || wire.kind !== kindFrom) {
      return `배선 종류가 포트와 일치하지 않습니다: ${wire.id}`;
    }
    if (!Array.isArray(wire.waypoints) || !wire.waypoints.every(isPoint)) {
      return `배선 경유점이 잘못되었습니다: ${wire.id}`;
    }
  }

  // --- PLC 프로그램 ---
  if (doc.plcProgram !== undefined) {
    const program = doc.plcProgram;
    if (!isRecord(program) || !Array.isArray(program.rungs)) {
      return "plcProgram 형식이 잘못되었습니다.";
    }
    const validKinds: LadderCellKind[] = ["no", "nc", "hline", "coil", "set", "rst", "ton", "ctu", "toff", "ctd"];
    for (const rung of program.rungs) {
      if (!isRecord(rung) || typeof rung.id !== "string" || !Array.isArray(rung.cells)) {
        return "PLC 렁 형식이 잘못되었습니다.";
      }
      if (!Array.isArray(rung.vlinks)) return `PLC 렁에 vlinks가 없습니다: ${rung.id}`;
      for (const row of rung.cells) {
        if (!Array.isArray(row) || row.length !== LADDER_COLS) {
          return `PLC 렁 행 폭이 잘못되었습니다: ${rung.id}`;
        }
        for (const cell of row) {
          if (cell === null) continue;
          if (!isRecord(cell) || !validKinds.includes(cell.kind as LadderCellKind)) {
            return `PLC 셀 종류가 잘못되었습니다: ${rung.id}`;
          }
          if (cell.kind !== "hline" && typeof cell.device !== "string") {
            return `PLC 셀 디바이스가 없습니다: ${rung.id}`;
          }
          if (isOutputKind(cell.kind as LadderCellKind) && row.indexOf(cell) !== LADDER_COLS - 1) {
            // 출력 요소 위치는 에디터 규칙이므로 여기서는 관용 (스캐너가 무시)
          }
        }
      }
    }
  }

  // --- ioMap ---
  if (doc.ioMap !== undefined) {
    if (!Array.isArray(doc.ioMap)) return "ioMap 형식이 잘못되었습니다.";
    for (const entry of doc.ioMap) {
      if (
        !isRecord(entry) ||
        typeof entry.device !== "string" ||
        (entry.direction !== "input" && entry.direction !== "output") ||
        typeof entry.componentId !== "string"
      ) {
        return "ioMap 항목 형식이 잘못되었습니다.";
      }
      if (entry.componentId !== "" && !componentIds.has(entry.componentId)) {
        return `ioMap이 존재하지 않는 부품을 참조합니다: ${entry.device}`;
      }
    }
  }

  // --- equipmentLayout ---
  if (doc.equipmentLayout !== undefined) {
    if (!isRecord(doc.equipmentLayout)) return "equipmentLayout 형식이 잘못되었습니다.";
    for (const [id, pos] of Object.entries(doc.equipmentLayout)) {
      if (!componentIds.has(id)) return `equipmentLayout이 존재하지 않는 부품을 참조합니다: ${id}`;
      if (!isPoint(pos)) return `equipmentLayout 좌표가 잘못되었습니다: ${id}`;
    }
  }

  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPoint(v: unknown): v is Point {
  return (
    isRecord(v) &&
    typeof v.x === "number" &&
    Number.isFinite(v.x) &&
    typeof v.y === "number" &&
    Number.isFinite(v.y)
  );
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
