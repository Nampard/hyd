import type { LadderProgram, LadderRung } from "./model";
import { LADDER_COLS, OUTPUT_COL, isContactKind } from "./model";

/**
 * PLC 스캔 실행기 (ARCHITECTURE 4.5).
 * 스캔: 입력 이미지 반영 → 렁 위→아래 평가 (출력 즉시 반영) → 출력 이미지 반환.
 * 렁 내부는 노드 그래프 도달성으로 평가한다 (병렬 분기 = vlink).
 */

interface TimerState {
  elapsed: number;
}

interface CounterState {
  count: number;
  prevIn: boolean;
}

export interface PlcMonitor {
  /** rungId → rows × (COLS+1) 노드 통전 상태 (셀 모니터링 오버레이용) */
  nodePower: Record<string, boolean[][]>;
  /** 디바이스 비트 값 */
  bits: Record<string, boolean>;
}

export class PlcRunner {
  private program: LadderProgram;
  private bits = new Map<string, boolean>();
  private timers = new Map<string, TimerState>();
  private counters = new Map<string, CounterState>();
  private monitor: PlcMonitor = { nodePower: {}, bits: {} };

  constructor(program: LadderProgram) {
    this.program = program;
  }

  getBit(device: string): boolean {
    return this.bits.get(device) ?? false;
  }

  /** 한 스캔 사이클. inputs: P 디바이스 입력 이미지 */
  scan(dt: number, inputs: Map<string, boolean>): Map<string, boolean> {
    for (const [device, value] of inputs) this.bits.set(device, value);

    const nodePower: Record<string, boolean[][]> = {};
    for (const rung of this.program.rungs) {
      nodePower[rung.id] = this.evaluateRung(rung, dt);
    }

    // 출력 이미지 (P 디바이스 전체 — ioMap이 골라 쓴다)
    const outputs = new Map<string, boolean>();
    for (const [device, value] of this.bits) {
      if (device.startsWith("P")) outputs.set(device, value);
    }

    const bitsSnapshot: Record<string, boolean> = {};
    for (const [device, value] of this.bits) bitsSnapshot[device] = value;
    this.monitor = { nodePower, bits: bitsSnapshot };

    return outputs;
  }

  getMonitor(): PlcMonitor {
    return this.monitor;
  }

  /** 렁 평가: 노드 도달성 → 출력 실행. 반환: rows × (COLS+1) 노드 통전 */
  private evaluateRung(rung: LadderRung, dt: number): boolean[][] {
    const rows = rung.cells.length;
    const power: boolean[][] = Array.from({ length: rows }, () =>
      new Array<boolean>(LADDER_COLS + 1).fill(false),
    );
    power[0][0] = true; // 왼쪽 레일은 첫 행에 접속

    // 도달성 전파: 셀 도통(왼→오)과 vlink(상↕하)를 안정될 때까지 반복
    for (let iter = 0; iter < rows * (LADDER_COLS + 1) + 2; iter++) {
      let changed = false;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < LADDER_COLS; c++) {
          const cell = rung.cells[r][c];
          if (cell && power[r][c] && !power[r][c + 1]) {
            if (cell.kind === "hline" || (isContactKind(cell.kind) && this.contactConducts(cell.kind, cell.device))) {
              power[r][c + 1] = true;
              changed = true;
            }
          }
        }
      }
      for (const link of rung.vlinks) {
        if (link.r + 1 >= rows || link.c > LADDER_COLS) continue;
        if (power[link.r][link.c] !== power[link.r + 1][link.c]) {
          power[link.r][link.c] = true;
          power[link.r + 1][link.c] = true;
          changed = true;
        }
      }
      if (!changed) break;
    }

    // 출력 실행 (마지막 열)
    for (let r = 0; r < rows; r++) {
      const cell = rung.cells[r][OUTPUT_COL];
      if (!cell || !cell.device) continue;
      const powered = power[r][OUTPUT_COL];
      switch (cell.kind) {
        case "coil":
          this.bits.set(cell.device, powered);
          break;
        case "set":
          if (powered) this.bits.set(cell.device, true);
          break;
        case "rst":
          if (powered) {
            this.bits.set(cell.device, false);
            // 타이머/카운터 리셋
            this.timers.get(cell.device) && this.timers.set(cell.device, { elapsed: 0 });
            this.counters.get(cell.device) &&
              this.counters.set(cell.device, { count: 0, prevIn: false });
          }
          break;
        case "ton": {
          const state = this.timers.get(cell.device) ?? { elapsed: 0 };
          if (powered) {
            state.elapsed += dt;
            this.bits.set(cell.device, state.elapsed >= (cell.preset ?? 0));
          } else {
            state.elapsed = 0;
            this.bits.set(cell.device, false);
          }
          this.timers.set(cell.device, state);
          break;
        }
        case "ctu": {
          const state = this.counters.get(cell.device) ?? { count: 0, prevIn: false };
          if (powered && !state.prevIn) state.count += 1;
          state.prevIn = powered;
          this.bits.set(cell.device, state.count >= (cell.preset ?? 0));
          this.counters.set(cell.device, state);
          break;
        }
        default:
          break;
      }
    }

    return power;
  }

  private contactConducts(kind: "no" | "nc", device?: string): boolean {
    const bit = device ? (this.bits.get(device) ?? false) : false;
    return kind === "no" ? bit : !bit;
  }
}
