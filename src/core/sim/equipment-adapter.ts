/**
 * 복합설비 어댑터 (Phase 14 — codex-review-phase-14 P1-6 일반화).
 *
 * 다채널 부품(자동화설비 스테이션 등)의 물리를 부품 type별 어댑터로 캡슐화한다.
 * 엔진은 부품 type을 하드코딩하지 않고 이 레지스트리에서 어댑터를 조회해
 * create/step/readInputs/snapshot/setDiscreteInput만 호출한다. 새 복합설비 추가 =
 * ComponentDefinition.ioChannels 선언 + 어댑터 등록으로 끝난다 (엔진 무수정).
 *
 * 상태 타입 S는 어댑터가 소유하는 불투명 값 — 엔진은 형태를 모른 채 보관·전달하고,
 * 해당 스프라이트만 자신의 상태 타입으로 캐스팅해 읽는다.
 */
export interface EquipmentAdapter<S = unknown> {
  /** 초기 상태 생성 (부품 properties 반영) */
  create(properties: Record<string, unknown>): S;
  /** 한 틱 진행 — out(채널)은 PLC가 강제한 출력 채널 상태 */
  step(state: S, out: (channel: string) => boolean, dt: number): void;
  /** 센서 입력 이미지 (입력 채널 → 상태) */
  readInputs(state: S): Record<string, boolean>;
  /** 스냅숏용 깊은 사본 (UI가 안전하게 읽도록 불변 복제) */
  snapshot(state: S): S;
  /** 이산 수동 입력 (조작 패널 버튼 등) — 채널 이름으로 지정 */
  setDiscreteInput(state: S, channel: string, active: boolean): void;
}

const registry = new Map<string, EquipmentAdapter>();

/** 부품 type에 복합설비 어댑터를 등록한다 (어댑터 모듈 로드 시 1회) */
export function registerEquipmentAdapter(type: string, adapter: EquipmentAdapter): void {
  registry.set(type, adapter);
}

/** 부품 type의 복합설비 어댑터 조회 (없으면 undefined — 일반 부품) */
export function getEquipmentAdapter(type: string): EquipmentAdapter | undefined {
  return registry.get(type);
}
