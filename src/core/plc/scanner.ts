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
  /** CTD는 preset에서 감산 시작 (RST 시 재적재) */
  mode: "up" | "down";
  preset: number;
}

export interface PlcMonitor {
  /** rungId → rows × (COLS+1) 노드 통전 상태 (셀 모니터링 오버레이용) */
  nodePower: Record<string, boolean[][]>;
  /** 디바이스 비트 값 */
  bits: Record<string, boolean>;
  /** T 경과 시간(초)·C 현재 계수 — 모니터 표시용 (codex-review) */
  values: Record<string, number>;
}

export class PlcRunner {
  private program: LadderProgram;
  private bits = new Map<string, boolean>();
  private timers = new Map<string, TimerState>();
  private counters = new Map<string, CounterState>();
  /** 이번 스캔에서 출력 요소가 실제로 기록한 디바이스 */
  private writtenDevices = new Set<string>();
  private monitor: PlcMonitor = { nodePower: {}, bits: {}, values: {} };

  constructor(program: LadderProgram) {
    this.program = program;
  }

  getBit(device: string): boolean {
    return this.bits.get(device) ?? false;
  }

  /** 한 스캔 사이클. inputs: P 디바이스 입력 이미지 */
  scan(dt: number, inputs: Map<string, boolean>): Map<string, boolean> {
    for (const [device, value] of inputs) this.bits.set(device, value);
    this.writtenDevices = new Set();

    const nodePower: Record<string, boolean[][]> = {};
    for (const rung of this.program.rungs) {
      nodePower[rung.id] = this.evaluateRung(rung, dt);
    }

    // 출력 이미지: 출력 요소가 실제로 기록한 P 디바이스만.
    // 입력 이미지가 그대로 출력으로 새는 것을 막는다 (codex-review P 입출력 겹침)
    const outputs = new Map<string, boolean>();
    for (const device of this.writtenDevices) {
      if (device.startsWith("P")) outputs.set(device, this.bits.get(device) ?? false);
    }

    const bitsSnapshot: Record<string, boolean> = {};
    for (const [device, value] of this.bits) bitsSnapshot[device] = value;
    const values: Record<string, number> = {};
    for (const [device, t] of this.timers) values[device] = Math.round(t.elapsed * 10) / 10;
    for (const [device, c] of this.counters) values[device] = c.count;
    this.monitor = { nodePower, bits: bitsSnapshot, values };

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
      // 모니터: 출력 요소가 통전되면 오른쪽 레일 노드도 켜서 셀 강조가 일관되게 표시되도록
      if (powered) power[r][LADDER_COLS] = true;
      switch (cell.kind) {
        case "coil":
          this.bits.set(cell.device, powered);
          this.writtenDevices.add(cell.device);
          break;
        case "set":
          if (powered) this.bits.set(cell.device, true);
          this.writtenDevices.add(cell.device);
          break;
        case "rst":
          if (powered) {
            this.bits.set(cell.device, false);
            // 타이머/카운터 리셋 (CTD는 preset 재적재)
            if (this.timers.has(cell.device)) this.timers.set(cell.device, { elapsed: 0 });
            const counter = this.counters.get(cell.device);
            if (counter) {
              counter.count = counter.mode === "down" ? counter.preset : 0;
              counter.prevIn = false;
            }
          }
          this.writtenDevices.add(cell.device);
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
          this.writtenDevices.add(cell.device);
          break;
        }
        case "toff": {
          // 오프딜레이: 여자 시 즉시 ON, 소자 후 preset 경과하면 OFF
          const state = this.timers.get(cell.device) ?? { elapsed: 0 };
          if (powered) {
            state.elapsed = 0;
            this.bits.set(cell.device, true);
          } else if (this.bits.get(cell.device)) {
            state.elapsed += dt;
            if (state.elapsed >= (cell.preset ?? 0)) this.bits.set(cell.device, false);
          }
          this.timers.set(cell.device, state);
          this.writtenDevices.add(cell.device);
          break;
        }
        case "ctu": {
          const state =
            this.counters.get(cell.device) ??
            { count: 0, prevIn: false, mode: "up" as const, preset: cell.preset ?? 0 };
          if (powered && !state.prevIn) state.count += 1;
          state.prevIn = powered;
          this.bits.set(cell.device, state.count >= (cell.preset ?? 0));
          this.counters.set(cell.device, state);
          this.writtenDevices.add(cell.device);
          break;
        }
        case "ctd": {
          // 다운 카운터: preset에서 시작해 상승 에지마다 감산, 0 이하에서 출력 ON
          const state =
            this.counters.get(cell.device) ??
            { count: cell.preset ?? 0, prevIn: false, mode: "down" as const, preset: cell.preset ?? 0 };
          if (powered && !state.prevIn) state.count -= 1;
          state.prevIn = powered;
          this.bits.set(cell.device, state.count <= 0);
          this.counters.set(cell.device, state);
          this.writtenDevices.add(cell.device);
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
