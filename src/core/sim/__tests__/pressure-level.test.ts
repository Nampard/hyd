import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { examples, getExample } from "../../examples";
import { SimulationEngine } from "../engine";
import { validateForSimulation } from "../validate";

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

describe("골든 시나리오: 압력 레벨 + 감압밸브 + 압력 스위치 (Phase 7 완료 기준)", () => {
  it("감압 전 40bar, 감압 후 20bar, 압력 스위치(15bar)가 램프를 켠다", () => {
    const doc = getExample("hyd-reducing")!.build();
    const gauges = doc.components.filter((c) => c.type === "hyd.gauge").map((c) => c.id);
    const lamp = doc.components.find((c) => c.type === "elec.lamp")!.id;
    const engine = new SimulationEngine(doc);

    const snap = run(engine, 0.3);
    const levels = gauges.map((id) => snap.components[id].portLevel?.P ?? 0).sort((a, b) => a - b);
    expect(levels).toEqual([20, 40]); // 감압 후 / 감압 전
    expect(snap.components[lamp].energized).toBe(true);
  });

  it("감압 설정이 스위치 동작 압력보다 낮으면 램프가 꺼진다", () => {
    const doc = getExample("hyd-reducing")!.build();
    const red = doc.components.find((c) => c.type === "hyd.reducing")!;
    const modified = {
      ...doc,
      components: doc.components.map((c) =>
        c.id === red.id ? { ...c, properties: { ...c.properties, pressure: 10 } } : c,
      ),
    };
    const lamp = doc.components.find((c) => c.type === "elec.lamp")!.id;
    const engine = new SimulationEngine(modified);

    const snap = run(engine, 0.3);
    expect(snap.components[lamp].energized).toBe(false); // 10bar < 15bar 임계
  });

  it("공압원 압력 레벨도 전파된다 (직접 제어 예제, 6bar)", () => {
    const doc = getExample("direct-single")!.build();
    const valve = doc.components.find((c) => c.type === "pneu.valve.3-2-manual")!.id;
    const engine = new SimulationEngine(doc);
    const snap = run(engine, 0.2);
    expect(snap.components[valve].portLevel?.P).toBe(6);
  });

  it("모든 내장 예제는 경고 없이 빌드된다", () => {
    for (const ex of examples) {
      const warnings = validateForSimulation(ex.build());
      expect(warnings, `예제 "${ex.name}"`).toEqual([]);
    }
  });
});
