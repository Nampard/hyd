import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { getExample } from "../../examples";
import { SimulationEngine } from "../engine";
import type { CircuitDocument } from "../../model/types";

/**
 * Phase 15 골든 시나리오 — 유압 압력제어 부품
 * (압력 시퀀스 밸브 · 카운터밸런스 밸브 · 어큐뮬레이터 + 부하압 캡).
 */

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

function byLabel(doc: CircuitDocument, type: string, label: string): string {
  const found = doc.components.find(
    (c) => c.type === type && String(c.properties.label) === label,
  );
  if (!found) throw new Error(`부품 없음: ${type} ${label}`);
  return found.id;
}

function first(doc: CircuitDocument, type: string): string {
  const found = doc.components.find((c) => c.type === type);
  if (!found) throw new Error(`부품 없음: ${type}`);
  return found.id;
}

/** 특정 부품의 속성만 바꾼 문서 사본 */
function withProps(
  doc: CircuitDocument,
  componentId: string,
  props: Record<string, unknown>,
): CircuitDocument {
  return {
    ...doc,
    components: doc.components.map((c) =>
      c.id === componentId ? { ...c, properties: { ...c.properties, ...props } } : c,
    ),
  };
}

describe("골든 시나리오: 압력 시퀀스 회로", () => {
  it("A가 행정을 완료한 뒤에야 압력이 올라 시퀀스 밸브가 열리고 B가 전진한다", () => {
    const doc = getExample("hyd-sequence")!.build();
    const cylA = byLabel(doc, "hyd.cylinder.double", "A");
    const cylB = byLabel(doc, "hyd.cylinder.double", "B");
    const seq = first(doc, "hyd.sequence");
    const gauge = first(doc, "hyd.gauge");
    const valve = first(doc, "hyd.valve.4-2-lever");
    const engine = new SimulationEngine(doc);

    engine.setManual(valve, true);

    // A 전진 중(행정 2초) — 라인은 부하압 15bar에 머물고 시퀀스 밸브(30bar)는 닫힘
    let snap = run(engine, 1);
    expect(snap.components[cylA].cylinderPos!).toBeGreaterThan(0.3);
    expect(snap.components[cylA].cylinderPos!).toBeLessThan(0.7);
    expect(snap.components[cylB].cylinderPos).toBe(0);
    expect(snap.components[gauge].portLevel!.P).toBeCloseTo(15, 5);
    expect(snap.components[seq].pressureValveOpen).toBe(false);

    // A 행정 완료 → 압력 상승(40bar) → 시퀀스 밸브 개방 → B 전진 시작
    snap = run(engine, 1.5);
    expect(snap.components[cylA].cylinderPos).toBe(1);
    expect(snap.components[gauge].portLevel!.P).toBeCloseTo(40, 5);
    expect(snap.components[seq].pressureValveOpen).toBe(true);
    expect(snap.components[cylB].cylinderPos!).toBeGreaterThan(0);

    snap = run(engine, 2.5);
    expect(snap.components[cylB].cylinderPos).toBe(1);

    // 레버 해제 — B 헤드는 시퀀스 밸브의 체크 바이패스로 배출되어 복귀한다
    engine.setManual(valve, false);
    snap = run(engine, 3);
    expect(snap.components[cylA].cylinderPos).toBe(0);
    expect(snap.components[cylB].cylinderPos).toBe(0);
  });

  it("작동 압력이 공급압보다 높으면 A가 완료돼도 B는 움직이지 않는다", () => {
    const base = getExample("hyd-sequence")!.build();
    const seq = first(base, "hyd.sequence");
    const doc = withProps(base, seq, { pressure: 60 }); // 공급 40bar < 설정 60bar
    const cylA = byLabel(doc, "hyd.cylinder.double", "A");
    const cylB = byLabel(doc, "hyd.cylinder.double", "B");
    const valve = first(doc, "hyd.valve.4-2-lever");
    const engine = new SimulationEngine(doc);

    engine.setManual(valve, true);
    const snap = run(engine, 4);
    expect(snap.components[cylA].cylinderPos).toBe(1);
    expect(snap.components[cylB].cylinderPos).toBe(0);
    expect(snap.components[seq].pressureValveOpen).toBe(false);
  });
});

describe("골든 시나리오: 카운터밸런스 밸브", () => {
  it("공급압이 설정압에 도달하면 하강하고, 복귀는 체크 바이패스로 자유롭다", () => {
    const doc = getExample("hyd-counterbalance")!.build();
    const cyl = byLabel(doc, "hyd.cylinder.double", "A");
    const cb = first(doc, "hyd.counterbalance");
    const valve = first(doc, "hyd.valve.4-2-lever");
    const engine = new SimulationEngine(doc);

    let snap = run(engine, 0.3);
    expect(snap.components[cyl].cylinderPos).toBe(0);
    expect(snap.components[cb].pressureValveOpen).toBe(false); // 공급 전 파일럿 무압

    engine.setManual(valve, true); // 공급압 40bar ≥ 설정 25bar → 개방
    snap = run(engine, 2.5);
    expect(snap.components[cb].pressureValveOpen).toBe(true);
    expect(snap.components[cyl].cylinderPos).toBe(1);

    engine.setManual(valve, false);
    snap = run(engine, 2.5);
    expect(snap.components[cyl].cylinderPos).toBe(0);
  });

  it("설정압이 공급압보다 높으면 실린더가 내려가지 않는다", () => {
    const base = getExample("hyd-counterbalance")!.build();
    const cb = first(base, "hyd.counterbalance");
    const doc = withProps(base, cb, { pressure: 60 });
    const cyl = byLabel(doc, "hyd.cylinder.double", "A");
    const valve = first(doc, "hyd.valve.4-2-lever");
    const engine = new SimulationEngine(doc);

    engine.setManual(valve, true);
    const snap = run(engine, 3);
    expect(snap.components[cb].pressureValveOpen).toBe(false);
    expect(snap.components[cyl].cylinderPos).toBe(0);
    expect(snap.components[cyl].portState.ROD).toBe("blocked"); // 귀환 유로 차단
  });
});

describe("골든 시나리오: 어큐뮬레이터", () => {
  it("충전 후 공급을 끊으면 압력을 유지하다 유지 시간에 걸쳐 떨어진다", () => {
    const doc = getExample("hyd-accumulator")!.build();
    const acc = first(doc, "hyd.accumulator");
    const gauge = first(doc, "hyd.gauge");
    const lamp = first(doc, "elec.lamp");
    const valve = first(doc, "hyd.valve.4-2-lever");
    const engine = new SimulationEngine(doc);

    // 충전 — 라인 40bar, 압력 스위치(15bar) 동작 → 램프 점등
    engine.setManual(valve, true);
    let snap = run(engine, 0.5);
    expect(snap.components[acc].accumulatorCharge).toBe(1);
    expect(snap.components[gauge].portLevel!.P).toBeCloseTo(40, 5);
    expect(snap.components[lamp].energized).toBe(true);

    // 공급 차단 — 펌프는 무부하, 체크밸브가 역류를 막고 어큐뮬레이터가 라인을 유지 (유지 시간 4초)
    engine.setManual(valve, false);
    snap = run(engine, 1);
    expect(snap.components[acc].accumulatorCharge!).toBeCloseTo(0.75, 1);
    expect(snap.components[gauge].portLevel!.P).toBeCloseTo(30, 0);
    expect(snap.components[lamp].energized).toBe(true);

    // 15bar 아래로 내려가면 압력 스위치가 떨어져 램프 소등
    snap = run(engine, 2);
    expect(snap.components[gauge].portLevel!.P).toBeLessThan(15);
    expect(snap.components[lamp].energized).toBe(false);

    // 완전 방전
    snap = run(engine, 2);
    expect(snap.components[acc].accumulatorCharge).toBe(0);
    expect(snap.components[gauge].portState.P).not.toBe("pressurized");
  });
});

describe("부하압 캡 (Phase 15)", () => {
  it("기본값 0에서는 라인 압력이 소스 압력 그대로다 (기존 회로 동작 불변)", () => {
    const doc = getExample("hyd-basic")!.build();
    const cyl = first(doc, "hyd.cylinder.double");
    const gauge = first(doc, "hyd.gauge");
    const valve = first(doc, "hyd.valve.4-2-lever");
    expect(doc.components.find((c) => c.id === cyl)!.properties.loadPressure).toBe(0);

    const engine = new SimulationEngine(doc);
    engine.setManual(valve, true);
    const snap = run(engine, 1); // 전진 중
    expect(snap.components[cyl].cylinderPos!).toBeGreaterThan(0);
    expect(snap.components[cyl].cylinderPos!).toBeLessThan(1);
    expect(snap.components[gauge].portLevel!.P).toBeCloseTo(40, 5);
  });

  it("부하압을 설정하면 운동 중에만 라인 압력이 낮아지고 행정 완료에서 회복된다", () => {
    const base = getExample("hyd-basic")!.build();
    const cyl = first(base, "hyd.cylinder.double");
    const doc = withProps(base, cyl, { loadPressure: 12 });
    const gauge = first(doc, "hyd.gauge");
    const valve = first(doc, "hyd.valve.4-2-lever");
    const engine = new SimulationEngine(doc);

    engine.setManual(valve, true);
    let snap = run(engine, 1);
    expect(snap.components[cyl].cylinderPos!).toBeLessThan(1);
    expect(snap.components[gauge].portLevel!.P).toBeCloseTo(12, 5);

    snap = run(engine, 1.5); // 행정 완료 → 압력 상승
    expect(snap.components[cyl].cylinderPos).toBe(1);
    expect(snap.components[gauge].portLevel!.P).toBeCloseTo(40, 5);
  });
});
