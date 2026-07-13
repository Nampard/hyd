/** 논리/상태 기반 압력 상태. 정량 수치는 다루지 않는다 (PRD 5절). */
export type PressureState = "pressurized" | "exhausted" | "blocked";

/** 부품별 런타임 상태 (엔진 내부, 틱마다 갱신) */
export interface ComponentRuntime {
  /** 밸브: 현재 위치 index */
  valvePosition?: number;
  /** 실린더: 0(후진)..1(전진) */
  cylinderPos?: number;
  /** 수동 조작 입력 (버튼 눌림/레버 위치, 전기 푸시버튼 포함) */
  manualActive?: boolean;
  /** 전기 부하: 통전 여부 */
  energized?: boolean;
  /** 전기 접점: 닫힘 여부 (NC 반전 적용 후) */
  contactClosed?: boolean;
  /** 포트별 압력 상태 (직전 솔브 결과 — 파일럿 판정에 사용) */
  portState: Record<string, PressureState>;
  /** 포트별 압력 레벨 (bar, 준정량 — 압력계·압력 스위치용) */
  portLevel?: Record<string, number>;
  /** 모터: 누적 회전각 (도, 역회전 시 감소) */
  motorAngle?: number;
}

/** UI가 구독하는 스냅숏 (불변 평면 객체) */
export interface SimulationSnapshot {
  time: number;
  components: Record<
    string,
    {
      valvePosition?: number;
      cylinderPos?: number;
      manualActive?: boolean;
      energized?: boolean;
      contactClosed?: boolean;
      portState: Record<string, PressureState>;
      portLevel?: Record<string, number>;
      motorAngle?: number;
    }
  >;
  /**
   * wireId → 상태 (배선 색상용).
   * 유체 배관: 압력 상태. 전기 배선: 활선(24V측)이면 "pressurized", 아니면 "blocked".
   */
  wires: Record<string, PressureState>;
  /** PLC 모니터링 (프로그램이 있을 때만) */
  plc?: {
    nodePower: Record<string, boolean[][]>;
    bits: Record<string, boolean>;
  };
}

export function portKey(componentId: string, portId: string): string {
  return `${componentId}:${portId}`;
}
