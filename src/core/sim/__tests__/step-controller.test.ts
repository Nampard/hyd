import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { getExample } from "../../examples";
import { SimulationEngine } from "../engine";
import { StepController } from "../step-controller";
import type { CircuitDocument } from "../../model/types";

/**
 * Phase 11 구분동작 실행 골든 테스트.
 * A+A− 예제를 스텝 모드로 실행: 클릭(재개)마다 동작이 하나씩 진행되고
 * 실린더가 초기 위치로 복귀하는 경계는 사이클 완료로 표시된다.
 */

beforeAll(() => {
  registerLibraries();
});

const DT = 0.02;

/** 일시정지를 흉내 내며 다음 경계까지 실행. 경계 없이 maxSeconds가 지나면 null */
function runUntilBoundary(
  engine: SimulationEngine,
  controller: StepController,
  maxSeconds: number,
): { time: number; step: number; cycleComplete: boolean } | null {
  for (let i = 0; i < Math.round(maxSeconds / DT); i++) {
    const snap = engine.tick(DT);
    if (controller.observe(snap) === "pause") {
      return controller.boundaries()[controller.boundaries().length - 1];
    }
  }
  return null;
}

function findByType(doc: CircuitDocument, type: string): string[] {
  return doc.components.filter((c) => c.type === type).map((c) => c.id);
}

describe("Phase 11: 구분동작 실행 (완료 기준)", () => {
  it("A+A−: 경계마다 동작이 하나씩 완료되고, A− 경계는 사이클 완료로 표시된다", () => {
    const doc = getExample("auto-reciprocate")!.build();
    const [start] = findByType(doc, "pneu.valve.3-2-manual");
    const [cyl] = findByType(doc, "pneu.cylinder.double");
    const engine = new SimulationEngine(doc);
    const controller = new StepController(doc);
    expect(controller.hasCylinders()).toBe(true);

    engine.setManual(start, true); // 시작 레버 ON → 자동 왕복 시작

    // 동작 1: A+ (전진 완료에서 일시정지)
    const b1 = runUntilBoundary(engine, controller, 5);
    expect(b1).not.toBeNull();
    expect(b1!.step).toBe(1);
    expect(b1!.cycleComplete).toBe(false);
    expect(engine.snapshot().components[cyl].cylinderPos).toBe(1);

    // 동작 2: A− (후진 완료 — 초기 위치 복귀 = 사이클 완료)
    const b2 = runUntilBoundary(engine, controller, 5);
    expect(b2).not.toBeNull();
    expect(b2!.step).toBe(2);
    expect(b2!.cycleComplete).toBe(true); // 마지막 동작 → 처음 동작 전환 지점
    expect(engine.snapshot().components[cyl].cylinderPos).toBe(0);

    // 다음 사이클의 동작 3: 다시 A+
    const b3 = runUntilBoundary(engine, controller, 5);
    expect(b3!.step).toBe(3);
    expect(b3!.cycleComplete).toBe(false);
  });

  it("A+B+A−B−: 4개 동작 경계가 순서대로 생기고 마지막(B−)만 사이클 완료다", () => {
    const doc = getExample("a-b-sequence")!.build();
    const start = doc.components.find(
      (c) => c.type === "elec.pushbutton" && c.properties.name === "START",
    )!.id;
    const engine = new SimulationEngine(doc);
    const controller = new StepController(doc);

    // START 펄스
    engine.setManual(start, true);
    for (let i = 0; i < 5; i++) controller.observe(engine.tick(DT));
    engine.setManual(start, false);

    const flags: boolean[] = [];
    for (let k = 0; k < 4; k++) {
      const b = runUntilBoundary(engine, controller, 5);
      expect(b, `동작 ${k + 1} 경계`).not.toBeNull();
      flags.push(b!.cycleComplete);
    }
    expect(flags).toEqual([false, false, false, true]); // A+ B+ A− B−(사이클)
  });

  it("실린더가 움직이지 않으면 경계가 발생하지 않는다", () => {
    const doc = getExample("direct-single")!.build();
    const engine = new SimulationEngine(doc);
    const controller = new StepController(doc);
    // 버튼을 누르지 않음 — 움직임 없음
    const b = runUntilBoundary(engine, controller, 1);
    expect(b).toBeNull();
  });

  it("중간 정지(조그)도 동작 경계로 취급한다", () => {
    const doc = getExample("hyd-43-electric")!.build();
    const up = doc.components.find(
      (c) => c.type === "elec.pushbutton" && c.properties.name === "UP",
    )!.id;
    const engine = new SimulationEngine(doc);
    const controller = new StepController(doc);

    // UP을 1초만 누르고 뗌 (행정 2초 → 중간 정지)
    engine.setManual(up, true);
    let boundary = null;
    for (let i = 0; i < Math.round(1 / DT); i++) {
      const snap = engine.tick(DT);
      if (controller.observe(snap) === "pause") boundary = controller.boundaries().at(-1);
    }
    engine.setManual(up, false);
    expect(boundary).toBeNull(); // 아직 운동 중
    boundary = runUntilBoundary(engine, controller, 2);
    expect(boundary).not.toBeNull(); // 중간 정지 경계
    expect(boundary!.cycleComplete).toBe(false);
  });
});
