import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { examples, getExample, lc, rungOf } from "../../examples";
import { SimulationEngine } from "../engine";
import { validateForSimulation } from "../validate";
import { PlcRunner } from "../../plc/scanner";
import type { CircuitDocument } from "../../model/types";

beforeAll(() => {
  registerLibraries();
});

const DT = 0.02;

function run(engine: SimulationEngine, seconds: number) {
  const steps = Math.round(seconds / DT);
  let snap = engine.snapshot();
  for (let i = 0; i < steps; i++) snap = engine.tick(DT);
  return snap;
}

function byName(doc: CircuitDocument, type: string, name: string): string {
  const found = doc.components.find(
    (c) => c.type === type && String(c.properties.name) === name,
  );
  if (!found) throw new Error(`부품 없음: ${type} ${name}`);
  return found.id;
}

describe("PLC 스캐너 단위 테스트", () => {
  it("자기유지: SET 없이 병렬 접점으로 유지된다", () => {
    const program = {
      rungs: [
        rungOf(
          [
            [lc("no", "P0"), lc("nc", "P1"), lc("coil", "M0")],
            [lc("no", "M0"), null],
          ],
          [{ r: 0, c: 0 }, { r: 0, c: 1 }],
        ),
      ],
    };
    const runner = new PlcRunner(program);

    runner.scan(DT, new Map([["P0", true], ["P1", false]]));
    expect(runner.getBit("M0")).toBe(true);

    runner.scan(DT, new Map([["P0", false], ["P1", false]]));
    expect(runner.getBit("M0")).toBe(true); // 자기유지

    runner.scan(DT, new Map([["P0", false], ["P1", true]])); // STOP
    expect(runner.getBit("M0")).toBe(false);
  });

  it("TON: 설정 시간 후 출력", () => {
    const program = { rungs: [rungOf([[lc("no", "P0"), lc("ton", "T0", 0.1)]])] };
    const runner = new PlcRunner(program);
    const on = new Map([["P0", true]]);

    for (let i = 0; i < 4; i++) runner.scan(DT, on); // 0.08s
    expect(runner.getBit("T0")).toBe(false);
    for (let i = 0; i < 2; i++) runner.scan(DT, on); // 0.12s
    expect(runner.getBit("T0")).toBe(true);

    runner.scan(DT, new Map([["P0", false]])); // 소자 → 리셋
    expect(runner.getBit("T0")).toBe(false);
  });

  it("CTU: 상승 에지 카운트와 RST", () => {
    const program = {
      rungs: [
        rungOf([[lc("no", "P0"), lc("ctu", "C0", 2)]]),
        rungOf([[lc("no", "P1"), lc("rst", "C0")]]),
      ],
    };
    const runner = new PlcRunner(program);
    const pulseOn = new Map([["P0", true], ["P1", false]]);
    const pulseOff = new Map([["P0", false], ["P1", false]]);

    runner.scan(DT, pulseOn);
    runner.scan(DT, pulseOff);
    expect(runner.getBit("C0")).toBe(false); // 1회
    runner.scan(DT, pulseOn);
    expect(runner.getBit("C0")).toBe(true); // 2회 도달

    runner.scan(DT, new Map([["P0", false], ["P1", true]])); // RST
    expect(runner.getBit("C0")).toBe(false);
  });
});

describe("골든 시나리오: PLC 자기유지 (예제 15)", () => {
  it("START 펄스 → 램프 유지, STOP → 소등", () => {
    const doc = getExample("plc-self-holding")!.build();
    const start = byName(doc, "elec.pushbutton", "START (P0)");
    const stop = byName(doc, "elec.pushbutton", "STOP (P1)");
    const lamp = doc.components.find((c) => c.type === "elec.lamp")!.id;
    const engine = new SimulationEngine(doc);

    engine.setManual(start, true);
    run(engine, 0.1);
    engine.setManual(start, false);
    let snap = run(engine, 0.5);
    expect(snap.components[lamp].energized).toBe(true);

    engine.setManual(stop, true);
    run(engine, 0.1);
    engine.setManual(stop, false);
    snap = run(engine, 0.3);
    expect(snap.components[lamp].energized).toBe(false);
  });
});

describe("골든 시나리오: PLC 전기공압 왕복 (Phase 4 완료 기준)", () => {
  it("릴레이 예제 9와 동일하게 PLC 래더로 연속 왕복한다", () => {
    const doc = getExample("plc-reciprocate")!.build();
    const runSw = byName(doc, "elec.pushbutton", "RUN (P0)");
    const cyl = doc.components.find((c) => c.type === "pneu.cylinder.double")!.id;
    const engine = new SimulationEngine(doc);

    engine.setManual(runSw, true);

    let extends_ = 0;
    let wasHigh = false;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      const snap = engine.tick(DT);
      const pos = snap.components[cyl].cylinderPos!;
      if (pos >= 0.99 && !wasHigh) {
        extends_ += 1;
        wasHigh = true;
      }
      if (pos <= 0.01 && wasHigh) wasHigh = false;
    }
    expect(extends_).toBeGreaterThanOrEqual(3);
  });
});

describe("골든 시나리오: PLC 타이머 (예제 17)", () => {
  it("스위치 ON 3초 후 램프가 켜진다", () => {
    const doc = getExample("plc-timer")!.build();
    const sw = byName(doc, "elec.pushbutton", "SW (P0)");
    const lamp = doc.components.find((c) => c.type === "elec.lamp")!.id;
    const engine = new SimulationEngine(doc);

    engine.setManual(sw, true);
    let snap = run(engine, 2);
    expect(snap.components[lamp].energized).toBe(false);
    snap = run(engine, 1.5);
    expect(snap.components[lamp].energized).toBe(true);
  });
});

describe("PLC 예제 검증", () => {
  it("모든 내장 예제는 경고 없이 빌드된다", () => {
    for (const ex of examples) {
      const warnings = validateForSimulation(ex.build());
      expect(warnings, `예제 "${ex.name}"`).toEqual([]);
    }
  });
});
