import { describe, expect, it } from "vitest";
import { PlcRunner } from "../../plc/scanner";
import { LADDER_COLS } from "../../plc/model";
import { lc, rungOf } from "../../examples";

/**
 * codex-review H3(TOFF/CTD)·P 입출력 겹침·출력 셀 통전 표시 회귀 테스트
 */

const DT = 0.02;

describe("H3: TOFF (오프딜레이 타이머)", () => {
  it("여자 시 즉시 ON, 소자 후 설정 시간 뒤 OFF", () => {
    const runner = new PlcRunner({ rungs: [rungOf([[lc("no", "P0"), lc("toff", "T0", 0.1)]])] });

    runner.scan(DT, new Map([["P0", true]]));
    expect(runner.getBit("T0")).toBe(true); // 즉시 ON

    for (let i = 0; i < 3; i++) runner.scan(DT, new Map([["P0", false]])); // 0.06s
    expect(runner.getBit("T0")).toBe(true); // 아직 유지

    for (let i = 0; i < 3; i++) runner.scan(DT, new Map([["P0", false]])); // 0.12s
    expect(runner.getBit("T0")).toBe(false); // 지연 후 OFF
  });
});

describe("H3: CTD (다운 카운터)", () => {
  it("preset에서 감산해 0에서 출력 ON, RST로 재적재", () => {
    const runner = new PlcRunner({
      rungs: [
        rungOf([[lc("no", "P0"), lc("ctd", "C0", 2)]]),
        rungOf([[lc("no", "P1"), lc("rst", "C0")]]),
      ],
    });
    const pulse = (on: boolean) => runner.scan(DT, new Map([["P0", on], ["P1", false]]));

    pulse(true);
    pulse(false);
    expect(runner.getBit("C0")).toBe(false); // 2 → 1
    pulse(true);
    expect(runner.getBit("C0")).toBe(true); // 1 → 0 도달

    runner.scan(DT, new Map([["P0", false], ["P1", true]])); // RST → preset 재적재
    expect(runner.getBit("C0")).toBe(false);
    pulse(true);
    pulse(false);
    pulse(true);
    expect(runner.getBit("C0")).toBe(true); // 다시 2회 감산
  });
});

describe("P 디바이스 입력/출력 겹침 차단", () => {
  it("출력 이미지에는 출력 요소가 기록한 디바이스만 포함된다", () => {
    // 렁: P0 → P20. P0은 입력 전용이므로 출력 이미지에 나오면 안 된다.
    const runner = new PlcRunner({ rungs: [rungOf([[lc("no", "P0"), lc("coil", "P20")]])] });
    const outputs = runner.scan(DT, new Map([["P0", true]]));
    expect(outputs.get("P20")).toBe(true);
    expect(outputs.has("P0")).toBe(false); // 입력이 출력으로 새지 않음
  });
});

describe("출력 셀 통전 표시", () => {
  it("코일이 통전되면 출력 셀 오른쪽 노드도 켜진다 (모니터 강조용)", () => {
    const runner = new PlcRunner({ rungs: [rungOf([[lc("no", "P0"), lc("coil", "M0")]], [], "r1")] });
    runner.scan(DT, new Map([["P0", true]]));
    const power = runner.getMonitor().nodePower.r1;
    expect(power[0][LADDER_COLS - 1]).toBe(true); // 코일 왼쪽 노드
    expect(power[0][LADDER_COLS]).toBe(true); // 코일 오른쪽 노드 (강조 조건)
  });

  it("통전되지 않으면 오른쪽 노드도 꺼진다", () => {
    const runner = new PlcRunner({ rungs: [rungOf([[lc("no", "P0"), lc("coil", "M0")]], [], "r1")] });
    runner.scan(DT, new Map([["P0", false]]));
    const power = runner.getMonitor().nodePower.r1;
    expect(power[0][LADDER_COLS]).toBe(false);
  });
});

describe("모니터 값 (T 경과·C 계수)", () => {
  it("타이머 경과와 카운터 계수가 모니터에 노출된다", () => {
    const runner = new PlcRunner({
      rungs: [
        rungOf([[lc("no", "P0"), lc("ton", "T0", 1)]]),
        rungOf([[lc("no", "P1"), lc("ctu", "C0", 5)]]),
      ],
    });
    for (let i = 0; i < 10; i++) runner.scan(DT, new Map([["P0", true], ["P1", i % 2 === 0]]));
    const monitor = runner.getMonitor();
    expect(monitor.values.T0).toBeGreaterThan(0.1);
    expect(monitor.values.C0).toBe(5);
  });
});

describe("Phase 14-6: 음변환(N) 접점 + 점멸 특수릴레이", () => {
  it("ne 접점은 디바이스가 꺼지는 스캔에만 1회 통전한다", () => {
    const runner = new PlcRunner({ rungs: [rungOf([[lc("ne", "P0"), lc("set", "M0")]])] });

    runner.scan(DT, new Map([["P0", false]]));
    expect(runner.getBit("M0")).toBe(false); // 초기: 에지 없음
    runner.scan(DT, new Map([["P0", true]]));
    expect(runner.getBit("M0")).toBe(false); // 상승 에지에는 반응 없음
    runner.scan(DT, new Map([["P0", false]]));
    expect(runner.getBit("M0")).toBe(true); // 하강 에지 — 1스캔 통전 (SET으로 래치 확인)

    // 통전이 1스캔뿐인지: coil로 재검증
    const pulse = new PlcRunner({ rungs: [rungOf([[lc("ne", "P0"), lc("coil", "M1")]])] });
    pulse.scan(DT, new Map([["P0", true]]));
    pulse.scan(DT, new Map([["P0", false]]));
    expect(pulse.getBit("M1")).toBe(true); // 에지 스캔
    pulse.scan(DT, new Map([["P0", false]]));
    expect(pulse.getBit("M1")).toBe(false); // 다음 스캔부터 소자
  });

  it("_T1S는 1초 주기(0.5s ON/0.5s OFF)로 점멸한다", () => {
    const runner = new PlcRunner({ rungs: [rungOf([[lc("no", "_T1S"), lc("coil", "M0")]])] });
    const on = new Map<string, boolean>();
    let changes = 0;
    let prev: boolean | null = null;
    for (let i = 0; i < Math.round(2 / DT); i++) {
      runner.scan(DT, on);
      const bit = runner.getBit("M0");
      if (prev !== null && bit !== prev) changes += 1;
      prev = bit;
    }
    expect(changes).toBe(4); // 2초 동안 4회 전환 (0.5, 1.0, 1.5, 2.0)
  });
});
