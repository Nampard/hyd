import type { Domain, Point, PortKind } from "../model/types";
import type { Direction } from "../geometry";

export interface PortDefinition {
  /** 부품 내 포트 식별자. 공압은 ISO 명칭(P, A, B, R...) 사용 */
  id: string;
  label?: string;
  kind: PortKind;
  /** 부품 원점 기준 로컬 좌표 (rotation 0). 그리드에 정렬되어야 함 */
  offset: Point;
  /** 포트가 부품 바깥을 향하는 방향 (rotation 0 기준) */
  direction: Direction;
}

export type PropertyField =
  | {
      key: string;
      label: string;
      type: "number";
      default: number;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    }
  | { key: string; label: string; type: "text"; default: string }
  | { key: string; label: string; type: "boolean"; default: boolean }
  | {
      key: string;
      label: string;
      type: "select";
      default: string;
      options: { value: string; label: string }[];
    };

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// --- 시뮬레이션 동작 명세 (데이터 주도: 솔버는 role만 해석, 부품별 분기 없음) ---

/**
 * 밸브 한쪽의 조작 방식.
 * - manual: 사용자 클릭 (properties.actuation이 "lever"면 토글, 아니면 누르는 동안만)
 * - roller: 연결된 실린더가 트리거 위치에 있을 때 (properties.cylinderLabel, triggerAt)
 * - pilot: pilotPort가 가압되었을 때
 * - solenoid: solenoidProp 속성의 이름표와 같은 솔레노이드(전기 부하)가 통전됐을 때
 * - spring: 반대쪽 신호가 없으면 이 쪽 위치로 복귀
 * - none: 조작 없음 (양측 파일럿 임펄스 밸브의 메모리 특성)
 */
export type ActuationKind = "manual" | "roller" | "pilot" | "solenoid" | "spring" | "none";

export interface ValveSide {
  kind: ActuationKind;
  /** kind === "pilot"일 때 파일럿 포트 id */
  pilotPort?: string;
  /** kind === "solenoid"일 때 솔레노이드 이름표를 담는 속성 키 (예: "solenoidLeft") */
  solenoidProp?: string;
}

export type Behavior =
  | { role: "source"; port: string }
  | { role: "exhaust"; port: string }
  /** 항상 연결된 통로 (FRL, T 분기) */
  | { role: "conduit"; connections: [string, string][] }
  | {
      role: "valve";
      /** 위치별 내부 연결표. index 0 = 기호의 왼쪽 박스 */
      positions: { connections: [string, string][] }[];
      /** 시뮬레이션 시작 위치 */
      initial: number;
      /** 활성 시 위치 0으로 전환 */
      left: ValveSide;
      /** 활성 시 마지막 위치로 전환 */
      right: ValveSide;
      /** 미배선 시 대기 개방(배기 터미널)으로 취급하는 포트 */
      exhaustPorts: string[];
      /** 5/3 스프링 센터: 무신호 시 중앙 위치로 복귀 */
      springCentered?: boolean;
    }
  | {
      role: "cylinder";
      headPort: string;
      /** 단동이면 생략 */
      rodPort?: string;
      /** 단동 (스프링 복귀) */
      singleActing?: boolean;
    }
  /** 속도제어밸브: A→B 자유 흐름, B→A는 properties.openness(0~1) 교축 */
  | { role: "restrictor"; portA: string; portB: string }
  | { role: "shuttle"; inA: string; inB: string; out: string }
  | { role: "two-pressure"; inA: string; inB: string; out: string }
  | { role: "quick-exhaust"; inP: string; outA: string; exhaustR: string }
  // --- 유압 (Phase 3) ---
  /** 유압 파워유닛: P 가압, T 탱크 귀환 */
  | { role: "hydraulic-power-unit"; pressurePort: string; tankPort: string }
  /** 체크밸브: A→B 자유, B→A 차단 */
  | { role: "check-valve"; portA: string; portB: string }
  /** 파일럿 조작 체크밸브: A→B 자유, B→A는 파일럿 가압 시에만 */
  | { role: "pilot-check"; portA: string; portB: string; pilotPort: string }
  /** 감압밸브: 정방향(portIn→portOut) 통과 시 압력 레벨을 properties.pressure로 제한 (Phase 7) */
  | { role: "reducer"; portIn: string; portOut: string }
  /**
   * 릴리프 밸브: 탱크 경로가 살아 있고 라인 압력이 properties.pressure를 넘으면
   * 압력 포트가 속한 유로 전체의 레벨을 설정값으로 제한한다 (codex-review H6)
   */
  | { role: "pressure-relief"; pressurePort: string; tankPort: string }
  /** 유압 모터: A 가압·B 배출 → 정회전, 반대 → 역회전 (Phase 10) */
  | { role: "motor"; portA: string; portB: string }
  // --- 전기 (Phase 2) ---
  | { role: "elec-supply"; polarity: "positive" | "negative"; port: string }
  /**
   * 접점. properties.contactType: "NO"|"NC".
   * source별 추가 속성 — manual: actuation(momentary/maintained),
   * device: deviceLabel(K1/T1/C1 — 릴레이·타이머·카운터 출력),
   * limit: cylinderLabel + triggerAt(extended/retracted),
   * pressure: threshold(bar) + pressurePort(유체 포트 id) — 해당 포트 압력 레벨 이상이면 동작
   */
  | {
      role: "elec-contact";
      portA: string;
      portB: string;
      source: "manual" | "device" | "limit" | "pressure";
      pressurePort?: string;
    }
  /**
   * 부하 (통전 판정 대상, 전류는 통과시키지 않음).
   * device별 속성 — relay/timer-on/timer-off/counter: label + preset(타이머 초/카운터 횟수),
   * counter-reset: label(대상 카운터), solenoid: label(밸브 solenoidProp와 매칭), lamp/buzzer: 없음
   */
  | {
      role: "elec-load";
      portA: string;
      portB: string;
      device: "relay" | "timer-on" | "timer-off" | "counter" | "counter-reset" | "solenoid" | "lamp" | "buzzer";
    }
  /**
   * 자동화설비 기능사 MPS 스테이션 (Phase 14). 전기·유체 포트가 없는 장비 단위
   * 부품 — PLC ioMap channel로 I/O 26점이 물리고, 워크피스(금속/비금속) 흐름을
   * 내부 상태기계(core/sim/mps-station.ts)로 시뮬레이션한다. 설비는 물리만 제공:
   * 액추에이터는 출력 채널에 반응, 센서는 입력 채널 상태 생성. 로직은 사용자 래더.
   */
  | { role: "mps-station" };

export interface ComponentDefinition {
  type: string;
  domain: Domain;
  /** 팔레트·속성 패널에 표시되는 한국어 이름 */
  name: string;
  /** 팔레트 그룹명 */
  category: string;
  ports: PortDefinition[];
  propertySchema: PropertyField[];
  /** ui/symbols 레지스트리의 기호 키 */
  symbolId: string;
  /** 시뮬레이션 동작. 없으면 장식용(시뮬레이션 무관) 부품 */
  behavior?: Behavior;
  /** 로컬 좌표 기준 기호 바운딩 박스 (선택 표시·히트 영역) */
  bounds: Bounds;
}

/** propertySchema의 default 값들로 초기 properties 객체 생성 */
export function defaultProperties(def: ComponentDefinition): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const field of def.propertySchema) {
    props[field.key] = field.default;
  }
  return props;
}
