import type { CircuitDocument } from "../model/types";
import { getComponentDefinition } from "../library/registry";
import type { SimulationSnapshot } from "./types";

/**
 * 변위단계선도 레코더 (Phase 6).
 * 시뮬레이션 스냅숏에서 실린더 위치(0~1)를 시계열로 기록한다. React 무관.
 */

export interface TrackPoint {
  t: number;
  pos: number;
}

export interface CylinderTrack {
  componentId: string;
  /** 실린더 이름표 (없으면 순번) */
  label: string;
  points: TrackPoint[];
}

/** 위치 변화가 이 값 이하이고 시간 간격이 짧으면 점을 생략 (버퍼 절약) */
const POS_EPS = 0.002;
const MIN_GAP = 0.2;
/** 보관 시간 창 (초) */
const WINDOW = 120;

export class DisplacementRecorder {
  private tracks_: CylinderTrack[] = [];

  constructor(doc: CircuitDocument) {
    let index = 0;
    for (const comp of doc.components) {
      const behavior = getComponentDefinition(comp.type).behavior;
      if (behavior?.role !== "cylinder") continue;
      index += 1;
      const label = String(comp.properties.label ?? "") || `실린더${index}`;
      this.tracks_.push({ componentId: comp.id, label, points: [] });
    }
  }

  /** 기록 대상 실린더가 있는지 */
  hasCylinders(): boolean {
    return this.tracks_.length > 0;
  }

  record(snapshot: SimulationSnapshot): void {
    for (const track of this.tracks_) {
      const pos = snapshot.components[track.componentId]?.cylinderPos;
      if (pos === undefined) continue;
      const last = track.points[track.points.length - 1];
      // 계단 파형 보존: 값이 바뀌면 반드시 기록, 정지 구간은 간헐 기록
      if (last && Math.abs(last.pos - pos) <= POS_EPS && snapshot.time - last.t < MIN_GAP) {
        continue;
      }
      track.points.push({ t: snapshot.time, pos });
      // 보관 창 밖 오래된 점 제거
      const cutoff = snapshot.time - WINDOW;
      if (track.points.length > 2 && track.points[0].t < cutoff) {
        while (track.points.length > 2 && track.points[1].t < cutoff) track.points.shift();
      }
    }
  }

  tracks(): CylinderTrack[] {
    return this.tracks_;
  }

  /** 기록된 마지막 시각 */
  endTime(): number {
    let end = 0;
    for (const track of this.tracks_) {
      const last = track.points[track.points.length - 1];
      if (last) end = Math.max(end, last.t);
    }
    return end;
  }

  clear(): void {
    for (const track of this.tracks_) track.points = [];
  }
}
