/** 논리/상태 기반 압력 상태. 정량 수치는 다루지 않는다 (PRD 5절). */
export type PressureState = "pressurized" | "exhausted" | "blocked";

/** 부품별 런타임 상태 (엔진 내부, 틱마다 갱신) */
export interface ComponentRuntime {
  /** 밸브: 현재 위치 index */
  valvePosition?: number;
  /**
   * 밸브 양측 조작 신호의 직전 틱 상태 (Phase 16-4).
   * 양측 동시 신호일 때 "이번 틱에 새로 켜진 쪽"을 가리기 위한 에지 판정용.
   */
  valveSidePrev?: { left: boolean; right: boolean };
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
  /** 릴리프 밸브가 릴리빙 중 (솔버가 판정, 기호 표시용) */
  reliefActive?: boolean;
  /**
   * 압력 조작 밸브(시퀀스·카운터밸런스)가 열려 있는지 (Phase 15).
   * 솔버가 판정하고 다음 틱의 히스테리시스 입력으로도 쓰인다.
   */
  pressureValveOpen?: boolean;
  /** 어큐뮬레이터 잔량 0..1 (Phase 15) */
  accumulatorCharge?: number;
  /** 어큐뮬레이터가 충전된 압력 (bar) */
  accumulatorLevel?: number;
  /**
   * 복합설비(EquipmentAdapter) 상태 — 어댑터가 소유하는 불투명 값 (Phase 14).
   * 엔진은 형태를 모른 채 보관·전달하고, 해당 스프라이트만 자신의 타입으로 읽는다.
   */
  equipment?: unknown;
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
      /** 릴리프 밸브가 릴리빙 중 (솔버가 판정, 기호 표시용) */
      reliefActive?: boolean;
      /** 압력 조작 밸브가 열림 (Phase 15 — 기호 표시용) */
      pressureValveOpen?: boolean;
      /** 어큐뮬레이터 잔량 0..1 (Phase 15 — 기호 표시용) */
      accumulatorCharge?: number;
      /** 복합설비 상태 사본 (Phase 14 — 스프라이트가 자신의 타입으로 캐스팅해 읽음) */
      equipment?: unknown;
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
    /** T 경과 시간(초)·C 현재 계수 */
    values: Record<string, number>;
  };
  /** 솔버 수렴 진단 — false면 발진 회로 가능성 경고 (review-2 P0) */
  diagnostics?: {
    electricConverged: boolean;
    fluidConverged: boolean;
    /**
     * 양측 조작 신호가 동시에 들어온 밸브 id 목록 (Phase 16-4).
     * 실물에서는 금지되는 상태 — 인터록 설계를 유도하는 경고용.
     */
    conflictingValves: string[];
  };
}

export function portKey(componentId: string, portId: string): string {
  return `${componentId}:${portId}`;
}
