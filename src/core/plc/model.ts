/**
 * PLC 래더 모델 — XG5000 스타일 셀 그리드 (ARCHITECTURE 4.5).
 *
 * 렁은 rows × COLS 셀 그리드. 전류는 왼쪽 레일에서 오른쪽으로 흐른다.
 * 출력 요소(코일/SET/RST/TON/CTU)는 마지막 열에만 놓인다.
 * vlinkDown: 셀 오른쪽 경계에서 아랫줄로 수직 연결 (OR 분기).
 *
 * 디바이스 표기 (XG5000 관례 단순화):
 *  P0..P15 입력, P20..P35 출력 (ioMap으로 부품과 매핑), M0.. 내부 릴레이,
 *  T0.. 타이머 (TON, 초 단위 preset), C0.. 카운터 (CTU)
 */

export const LADDER_COLS = 8; // 논리 7열 + 출력 1열
export const OUTPUT_COL = LADDER_COLS - 1;

export type LadderCellKind =
  | "no" // a접점
  | "nc" // b접점
  | "hline" // 가로 연결선
  | "coil" // OUT
  | "set"
  | "rst"
  | "ton" // 온딜레이 타이머
  | "toff" // 오프딜레이 타이머
  | "ctu" // 업 카운터
  | "ctd"; // 다운 카운터

export interface LadderCell {
  kind: LadderCellKind;
  /** 접점/코일/기능블록의 디바이스 (예: "P0", "M0", "T0", "C1") */
  device?: string;
  /** TON: 초, CTU: 횟수 */
  preset?: number;
}

/** 수직 연결: 노드 열 c (0..COLS)에서 행 r과 r+1을 잇는다 (OR 분기) */
export interface VLink {
  r: number;
  c: number;
}

export interface LadderRung {
  id: string;
  /** rows × LADDER_COLS. null = 빈 셀 (도통 없음) */
  cells: (LadderCell | null)[][];
  vlinks: VLink[];
}

export interface LadderProgram {
  rungs: LadderRung[];
}

/** P 디바이스와 회로 부품의 매핑 */
export interface IoEntry {
  device: string; // "P0" | "P20" ...
  direction: "input" | "output";
  componentId: string;
}

let rungCounter = 0;

export function createRung(rows = 1): LadderRung {
  rungCounter += 1;
  return {
    id: `rung_${Date.now().toString(36)}${rungCounter.toString(36)}`,
    cells: Array.from({ length: rows }, () => new Array<LadderCell | null>(LADDER_COLS).fill(null)),
    vlinks: [],
  };
}

export function createEmptyProgram(): LadderProgram {
  return { rungs: [createRung()] };
}

/** 출력 전용 요소인지 */
export function isOutputKind(kind: LadderCellKind): boolean {
  return ["coil", "set", "rst", "ton", "toff", "ctu", "ctd"].includes(kind);
}

/** 접점(도통 판정) 요소인지 */
export function isContactKind(kind: LadderCellKind): kind is "no" | "nc" {
  return kind === "no" || kind === "nc";
}
