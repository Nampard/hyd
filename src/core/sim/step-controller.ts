import type { CircuitDocument } from "../model/types";
import { getComponentDefinition } from "../library/registry";
import type { SimulationSnapshot } from "./types";

/**
 * 구분동작(스텝) 실행 컨트롤러 (Phase 11). React 무관.
 *
 * "동작" = 실린더 하나 이상의 연속 운동 구간. 다음 시점을 동작 경계로 본다:
 *  - 어떤 실린더가 행정 끝(0 또는 1)에 막 도달했을 때 (일반적인 시퀀스 완료 지점)
 *  - 움직이던 실린더들이 중간에서 멈춰 일정 시간 유지될 때 (클로즈드 센터 조그 등)
 *
 * 경계에서 관찰자가 "pause"를 받으면 시뮬레이션을 일시정지하고,
 * 사용자 입력(빈 캔버스 클릭 등)으로 다음 동작을 진행한다.
 * 모든 실린더가 초기 위치로 복귀한 경계는 사이클 완료(마지막 동작→처음 동작 전환)로 표시한다.
 */

export interface StepBoundary {
  /** 경계 시각 (시뮬레이션 초) */
  time: number;
  /** 완료된 동작 번호 (1부터) */
  step: number;
  /**
   * 사이클 완료 — 문서의 모든 실린더가 이번 사이클에서 초기 위치를 벗어났다가
   * 전부 초기 위치로 복귀한 경계. 위치만 보는 파생값이 아니라 참여 이력을 추적하는
   * 상태기계 이벤트다 (codex-review-3 P0: A+A−B+B− 조기 사이클 방지).
   */
  cycleComplete: boolean;
}

const POS_EPS = 1e-6;
/** 초기 위치 이탈/복귀 판정 허용 오차 */
const DEPART_EPS = 0.01;
/** 중간 정지 판정: 움직임이 멈춘 채 유지되어야 하는 시뮬레이션 시간(초) —
 * 관찰 주기(틱 수)가 아니라 시간 기준이라 tick 변경에 불변 (codex-review-3 P1) */
const SETTLE_SECONDS = 0.12;

export class StepController {
  private cylinderIds: string[] = [];
  private initial = new Map<string, number>();
  private prev = new Map<string, number>();
  private moving = false;
  private settledTime = 0;
  private lastTime: number | null = null;
  /** 이번 사이클에서 초기 위치를 벗어난 적 있는 실린더 (사이클 경계에서 리셋) */
  private departed = new Set<string>();
  private stepCount = 0;
  private boundaries_: StepBoundary[] = [];

  constructor(doc: CircuitDocument) {
    for (const comp of doc.components) {
      const behavior = getComponentDefinition(comp.type).behavior;
      if (behavior?.role !== "cylinder") continue;
      this.cylinderIds.push(comp.id);
      const pos = comp.properties.initialPosition === "extended" ? 1 : 0;
      this.initial.set(comp.id, pos);
      this.prev.set(comp.id, pos);
    }
  }

  /** 실린더가 없는 회로에서는 스텝 경계가 발생하지 않는다 */
  hasCylinders(): boolean {
    return this.cylinderIds.length > 0;
  }

  boundaries(): StepBoundary[] {
    return [...this.boundaries_]; // 내부 배열 노출 금지 (codex-review-3 P1)
  }

  currentStep(): number {
    return this.stepCount;
  }

  /**
   * 틱 후 스냅숏 관찰. "pause"를 반환하면 동작 경계 — 호출자가 일시정지한다.
   * 반환된 경계 정보는 boundaries() 마지막 항목.
   */
  observe(snapshot: SimulationSnapshot): "continue" | "pause" {
    if (this.cylinderIds.length === 0) return "continue";

    const dt = this.lastTime === null ? 0 : Math.max(0, snapshot.time - this.lastTime);
    this.lastTime = snapshot.time;

    let anyMoved = false;
    let arrivedAtEnd = false;
    for (const id of this.cylinderIds) {
      const pos = snapshot.components[id]?.cylinderPos ?? 0;
      const prev = this.prev.get(id) ?? pos;
      const moved = Math.abs(pos - prev) > POS_EPS;
      if (moved) {
        anyMoved = true;
        // 이번 틱에 행정 끝에 막 도달
        const atEnd = pos <= POS_EPS || pos >= 1 - POS_EPS;
        const wasAtEnd = prev <= POS_EPS || prev >= 1 - POS_EPS;
        if (atEnd && !wasAtEnd) arrivedAtEnd = true;
      }
      // 사이클 참여 이력: 초기 위치를 이탈한 실린더 기록
      if (Math.abs(pos - (this.initial.get(id) ?? 0)) > DEPART_EPS) this.departed.add(id);
      this.prev.set(id, pos);
    }

    if (!this.moving) {
      if (anyMoved && !arrivedAtEnd) {
        this.moving = true;
        this.settledTime = 0;
        return "continue";
      }
      if (arrivedAtEnd) {
        // 정지 상태에서 한 틱 만에 끝 도달 (짧은 행정) — 곧바로 경계
        return this.emitBoundary(snapshot);
      }
      return "continue";
    }

    // 운동 중
    if (arrivedAtEnd) return this.emitBoundary(snapshot);
    if (anyMoved) {
      this.settledTime = 0;
      return "continue";
    }
    this.settledTime += dt;
    if (this.settledTime >= SETTLE_SECONDS) {
      // 중간 정지 (조그 등)도 하나의 동작 완료로 취급
      return this.emitBoundary(snapshot);
    }
    return "continue";
  }

  private emitBoundary(snapshot: SimulationSnapshot): "pause" {
    this.moving = false;
    this.settledTime = 0;
    this.stepCount += 1;
    // 사이클 완료 = (1) 모든 실린더가 초기 위치 복귀 + (2) 문서의 모든 실린더가
    // 이번 사이클에서 초기 위치를 벗어난 적 있음. A+A−B+B−의 A− 경계처럼
    // 아직 움직이지 않은 실린더가 남아 있으면 사이클이 아니다 (codex-review-3 P0)
    const allAtInitial = this.cylinderIds.every((id) => {
      const pos = snapshot.components[id]?.cylinderPos ?? 0;
      return Math.abs(pos - (this.initial.get(id) ?? 0)) <= DEPART_EPS;
    });
    const allParticipated = this.cylinderIds.every((id) => this.departed.has(id));
    const cycleComplete = allAtInitial && allParticipated;
    if (cycleComplete) this.departed.clear(); // 다음 사이클의 참여 추적 시작
    this.boundaries_.push({ time: snapshot.time, step: this.stepCount, cycleComplete });
    return "pause";
  }
}
