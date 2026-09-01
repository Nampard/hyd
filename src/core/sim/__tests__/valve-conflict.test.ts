import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { buildCircuit } from "../../examples/builder";
import { SimulationEngine } from "../engine";
import type { CircuitDocument } from "../../model/types";

/**
 * Phase 16-4 — 양측 솔레노이드 동시 통전 시 우선순위.
 *
 * 표준(KS B 0054는 기호 표준, ISO 5599/12238도 해당 없음)은 동시 통전 시 스풀 위치를
 * 규정하지 않고 제조사 지침은 "동시 통전 금지 / 위치 보장 안 됨"이다. HYD는 결정적
 * 교육 모델로 **마지막 상승 에지 우선**을 채택하고, 동시 통전을 진단으로 보고한다.
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

/** PB1→Y1(전진), PB2→Y2(후진)를 서로 독립으로 켤 수 있는 시험 회로 */
function buildRig(): CircuitDocument {
  return buildCircuit("양솔 동시 통전 시험", "PB1→Y1, PB2→Y2를 독립 구동", (b) => {
    const cyl = b.place("pneu.cylinder.double", 480, 100, { label: "A", strokeTime: 1 });
    const valve = b.place("pneu.valve.5-2-double-solenoid", 480, 220, {
      solenoidLeft: "Y1",
      solenoidRight: "Y2",
    });
    const src = b.place("pneu.source", 510, 330);
    b.connect(src, "P", valve, "P");
    b.connect(valve, "A", cyl, "HEAD");
    b.connect(valve, "B", cyl, "ROD");

    const sup24 = b.place("elec.supply-24v", 150, 420);
    const pb1 = b.place("elec.pushbutton", 150, 520, {
      contactType: "NO",
      actuation: "maintained",
      name: "PB1",
    });
    const y1 = b.place("elec.solenoid", 150, 640, { label: "Y1" });
    const pb2 = b.place("elec.pushbutton", 330, 520, {
      contactType: "NO",
      actuation: "maintained",
      name: "PB2",
    });
    const y2 = b.place("elec.solenoid", 330, 640, { label: "Y2" });
    const sup0 = b.place("elec.supply-0v", 240, 730);

    b.connect(sup24, "P", pb1, "T");
    b.connect(pb1, "B", y1, "T");
    b.connect(y1, "B", sup0, "P");
    b.connect(sup24, "P", pb2, "T");
    b.connect(pb2, "B", y2, "T");
    b.connect(y2, "B", sup0, "P");
  });
}

function findByName(doc: CircuitDocument, name: string): string {
  const c = doc.components.find((x) => String(x.properties.name) === name);
  if (!c) throw new Error(`부품 없음: ${name}`);
  return c.id;
}

describe("양측 솔레노이드 동시 통전 (Phase 16-4)", () => {
  it("나중에 켜진 솔레노이드가 스풀을 가져가고, 계속 켜져 있던 쪽은 되찾지 못한다", () => {
    const doc = buildRig();
    const cyl = doc.components.find((c) => c.type === "pneu.cylinder.double")!.id;
    const valve = doc.components.find((c) => c.type === "pneu.valve.5-2-double-solenoid")!.id;
    const pb1 = findByName(doc, "PB1");
    const pb2 = findByName(doc, "PB2");
    const engine = new SimulationEngine(doc);

    // Y1(전진)만 통전 → 전진 완료
    engine.setManual(pb1, true);
    let snap = run(engine, 1.5);
    expect(snap.components[cyl].cylinderPos).toBe(1);
    expect(snap.components[valve].valvePosition).toBe(0);
    expect(snap.diagnostics!.conflictingValves).toEqual([]);

    // Y1을 켜 둔 채 Y2(후진)를 추가 통전 → 새로 켜진 Y2가 이긴다
    engine.setManual(pb2, true);
    snap = run(engine, 1.5);
    expect(snap.components[valve].valvePosition).toBe(1);
    expect(snap.components[cyl].cylinderPos).toBe(0);
    // 동시 통전은 진단으로 보고된다 (실물 금지 상태 — 인터록 유도)
    expect(snap.diagnostics!.conflictingValves).toContain(valve);

    // 둘 다 켜진 채로 계속 둬도 Y1이 스풀을 되찾지 못한다 (상승 에지가 없으므로)
    snap = run(engine, 2);
    expect(snap.components[valve].valvePosition).toBe(1);
    expect(snap.components[cyl].cylinderPos).toBe(0);
  });

  it("한쪽을 끄면 남은 쪽 단독 신호로 정상 전환되고 경고도 해제된다", () => {
    const doc = buildRig();
    const cyl = doc.components.find((c) => c.type === "pneu.cylinder.double")!.id;
    const valve = doc.components.find((c) => c.type === "pneu.valve.5-2-double-solenoid")!.id;
    const pb1 = findByName(doc, "PB1");
    const pb2 = findByName(doc, "PB2");
    const engine = new SimulationEngine(doc);

    engine.setManual(pb1, true);
    engine.setManual(pb2, true);
    let snap = run(engine, 0.5);
    expect(snap.diagnostics!.conflictingValves).toContain(valve);

    // Y2를 끄면 Y1 단독 → 전진, 경고 해제
    engine.setManual(pb2, false);
    snap = run(engine, 1.5);
    expect(snap.diagnostics!.conflictingValves).toEqual([]);
    expect(snap.components[valve].valvePosition).toBe(0);
    expect(snap.components[cyl].cylinderPos).toBe(1);
  });

  it("같은 틱에 양측이 동시에 켜지면 위치를 유지한다 (어느 쪽도 나중이 아님)", () => {
    const doc = buildRig();
    const valve = doc.components.find((c) => c.type === "pneu.valve.5-2-double-solenoid")!.id;
    const pb1 = findByName(doc, "PB1");
    const pb2 = findByName(doc, "PB2");
    const engine = new SimulationEngine(doc);

    const initial = engine.snapshot().components[valve].valvePosition;
    engine.setManual(pb1, true);
    engine.setManual(pb2, true);
    const snap = run(engine, 1);
    expect(snap.components[valve].valvePosition).toBe(initial);
    expect(snap.diagnostics!.conflictingValves).toContain(valve);
  });
});
