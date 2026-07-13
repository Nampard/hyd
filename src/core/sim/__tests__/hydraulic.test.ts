import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { getExample } from "../../examples";
import { SimulationEngine } from "../engine";
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

function byName(doc: CircuitDocument, type: string, nameKey: string, name: string): string {
  const found = doc.components.find(
    (c) => c.type === type && String(c.properties[nameKey]) === name,
  );
  if (!found) throw new Error(`부품 없음: ${type} ${name}`);
  return found.id;
}

describe("골든 시나리오: 유압 기초 (4/2 레버)", () => {
  it("레버 토글로 전진, 해제로 후진하고 압력계가 가압을 표시한다", () => {
    const doc = getExample("hyd-basic")!.build();
    const cyl = doc.components.find((c) => c.type === "hyd.cylinder.double")!.id;
    const valve = doc.components.find((c) => c.type === "hyd.valve.4-2-lever")!.id;
    const gauge = doc.components.find((c) => c.type === "hyd.gauge")!.id;
    const engine = new SimulationEngine(doc);

    let snap = run(engine, 0.3);
    expect(snap.components[cyl].cylinderPos).toBe(0);
    expect(snap.components[gauge].portState.P).toBe("pressurized"); // P라인 상시 가압

    engine.setManual(valve, true); // 레버 ON → P→A 전진 (행정 2초)
    snap = run(engine, 2.5);
    expect(snap.components[cyl].cylinderPos).toBe(1);

    engine.setManual(valve, false);
    snap = run(engine, 2.5);
    expect(snap.components[cyl].cylinderPos).toBe(0);
  });
});

describe("골든 시나리오: 유압 4/3 클로즈드 센터 전기 조그 (Phase 3 완료 기준)", () => {
  it("UP 누르는 동안 전진, 놓으면 그 자리에 유지, DOWN으로 후진한다", () => {
    const doc = getExample("hyd-43-electric")!.build();
    const cyl = doc.components.find((c) => c.type === "hyd.cylinder.double")!.id;
    const up = byName(doc, "elec.pushbutton", "name", "UP");
    const down = byName(doc, "elec.pushbutton", "name", "DOWN");
    const engine = new SimulationEngine(doc);

    // UP 1초 (행정 2초 → 절반)
    engine.setManual(up, true);
    let snap = run(engine, 1);
    engine.setManual(up, false);
    const mid = snap.components[cyl].cylinderPos!;
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);

    // 놓은 뒤 2초 — 클로즈드 센터가 위치 유지
    snap = run(engine, 2);
    expect(snap.components[cyl].cylinderPos).toBeCloseTo(mid, 1);

    // DOWN으로 완전 후진
    engine.setManual(down, true);
    snap = run(engine, 2.5);
    expect(snap.components[cyl].cylinderPos).toBe(0);
  });
});

describe("골든 시나리오: 유압 미터아웃", () => {
  it("유량조절밸브 개도만큼 전진이 느려진다", () => {
    const doc = getExample("hyd-meter-out")!.build();
    const cyl = doc.components.find((c) => c.type === "hyd.cylinder.double")!.id;
    const valve = doc.components.find((c) => c.type === "hyd.valve.4-2-lever")!.id;
    const engine = new SimulationEngine(doc);

    engine.setManual(valve, true);
    // 개도 0.3 → 행정 2초/0.3 ≈ 6.7초. 3초 시점엔 중간쯤
    let snap = run(engine, 3);
    const mid = snap.components[cyl].cylinderPos!;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);

    snap = run(engine, 5);
    expect(snap.components[cyl].cylinderPos).toBe(1);
  });
});
