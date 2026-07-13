import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { getExample } from "../../examples";
import { SimulationEngine } from "../engine";
import { DisplacementRecorder } from "../recorder";

beforeAll(() => {
  registerLibraries();
});

const DT = 0.02;

describe("변위단계선도 레코더 (Phase 6 완료 기준)", () => {
  it("A+B+A−B− 실행 시 두 실린더의 계단 파형이 순서대로 기록된다", () => {
    const doc = getExample("a-b-sequence")!.build();
    const start = doc.components.find(
      (c) => c.type === "elec.pushbutton" && c.properties.name === "START",
    )!.id;
    const engine = new SimulationEngine(doc);
    const recorder = new DisplacementRecorder(doc);
    expect(recorder.hasCylinders()).toBe(true);
    expect(recorder.tracks().map((t) => t.label).sort()).toEqual(["A", "B"]);

    engine.setManual(start, true);
    for (let i = 0; i < Math.round(8 / DT); i++) {
      const snap = engine.tick(DT);
      if (i === 5) engine.setManual(start, false);
      recorder.record(snap);
    }

    // 파형에서 상승 도달(≥0.99) 시각 추출
    const reachTime = (label: string, target: number) => {
      const track = recorder.tracks().find((t) => t.label === label)!;
      const hit = track.points.find((p) =>
        target === 1 ? p.pos >= 0.99 : p.pos <= 0.01 && p.t > 1,
      );
      return hit?.t ?? Infinity;
    };

    const aUp = reachTime("A", 1);
    const bUp = reachTime("B", 1);
    const aDown = reachTime("A", 0);
    const bDown = reachTime("B", 0);

    expect(aUp).toBeLessThan(bUp);
    expect(bUp).toBeLessThan(aDown);
    expect(aDown).toBeLessThan(bDown);
    expect(bDown).toBeLessThan(Infinity);

    // 계단 특성: 각 트랙에 0↔1 왕복 파형 존재 + endTime 기록
    expect(recorder.endTime()).toBeGreaterThan(7);
    recorder.clear();
    expect(recorder.endTime()).toBe(0);
  });
});
