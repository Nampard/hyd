import type { CircuitDocument, Point, Rotation } from "./types";
import { CURRENT_SCHEMA_VERSION } from "./types";
import { hasComponentDefinition, getComponentDefinition } from "../library/registry";
import { summarizeLearningActivity } from "./learning-activity";
import { LADDER_COLS, isOutputKind, type LadderCellKind } from "../plc/model";
import { validateIoMap } from "./validate-iomap";

export interface ParseResult {
  ok: boolean;
  document?: CircuitDocument;
  error?: string;
}

export function serializeDocument(doc: CircuitDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * 저장 직전 문서 정규화 — 모든 저장 경로(파일 다운로드·브라우저 저장)의 단일 관문 (review P1).
 * 학습 활동 설명: 공백 trim → 비어 있으면 자동 초안 생성 → 500자 상한으로 방어적 절단.
 * 이로써 "저장 성공 = 재열기 성공"을 보장한다 (parseDocument가 >500자를 거부하므로).
 * 부품이 없는 빈 문서는 요약이 빈 문자열이라 설명도 비운다(설명할 회로가 없음).
 */
export function prepareDocumentForPersistence(doc: CircuitDocument): CircuitDocument {
  const trimmed = (doc.meta.learningActivity ?? "").trim();
  const activity = (trimmed || summarizeLearningActivity(doc)).slice(0, MAX_LEARNING_ACTIVITY);
  if (activity === (doc.meta.learningActivity ?? "")) return doc; // 변경 없음 — 동일 참조 유지
  return { ...doc, meta: { ...doc.meta, learningActivity: activity } };
}

/**
 * JSON 문자열을 문서로 파싱한다 (외부 경계 — codex-review H1).
 * 구조 전체(부품 타입·ID·배선 참조와 kind 일치·PLC·ioMap·equipmentLayout)를 검증하고
 * 스키마 버전 마이그레이션을 수행한다. 실패 시 예외 대신 error 메시지를 반환한다.
 */
/** 파일 크기 상한 (5MB, UTF-8 byte 기준) — 조작된 초대형 문서로 인한 멈춤 방지 (review-2 P1) */
export const MAX_JSON_BYTES = 5 * 1024 * 1024;
/** 구조 복잡도 상한 */
const LIMITS = { components: 2000, wires: 4000, waypoints: 128, rungs: 200, rows: 32, ioMap: 512 };
/** 이름표·디바이스 등 문자열 필드 길이 상한 */
const MAX_STRING = 200;
/** 학습 활동 설명 길이 상한 (Phase 12) — 제목보다 긴 문장을 허용 */
export const MAX_LEARNING_ACTIVITY = 500;

export function parseDocument(json: string): ParseResult {
  // UTF-16 code unit 수는 UTF-8 byte 수의 하한이므로 빠른 선별에 쓰고,
  // 초과 가능 구간(비ASCII 포함 시 최대 3배)은 byte 수로 정확히 판정 (review-3 P1)
  if (
    json.length > MAX_JSON_BYTES ||
    (json.length * 3 > MAX_JSON_BYTES && new TextEncoder().encode(json).length > MAX_JSON_BYTES)
  ) {
    return { ok: false, error: "파일이 너무 큽니다 (5MB 초과)." };
  }
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

  // 허용된 키만으로 문서·메타를 재구성한다 — 조작된 JSON의 숨은 필드
  // (meta.studentName 같은 미등록 개인정보 키, 최상위 임의 키)를 제거한다 (review P1)
  return { ok: true, document: reconstructDocument(migrated) };
}

/** 검증을 통과한 객체에서 알려진 키만 추려 CircuitDocument를 재구성 (미등록 키 제거) */
function reconstructDocument(doc: Record<string, unknown>): CircuitDocument {
  const meta = doc.meta as Record<string, unknown>;
  const cleanMeta: CircuitDocument["meta"] = {
    title: meta.title as string,
    createdAt: (meta.createdAt as string) ?? new Date().toISOString(),
  };
  if (typeof meta.description === "string") cleanMeta.description = meta.description;
  if (typeof meta.learningActivity === "string") cleanMeta.learningActivity = meta.learningActivity;

  const result: CircuitDocument = {
    schemaVersion: doc.schemaVersion as number,
    meta: cleanMeta,
    components: doc.components as CircuitDocument["components"],
    wires: doc.wires as CircuitDocument["wires"],
  };
  if (doc.plcProgram !== undefined) result.plcProgram = doc.plcProgram as CircuitDocument["plcProgram"];
  if (doc.ioMap !== undefined) {
    // 항목 단위로 알려진 키만 추려 재조립 — 항목 안의 미등록 키가 저장 파일로
    // 새어 나가지 않게 한다 (meta 키 재조립과 같은 원칙, v4에서 강화)
    result.ioMap = (doc.ioMap as Record<string, unknown>[]).map((entry) => {
      const clean: NonNullable<CircuitDocument["ioMap"]>[number] = {
        device: entry.device as string,
        direction: entry.direction as "input" | "output",
        componentId: entry.componentId as string,
      };
      if (typeof entry.channel === "string") clean.channel = entry.channel;
      return clean;
    });
  }
  if (doc.equipmentLayout !== undefined) {
    result.equipmentLayout = doc.equipmentLayout as CircuitDocument["equipmentLayout"];
  }
  return result;
}

/** 문서 전체 구조 검증. 문제가 있으면 한국어 오류 메시지, 없으면 null */
function validateShape(doc: Record<string, unknown>): string | null {
  const meta = doc.meta;
  if (!isRecord(meta) || typeof meta.title !== "string") {
    return "meta.title이 없습니다.";
  }
  if (typeof meta.title === "string" && meta.title.length > MAX_STRING) {
    return "문서 제목이 너무 깁니다.";
  }
  if (meta.learningActivity !== undefined) {
    if (typeof meta.learningActivity !== "string") {
      return "meta.learningActivity가 문자열이 아닙니다.";
    }
    if (meta.learningActivity.length > MAX_LEARNING_ACTIVITY) {
      return "학습 활동 설명이 너무 깁니다.";
    }
  }
  if (!Array.isArray(doc.components) || !Array.isArray(doc.wires)) {
    return "components/wires 목록이 없습니다.";
  }
  if (doc.components.length > LIMITS.components) return "부품 수가 상한(2000개)을 넘습니다.";
  if (doc.wires.length > LIMITS.wires) return "배선 수가 상한(4000개)을 넘습니다.";

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
    const def = getComponentDefinition(comp.type);
    // propertySchema 기반 속성 검증 — 타입 불일치·NaN·범위 이탈을 거부하고,
    // 누락 필드는 기본값으로 채운다 (review-2 P0: strokeTime:"invalid" 등)
    const propError = validateProperties(comp.properties, def.propertySchema, comp.id);
    if (propError) return propError;
    for (const port of def.ports) {
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
    if (
      !Array.isArray(wire.waypoints) ||
      wire.waypoints.length > LIMITS.waypoints ||
      !wire.waypoints.every(isPoint)
    ) {
      return `배선 경유점이 잘못되었습니다: ${wire.id}`;
    }
  }

  // --- PLC 프로그램 ---
  if (doc.plcProgram !== undefined) {
    const program = doc.plcProgram;
    if (!isRecord(program) || !Array.isArray(program.rungs)) {
      return "plcProgram 형식이 잘못되었습니다.";
    }
    if (program.rungs.length > LIMITS.rungs) return "PLC 렁 수가 상한(200개)을 넘습니다.";
    const validKinds: LadderCellKind[] = ["no", "nc", "ne", "hline", "coil", "set", "rst", "ton", "ctu", "toff", "ctd"];
    const timerCounterKinds = new Set<string>(["ton", "toff", "ctu", "ctd"]);
    const rungIds = new Set<string>();
    for (const rung of program.rungs) {
      if (!isRecord(rung) || typeof rung.id !== "string" || !Array.isArray(rung.cells)) {
        return "PLC 렁 형식이 잘못되었습니다.";
      }
      if (rungIds.has(rung.id)) return `PLC 렁 id가 중복되었습니다: ${rung.id}`;
      rungIds.add(rung.id);
      // 빈 렁(cells: [])은 스캐너에서 예외를 던진다 — 최소 1행 필요 (review-2 P0)
      if (rung.cells.length === 0 || rung.cells.length > LIMITS.rows) {
        return `PLC 렁 행 수가 잘못되었습니다: ${rung.id}`;
      }
      for (let r = 0; r < rung.cells.length; r++) {
        const row = rung.cells[r];
        if (!Array.isArray(row) || row.length !== LADDER_COLS) {
          return `PLC 렁 행 폭이 잘못되었습니다: ${rung.id}`;
        }
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (cell === null) continue;
          if (!isRecord(cell) || !validKinds.includes(cell.kind as LadderCellKind)) {
            return `PLC 셀 종류가 잘못되었습니다: ${rung.id}`;
          }
          if (cell.kind !== "hline") {
            // 디바이스 문법: P/M/T/C + 숫자 (XG5000 스타일 bit 디바이스).
            // D는 word 디바이스라 bit 논리 범위 밖 — 허용하면 교육 개념 오류 (codex-review-3 P0)
            // P/M은 비트 어드레스라 마지막 자리 16진(A~F) 허용 — XG5000 규칙·수업자료와
            // 일치 (P0000A 등, Phase 14-3). T/C는 10진 번호만.
            // _T1S/_T2S: 점멸 특수릴레이 (1초/2초 클록 — 스캐너 내장, Phase 14-6)
            if (
              typeof cell.device !== "string" ||
              !/^([PM][0-9]{0,4}[0-9A-F]|[TC][0-9]{1,5}|_T[12]S)$/.test(cell.device)
            ) {
              return `PLC 셀 디바이스 표기가 잘못되었습니다: ${rung.id} (${String(cell.device)})`;
            }
          }
          if (timerCounterKinds.has(cell.kind as string)) {
            const preset = cell.preset;
            if (typeof preset !== "number" || !Number.isFinite(preset) || preset < 0 || preset > 1e6) {
              return `PLC 타이머/카운터 설정값이 잘못되었습니다: ${rung.id}`;
            }
          }
          // 출력 요소는 마지막 열에만 — 다른 위치는 스캐너 의미가 정의되지 않음
          if (isOutputKind(cell.kind as LadderCellKind) && c !== LADDER_COLS - 1) {
            return `PLC 출력 요소는 마지막 열에만 놓을 수 있습니다: ${rung.id}`;
          }
          // 특수릴레이(_T1S/_T2S)는 스캐너가 매 스캔 생성하는 읽기 전용 클록 —
          // 출력 요소로 쓰면 사용자 기록값이 클록을 덮어 오동작한다 (codex-review P2-1)
          if (
            isOutputKind(cell.kind as LadderCellKind) &&
            typeof cell.device === "string" &&
            /^_T[12]S$/.test(cell.device)
          ) {
            return `PLC 특수릴레이(_T1S/_T2S)는 접점에서만 쓸 수 있습니다: ${rung.id}`;
          }
        }
      }
      // vlinks: [{r, c}] — null 항목·범위 밖·마지막 행(아래 행 없음)은 거부 (review-2 P0)
      if (!Array.isArray(rung.vlinks)) return `PLC 렁에 vlinks가 없습니다: ${rung.id}`;
      for (const v of rung.vlinks) {
        if (
          !isRecord(v) ||
          !Number.isInteger(v.r) ||
          !Number.isInteger(v.c) ||
          (v.r as number) < 0 ||
          (v.r as number) >= rung.cells.length - 1 ||
          (v.c as number) < 0 ||
          (v.c as number) > LADDER_COLS
        ) {
          return `PLC 세로 연결(vlink)이 잘못되었습니다: ${rung.id}`;
        }
      }
    }
  }

  // --- ioMap (검증은 validate-iomap 모듈로 분리 — codex-review P2-8) ---
  if (doc.ioMap !== undefined) {
    const typeById = new Map(
      (doc.components as Record<string, unknown>[]).map((c) => [c.id as string, c.type as string]),
    );
    const ioMapError = validateIoMap(doc.ioMap, componentIds, typeById);
    if (ioMapError) return ioMapError;
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

/**
 * propertySchema 기반 부품 속성 검증·정규화.
 * 누락 필드는 기본값으로 채우고(구버전 문서 호환), 타입 불일치·NaN·범위 이탈은 거부한다.
 */
function validateProperties(
  props: Record<string, unknown>,
  schema: import("../library/types").PropertyField[],
  compId: string,
): string | null {
  for (const field of schema) {
    const value = props[field.key];
    if (value === undefined) {
      props[field.key] = field.default; // 이후 버전에서 추가된 속성 — 기본값으로 채움
      continue;
    }
    switch (field.type) {
      case "number": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return `부품 속성 ${field.key}이(가) 숫자가 아닙니다: ${compId}`;
        }
        if (field.min !== undefined && value < field.min) {
          return `부품 속성 ${field.key}이(가) 최솟값(${field.min}) 미만입니다: ${compId}`;
        }
        if (field.max !== undefined && value > field.max) {
          return `부품 속성 ${field.key}이(가) 최댓값(${field.max})을 넘습니다: ${compId}`;
        }
        break;
      }
      case "text":
        if (typeof value !== "string") {
          return `부품 속성 ${field.key}이(가) 문자열이 아닙니다: ${compId}`;
        }
        if (value.length > MAX_STRING) {
          return `부품 속성 ${field.key}이(가) 너무 깁니다: ${compId}`;
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") {
          return `부품 속성 ${field.key}이(가) 불리언이 아닙니다: ${compId}`;
        }
        break;
      case "select":
        if (typeof value !== "string" || !field.options.some((o) => o.value === value)) {
          return `부품 속성 ${field.key} 값이 허용 목록에 없습니다: ${compId}`;
        }
        break;
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
  if (version < 3) doc = migrateV2toV3(doc);
  if (version < 4) doc = migrateV3toV4(doc);
  if (version < 5) doc = migrateV4toV5(doc);
  doc.schemaVersion = CURRENT_SCHEMA_VERSION;
  return doc;
}

/** v2: equipmentLayout(장비 뷰 자유 배치) 선택 필드 도입 — v1 문서는 빈 배치로 시작 */
function migrateV1toV2(doc: Record<string, unknown>): Record<string, unknown> {
  if (doc.equipmentLayout === undefined) doc.equipmentLayout = {};
  return doc;
}

/**
 * v3: meta.learningActivity(학습 활동 설명) 선택 필드 도입 (Phase 12).
 * 값을 채우는 마이그레이션 로직은 없다 — 필드가 optional이라 v2 문서는
 * 빈 값으로 그대로 로드되고, 다음 저장 시 에디터가 자동 초안(summarizeLearningActivity)을
 * 채워 넣는다. 여기서는 버전 표기만 올린다.
 */
function migrateV2toV3(doc: Record<string, unknown>): Record<string, unknown> {
  return doc;
}

/**
 * v4: ioMap 항목에 channel(다채널 부품의 디바이스↔채널 매핑) 선택 필드 도입
 * (Phase 14 자동화설비 스테이션). 필드가 optional이라 v3 문서는 그대로 유효 —
 * 버전 표기만 올린다.
 */
function migrateV3toV4(doc: Record<string, unknown>): Record<string, unknown> {
  return doc;
}

/**
 * v5: 자동화설비 스테이션의 부품 type 리네임 — "auto.mps-station" →
 * "auto.automation-station". "MPS"는 Festo의 교육 플랫폼 등록상표(MPS®)와 겹쳐
 * 내부 식별자에서도 제거했다 (2026-07-19 소유자 결정, codex 상표 검토 반영).
 * 구버전 저장 파일은 열 때 자동 변환된다.
 */
function migrateV4toV5(doc: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(doc.components)) {
    doc.components = doc.components.map((c) =>
      isRecord(c) && c.type === "auto.mps-station"
        ? { ...c, type: "auto.automation-station" }
        : c,
    );
  }
  return doc;
}
