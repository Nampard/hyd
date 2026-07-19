/**
 * 자동화설비 기능사(구 생산자동화 기능사) MPS 스테이션 물리 모델 (Phase 14).
 *
 * 설비는 물리만 시뮬레이션한다 — 액추에이터는 PLC 출력 채널에 반응하고
 * 센서는 입력 채널 상태를 만들 뿐, 제어 로직은 전부 사용자의 래더가 담당한다.
 * 물품 흐름(실기 배치도 기준): 매거진 → A실린더(양솔, 5/2 임펄스) 공급 →
 * B실린더+드릴 가공 → C실린더 이송 → 컨베이어 초입에서 용량형/유도형 재질 판별
 * → 포토센서 통과 → D실린더 분기 배출(배출박스) 또는 통과(끝 저장박스).
 * (판별 센서는 컨베이어 초입 — A 공급 직후가 아님. codex-review-phase-14 P2-5)
 *
 * 논리/상태 기반(고정 결정): 이동·가공은 스텝/시간 근사, 정량 해석 없음.
 * React 무관 — Node에서 단독 테스트 가능해야 한다.
 */

export type WorkpieceMaterial = "metal" | "nonmetal";

/** 입력 채널 16점 — 수업자료 I/O 맵의 변수명 그대로 */
export const MPS_INPUT_CHANNELS = [
  "PB1",
  "PB2",
  "PB3",
  "PB4",
  "A후센",
  "A전센",
  "B후센",
  "B전센",
  "C후센",
  "C전센",
  "D후센",
  "D전센",
  "매거진",
  "포토",
  "용량형",
  "유도형",
] as const;

/** 출력 채널 10점 — 수업자료 I/O 맵의 변수명 그대로 */
export const MPS_OUTPUT_CHANNELS = [
  "A전솔",
  "A후솔",
  "B전솔",
  "C전솔",
  "D전솔",
  "드릴모터",
  "컨베이어",
  "적램",
  "황램",
  "녹램",
] as const;

export type MpsInputChannel = (typeof MPS_INPUT_CHANNELS)[number];
export type MpsOutputChannel = (typeof MPS_OUTPUT_CHANNELS)[number];

/** 실린더 전 행정 시간 (초) — 논리 근사용 고정값 */
const STROKE_TIME = 0.5;
/** 컨베이어 전 구간 이동 시간 (초) — 수업자료 래더의 T0018(8s)보다 짧아 벨트 정지 전 낙하 */
const CONVEYOR_TRAVEL = 6;
/** 포토센서 감지 구간 (컨베이어 진행률) — 초입 통과 감지 */
const PHOTO_WINDOW: [number, number] = [0.02, 0.18];
/**
 * 용량형/유도형 판별 센서 감지 구간 — 실기 장비 배치도(S3/S4)처럼 컨베이어
 * 초입부 위에 있다. 포토센서 바로 뒤 구간을 물품이 지나며 재질이 판별된다
 * (공급 위치가 아님 — 2026-07-18 소유자 배치도 참고 정정)
 */
const DETECT_WINDOW: [number, number] = [0.06, 0.24];
/** D실린더 분기 게이트 구간 (컨베이어 진행률) */
const GATE_WINDOW: [number, number] = [0.45, 0.6];
/** 매거진 최대 적재 수 */
export const MPS_MAGAZINE_MAX = 8;

export interface BeltPiece {
  material: WorkpieceMaterial;
  /** 컨베이어 진행률 0(초입)..1(끝 — 저장박스 낙하) */
  progress: number;
}

/** 스테이션 런타임 상태 (엔진이 부품 런타임에 보관, 틱마다 갱신) */
export interface MpsStationState {
  /** 남은 매거진 큐 — 앞이 다음 공급 물품 */
  magazine: WorkpieceMaterial[];
  /** 공급/가공 위치의 물품 (A 공급 후 B 드릴 가공 위치 — 재질 판별은 벨트 초입에서) */
  supply: WorkpieceMaterial | null;
  belt: BeltPiece[];
  /** 컨베이어 끝 저장박스 (낙하 순) */
  store: WorkpieceMaterial[];
  /** D실린더 열 배출박스 (배출 순) */
  eject: WorkpieceMaterial[];
  /** 실린더 위치 0(후진)..1(전진) */
  cyl: { A: number; B: number; C: number; D: number };
  /**
   * A 양솔(5/2 임펄스) 밸브의 스풀 방향 기억: +1 전진, -1 후진, 0 미명령(초기).
   * 마지막으로 받은 단독 솔레노이드 펄스를 유지해, 신호가 사라져도 실린더가
   * 종단까지 진행한다 (양솔 밸브의 메모리 동작 — codex-review P1-1).
   */
  aSpool: -1 | 0 | 1;
  /** 전진 1행정당 1회 이송 래치 (전진 완료 시 true, 절반 이하 복귀 시 해제) */
  aPushed: boolean;
  cPushed: boolean;
  /** 드릴 누적 회전각 (시각용, 도) */
  drillAngle: number;
  /** 벨트 무늬 애니메이션용 누적 (시각용, 초) */
  beltOffset: number;
  /** 조작 패널 푸시버튼 눌림 (장비 뷰 클릭으로 설정, PB1~PB4) */
  pb: [boolean, boolean, boolean, boolean];
  /** 램프 표시 상태 (출력 채널 복사, 시각용) */
  lamps: { red: boolean; yellow: boolean; green: boolean };
}

/** 큐 문자열 파싱 결과 — 유효 토큰 목록 + 형식 오류 여부 (codex-review P2-2) */
export interface WorkpieceQueueParse {
  items: WorkpieceMaterial[];
  /** 인식할 수 없는 토큰이 있었거나 최대 개수를 초과함 */
  error: boolean;
}

/**
 * 매거진 물품 큐 속성 문자열을 검증하며 파싱한다.
 * - 유효 토큰: 금/금속 → metal, 비/비금속 → nonmetal (공백 허용)
 * - 빈 문자열/`,` 만 → 빈 매거진(유효, 오류 아님)
 * - 인식 불가 토큰 또는 MPS_MAGAZINE_MAX 초과 → error=true (빈칸은 무시)
 */
export function parseWorkpieceQueueStrict(value: unknown): WorkpieceQueueParse {
  if (typeof value !== "string") return { items: [], error: value !== undefined };
  const items: WorkpieceMaterial[] = [];
  let error = false;
  const tokens = value.split(",").map((t) => t.trim());
  for (const t of tokens) {
    if (t === "") continue; // 구분자 공백은 허용 (빈 큐 표현)
    if (t === "금" || t === "금속") items.push("metal");
    else if (t === "비" || t === "비금속") items.push("nonmetal");
    else error = true; // 인식 불가 토큰 — 조용히 버리지 않고 오류로 표시
  }
  if (items.length > MPS_MAGAZINE_MAX) {
    return { items: items.slice(0, MPS_MAGAZINE_MAX), error: true };
  }
  return { items, error };
}

/** 유효 토큰만 반환하는 편의 함수 (스프라이트 프리뷰 등 오류 무관 용도) */
export function parseWorkpieceQueue(value: unknown): WorkpieceMaterial[] {
  return parseWorkpieceQueueStrict(value).items;
}

export function createMpsState(properties: Record<string, unknown>): MpsStationState {
  const parsed = parseWorkpieceQueueStrict(properties.workpieces);
  // 속성이 없으면(undefined) 데모용 기본 큐, 명시된 값(빈 큐 포함)은 그대로 존중
  const magazine =
    properties.workpieces === undefined ? parseWorkpieceQueue("금,비,금") : parsed.items;
  return {
    magazine,
    supply: null,
    belt: [],
    store: [],
    eject: [],
    cyl: { A: 0, B: 0, C: 0, D: 0 },
    aSpool: 0,
    aPushed: false,
    cPushed: false,
    drillAngle: 0,
    beltOffset: 0,
    pb: [false, false, false, false],
    lamps: { red: false, yellow: false, green: false },
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * 한 틱 진행. out은 PLC가 강제한 출력 채널 상태 조회 함수.
 * 상태를 제자리에서 갱신한다 (엔진 런타임 관례).
 */
export function stepMpsStation(
  state: MpsStationState,
  out: (channel: MpsOutputChannel) => boolean,
  dt: number,
): void {
  const step = dt / STROKE_TIME;

  // --- 실린더 구동 ---
  // A: 양솔 5/2 임펄스 밸브 — 단독 펄스로 스풀 방향을 기억(aSpool)하고, 신호가
  // 사라져도 그 방향 종단까지 진행한다. 양측 동시 여자는 스풀 유지 (codex-review P1-1)
  const aFwd = out("A전솔");
  const aBwd = out("A후솔");
  if (aFwd && !aBwd) state.aSpool = 1;
  else if (aBwd && !aFwd) state.aSpool = -1;
  if (state.aSpool !== 0) state.cyl.A = clamp01(state.cyl.A + state.aSpool * step);
  // B/C/D: 편솔 스프링 복귀 — 전솔 OFF면 후진
  state.cyl.B = clamp01(state.cyl.B + (out("B전솔") ? step : -step));
  state.cyl.C = clamp01(state.cyl.C + (out("C전솔") ? step : -step));
  state.cyl.D = clamp01(state.cyl.D + (out("D전솔") ? step : -step));

  // --- A 공급: 전진 완료 시 매거진 → 공급 위치 (1행정 1회) ---
  if (state.cyl.A >= 0.99 && !state.aPushed) {
    state.aPushed = true;
    if (state.magazine.length > 0 && state.supply === null) {
      state.supply = state.magazine.shift()!;
    }
  }
  if (state.cyl.A < 0.5) state.aPushed = false;

  // --- C 이송: 전진 완료 시 공급 위치 → 컨베이어 초입 (초입이 비어 있을 때만) ---
  if (state.cyl.C >= 0.99 && !state.cPushed) {
    state.cPushed = true;
    const startClear = !state.belt.some((p) => p.progress < 0.15);
    if (state.supply !== null && startClear) {
      state.belt.push({ material: state.supply, progress: 0 });
      state.supply = null;
    }
  }
  if (state.cyl.C < 0.5) state.cPushed = false;

  // --- 컨베이어 이동 ---
  if (out("컨베이어")) {
    state.beltOffset += dt;
    for (const p of state.belt) p.progress += dt / CONVEYOR_TRAVEL;
  }

  // --- D 게이트 배출 / 끝 낙하 ---
  const remaining: BeltPiece[] = [];
  for (const p of state.belt) {
    if (p.progress >= GATE_WINDOW[0] && p.progress <= GATE_WINDOW[1] && state.cyl.D >= 0.9) {
      state.eject.push(p.material); // D실린더가 밀어 배출박스로
    } else if (p.progress >= 1) {
      state.store.push(p.material); // 컨베이어 끝 저장박스 낙하
    } else {
      remaining.push(p);
    }
  }
  state.belt = remaining;

  // --- 드릴·램프 (시각용) ---
  if (out("드릴모터")) state.drillAngle = (state.drillAngle + 720 * dt) % 360;
  state.lamps = { red: out("적램"), yellow: out("황램"), green: out("녹램") };
}

/** 센서 입력 이미지 — PLC 스캔의 입력 채널 상태 */
export function mpsInputs(state: MpsStationState): Record<MpsInputChannel, boolean> {
  const inPhoto = state.belt.some(
    (p) => p.progress >= PHOTO_WINDOW[0] && p.progress <= PHOTO_WINDOW[1],
  );
  // 판별 센서는 벨트 초입 구간의 물품을 본다 (배치도 S3/S4)
  const inDetect = (m: WorkpieceMaterial | null) =>
    state.belt.some(
      (p) =>
        p.progress >= DETECT_WINDOW[0] &&
        p.progress <= DETECT_WINDOW[1] &&
        (m === null || p.material === m),
    );
  return {
    PB1: state.pb[0],
    PB2: state.pb[1],
    PB3: state.pb[2],
    PB4: state.pb[3],
    A후센: state.cyl.A <= 0.01,
    A전센: state.cyl.A >= 0.99,
    B후센: state.cyl.B <= 0.01,
    B전센: state.cyl.B >= 0.99,
    C후센: state.cyl.C <= 0.01,
    C전센: state.cyl.C >= 0.99,
    D후센: state.cyl.D <= 0.01,
    D전센: state.cyl.D >= 0.99,
    매거진: state.magazine.length > 0,
    포토: inPhoto,
    용량형: inDetect(null),
    유도형: inDetect("metal"),
  };
}
