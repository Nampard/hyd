import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { examples, getExample } from "../../examples";
import { SimulationEngine } from "../engine";
import { validateForSimulation } from "../validate";
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

/** 잠깐 눌렀다 떼기 (펄스) */
function pulse(engine: SimulationEngine, id: string, seconds = 0.1) {
  engine.setManual(id, true);
  run(engine, seconds);
  engine.setManual(id, false);
}

function byType(doc: CircuitDocument, type: string): string[] {
  return doc.components.filter((c) => c.type === type).map((c) => c.id);
}

function byName(doc: CircuitDocument, type: string, nameKey: string, name: string): string {
  const found = doc.components.find(
    (c) => c.type === type && String(c.properties[nameKey]) === name,
  );
  if (!found) throw new Error(`부품 없음: ${type} ${name}`);
  return found.id;
}

function cylinderByLabel(doc: CircuitDocument, label: string): string {
  const found = doc.components.find(
    (c) => c.type.startsWith("pneu.cylinder") && String(c.properties.label) === label,
  );
  if (!found) throw new Error(`실린더 없음: ${label}`);
  return found.id;
}

describe("골든 시나리오: 자기유지 회로", () => {
  it("START 펄스로 램프가 켜져 유지되고, STOP으로 꺼진다", () => {
    const doc = getExample("self-holding")!.build();
    const start = byName(doc, "elec.pushbutton", "name", "START");
    const stop = byName(doc, "elec.pushbutton", "name", "STOP");
    const [lamp] = byType(doc, "elec.lamp");
    const engine = new SimulationEngine(doc);

    let snap = run(engine, 0.2);
    expect(snap.components[lamp].energized).toBe(false);

    pulse(engine, start);
    snap = run(engine, 0.5);
    expect(snap.components[lamp].energized).toBe(true); // 자기유지

    pulse(engine, stop);
    snap = run(engine, 0.3);
    expect(snap.components[lamp].energized).toBe(false);
  });
});

describe("골든 시나리오: 전기공압 연속 왕복", () => {
  it("RUN 셀렉터를 켜면 실린더가 연속 왕복한다", () => {
    const doc = getExample("electro-reciprocate")!.build();
    const runSw = byName(doc, "elec.pushbutton", "name", "RUN");
    const cyl = cylinderByLabel(doc, "A");
    const engine = new SimulationEngine(doc);

    engine.setManual(runSw, true); // 셀렉터 유지

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

describe("골든 시나리오: 타이머 자동 복귀", () => {
  it("전진단 도달 3초 후 복귀한다", () => {
    const doc = getExample("timer-return")!.build();
    const start = byName(doc, "elec.pushbutton", "name", "START");
    const cyl = cylinderByLabel(doc, "A");
    const engine = new SimulationEngine(doc);

    pulse(engine, start, 0.2);
    let snap = run(engine, 1.5); // 전진 완료 (행정 1초)
    expect(snap.components[cyl].cylinderPos).toBe(1);

    snap = run(engine, 2); // 타이머 3초 중 2초 경과 — 아직 전진 유지
    expect(snap.components[cyl].cylinderPos).toBe(1);

    snap = run(engine, 2.5); // 3초 경과 후 복귀
    expect(snap.components[cyl].cylinderPos).toBe(0);
  });
});

describe("골든 시나리오: A+B+A−B− 시퀀스 (Phase 2 완료 기준)", () => {
  it("START 1회로 A+ → B+ → A− → B− 순서로 한 사이클 실행된다", () => {
    const doc = getExample("a-b-sequence")!.build();
    const start = byName(doc, "elec.pushbutton", "name", "START");
    const cylA = cylinderByLabel(doc, "A");
    const cylB = cylinderByLabel(doc, "B");
    const engine = new SimulationEngine(doc);

    run(engine, 0.3);
    engine.setManual(start, true);
    run(engine, 0.1);
    engine.setManual(start, false);

    // 이벤트 순서 기록
    const events: string[] = [];
    let aHigh = false;
    let bHigh = false;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      const snap = engine.tick(DT);
      const a = snap.components[cylA].cylinderPos!;
      const bPos = snap.components[cylB].cylinderPos!;
      if (a >= 0.99 && !aHigh) {
        aHigh = true;
        events.push("A+");
      }
      if (a <= 0.01 && aHigh) {
        aHigh = false;
        events.push("A-");
      }
      if (bPos >= 0.99 && !bHigh) {
        bHigh = true;
        events.push("B+");
      }
      if (bPos <= 0.01 && bHigh) {
        bHigh = false;
        events.push("B-");
      }
    }

    expect(events).toEqual(["A+", "B+", "A-", "B-"]); // 한 사이클, 재시작 없음
  });
});

describe("Phase 2 예제 검증", () => {
  it("모든 내장 예제는 경고 없이 빌드된다", () => {
    for (const ex of examples) {
      const doc = ex.build();
      const warnings = validateForSimulation(doc);
      expect(warnings, `예제 "${ex.name}"`).toEqual([]);
    }
  });
});
