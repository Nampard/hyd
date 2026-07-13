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

function findByType(doc: CircuitDocument, type: string): string[] {
  return doc.components.filter((c) => c.type === type).map((c) => c.id);
}

describe("골든 시나리오: 직접 제어 (단동 실린더)", () => {
  it("버튼을 누르면 전진, 놓으면 스프링 복귀한다", () => {
    const doc = getExample("direct-single")!.build();
    const [cyl] = findByType(doc, "pneu.cylinder.single");
    const [valve] = findByType(doc, "pneu.valve.3-2-manual");
    const engine = new SimulationEngine(doc);

    // 초기: 후진
    let snap = run(engine, 0.5);
    expect(snap.components[cyl].cylinderPos).toBe(0);

    // 버튼 누름 → 1초(행정시간) 후 전진 완료
    engine.setManual(valve, true);
    snap = run(engine, 1.5);
    expect(snap.components[cyl].cylinderPos).toBe(1);

    // 버튼 뗌 → 배기 → 스프링 복귀
    engine.setManual(valve, false);
    snap = run(engine, 1.5);
    expect(snap.components[cyl].cylinderPos).toBe(0);
  });
});

describe("골든 시나리오: 5/2 밸브 복동 실린더", () => {
  it("레버 토글로 전진/후진하고, 배관 가압 상태가 색상용으로 보고된다", () => {
    const doc = getExample("direct-double")!.build();
    const [cyl] = findByType(doc, "pneu.cylinder.double");
    const [valve] = findByType(doc, "pneu.valve.5-2-manual");
    const engine = new SimulationEngine(doc);

    let snap = run(engine, 0.3);
    expect(snap.components[cyl].cylinderPos).toBe(0);

    engine.setManual(valve, true); // 레버 ON → P→A → 전진
    snap = run(engine, 1.5);
    expect(snap.components[cyl].cylinderPos).toBe(1);
    // 가압/배기 배관이 모두 존재해야 함
    const states = Object.values(snap.wires);
    expect(states).toContain("pressurized");
    expect(states).toContain("exhausted");

    engine.setManual(valve, false); // 레버 OFF → P→B → 후진
    snap = run(engine, 1.5);
    expect(snap.components[cyl].cylinderPos).toBe(0);
  });
});

describe("골든 시나리오: 속도 제어 (미터아웃)", () => {
  it("교축 개도만큼 전진이 느려진다", () => {
    const doc = getExample("speed-control")!.build();
    const [cyl] = findByType(doc, "pneu.cylinder.double");
    const [valve] = findByType(doc, "pneu.valve.5-2-manual");
    const engine = new SimulationEngine(doc);

    engine.setManual(valve, true);
    // 개도 0.3 → 전 행정 1초/0.3 ≈ 3.3초. 1.5초 시점엔 중간쯤이어야 함
    let snap = run(engine, 1.5);
    const mid = snap.components[cyl].cylinderPos!;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);

    snap = run(engine, 3);
    expect(snap.components[cyl].cylinderPos).toBe(1);
  });
});

describe("골든 시나리오: OR / AND 논리", () => {
  it("셔틀밸브: 한쪽 버튼만으로 전진한다", () => {
    const doc = getExample("or-circuit")!.build();
    const [cyl] = findByType(doc, "pneu.cylinder.single");
    const [v1] = findByType(doc, "pneu.valve.3-2-manual");
    const engine = new SimulationEngine(doc);

    engine.setManual(v1, true);
    const snap = run(engine, 1.5);
    expect(snap.components[cyl].cylinderPos).toBe(1);
  });

  it("2압밸브: 한쪽만 누르면 안 움직이고, 양쪽을 눌러야 전진한다", () => {
    const doc = getExample("and-circuit")!.build();
    const [cyl] = findByType(doc, "pneu.cylinder.single");
    const [v1, v2] = findByType(doc, "pneu.valve.3-2-manual");
    const engine = new SimulationEngine(doc);

    engine.setManual(v1, true);
    let snap = run(engine, 1);
    expect(snap.components[cyl].cylinderPos).toBe(0);

    engine.setManual(v2, true);
    snap = run(engine, 1.5);
    expect(snap.components[cyl].cylinderPos).toBe(1);
  });
});

describe("골든 시나리오: 간접 제어 (파일럿)", () => {
  it("버튼 밸브 출력이 5/2 편측 파일럿을 전환한다", () => {
    const doc = getExample("indirect-pilot")!.build();
    const [cyl] = findByType(doc, "pneu.cylinder.double");
    const [btn] = findByType(doc, "pneu.valve.3-2-manual");
    const engine = new SimulationEngine(doc);

    let snap = run(engine, 0.3);
    expect(snap.components[cyl].cylinderPos).toBe(0);

    engine.setManual(btn, true);
    snap = run(engine, 1.5);
    expect(snap.components[cyl].cylinderPos).toBe(1);

    // 버튼 뗌 → 스프링 복귀 → 후진
    engine.setManual(btn, false);
    snap = run(engine, 1.5);
    expect(snap.components[cyl].cylinderPos).toBe(0);
  });
});

describe("골든 시나리오: 임펄스 밸브 메모리", () => {
  it("양측 파일럿 밸브는 신호가 사라져도 위치를 유지한다", () => {
    const doc = getExample("auto-reciprocate")!.build();
    const [main] = findByType(doc, "pneu.valve.5-2-double-pilot");
    const engine = new SimulationEngine(doc);
    const snap = run(engine, 0.5);
    // 시작 레버 OFF — 파일럿 무신호에도 초기 위치(1) 유지
    expect(snap.components[main].valvePosition).toBe(1);
  });
});

describe("골든 시나리오: A+A− 자동 왕복 (Phase 1 완료 기준)", () => {
  it("시작 레버를 켜면 실린더가 자동 왕복하고, 끄면 멈춘다", () => {
    const doc = getExample("auto-reciprocate")!.build();
    const [cyl] = findByType(doc, "pneu.cylinder.double");
    const [start] = findByType(doc, "pneu.valve.3-2-manual");
    const engine = new SimulationEngine(doc);

    engine.setManual(start, true); // 시작 레버 ON

    // 10초 동안 위치 기록 — 왕복 횟수 측정
    let extends_ = 0;
    let retracts = 0;
    let prev = 0;
    let wasHigh = false;
    for (let i = 0; i < Math.round(10 / DT); i++) {
      const snap = engine.tick(DT);
      const pos = snap.components[cyl].cylinderPos!;
      if (pos >= 0.99 && !wasHigh) {
        extends_ += 1;
        wasHigh = true;
      }
      if (pos <= 0.01 && wasHigh) {
        retracts += 1;
        wasHigh = false;
      }
      prev = pos;
    }
    void prev;
    // 행정 1초 → 10초면 왕복 4~5회
    expect(extends_).toBeGreaterThanOrEqual(3);
    expect(retracts).toBeGreaterThanOrEqual(3);

    // 시작 레버 OFF → 사이클 정지 (후진단에서 멈춤)
    engine.setManual(start, false);
    const snap = run(engine, 3);
    const pos = snap.components[cyl].cylinderPos!;
    // 마지막 후진 후 재전진하지 않음
    const snap2 = run(engine, 2);
    expect(snap2.components[cyl].cylinderPos).toBe(pos);
  });
});

describe("실행 전 검증", () => {
  it("모든 내장 예제는 경고 없이 빌드된다", () => {
    for (const ex of examples) {
      const doc = ex.build();
      const warnings = validateForSimulation(doc);
      expect(warnings, `예제 "${ex.name}"`).toEqual([]);
    }
  });

  it("공압원이 없으면 경고한다", () => {
    const doc = getExample("direct-single")!.build();
    const noSource: CircuitDocument = {
      ...doc,
      components: doc.components.filter((c) => c.type !== "pneu.source"),
      wires: doc.wires.filter((w) =>
        doc.components
          .filter((c) => c.type !== "pneu.source")
          .some((c) => c.id === w.from.componentId) &&
        doc.components
          .filter((c) => c.type !== "pneu.source")
          .some((c) => c.id === w.to.componentId),
      ),
    };
    const warnings = validateForSimulation(noSource);
    expect(warnings.some((w) => w.includes("공압원"))).toBe(true);
  });
});
