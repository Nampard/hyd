/** 포트가 흘려보내는 매체 종류. 배선은 같은 kind끼리만 연결할 수 있다. */
export type PortKind = "pneumatic" | "hydraulic" | "electric";

export type Domain = "pneumatic" | "hydraulic" | "electric" | "automation";

export type Rotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

export interface ComponentInstance {
  id: string;
  /** 라이브러리 레지스트리 키. 예: "pneu.source" */
  type: string;
  position: Point;
  rotation: Rotation;
  properties: Record<string, unknown>;
}

/** 배선의 끝점: 특정 부품 인스턴스의 특정 포트 */
export interface PortRef {
  componentId: string;
  portId: string;
}

export interface Wire {
  id: string;
  kind: PortKind;
  from: PortRef;
  to: PortRef;
  /** 직교 라우팅 경유점 (from 포트 → to 포트 사이, 끝점 제외) */
  waypoints: Point[];
}

export interface DocumentMeta {
  title: string;
  description?: string;
  createdAt: string;
  /**
   * 학습 활동 설명 (Phase 12) — 이 과제물이 어떤 학습 활동인지 나타내는 문장.
   * 예: "제어밸브 및 복동실린더를 활용한 시퀀스 제어". 저장 시 비어 있으면
   * summarizeLearningActivity()의 자동 초안으로 채워지고, 언제든 수정 가능하다.
   * 학습자 식별 정보(이름·학번 등)는 의도적으로 포함하지 않는다.
   */
  learningActivity?: string;
}

import type { IoEntry, LadderProgram } from "../plc/model";

export interface CircuitDocument {
  schemaVersion: number;
  meta: DocumentMeta;
  components: ComponentInstance[];
  wires: Wire[];
  /** PLC 래더 프로그램 (Phase 4) */
  plcProgram?: LadderProgram;
  /** P 디바이스 ↔ 부품 매핑 */
  ioMap?: IoEntry[];
  /** 장비 뷰 자유 배치 좌표 (없는 부품은 회로도 좌표 사용, Phase 8 / v2) */
  equipmentLayout?: Record<string, Point>;
}

export const CURRENT_SCHEMA_VERSION = 4;

export function createEmptyDocument(title = "새 회로"): CircuitDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { title, createdAt: new Date().toISOString() },
    components: [],
    wires: [],
  };
}

let idCounter = 0;

/** 문서 내 유일 ID 생성. 로드된 문서와 충돌하지 않도록 랜덤 성분 포함. */
export function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
