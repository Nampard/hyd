import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { buildBlankLadderDocument, exampleMode, examples, getExample } from "../../examples";
import { documentMode } from "../../model/mode";
import { SimulationEngine } from "../engine";

beforeAll(() => {
  registerLibraries();
});

const DT = 0.02;
function run(engine: SimulationEngine, seconds: number) {
  let snap = engine.snapshot();
  for (let i = 0; i < Math.round(seconds / DT); i++) snap = engine.tick(DT);
  return snap;
}
const bit = (snap: ReturnType<SimulationEngine["snapshot"]>, d: string) => snap.plc?.bits[d] ?? false;

describe("PLC 래더 모드 (Phase 38)", () => {
  it("부품 없이 래더만 있는 문서는 PLC 래더 모드이고, 예제 5개가 이 모드에 속한다", () => {
    expect(documentMode(buildBlankLadderDocument())).toBe("plc");
    const plcExamples = examples.filter((e) => exampleMode(e) === "plc");
    expect(plcExamples).toHaveLength(5);
    for (const e of plcExamples) expect(documentMode(e.build())).toBe("plc");
  });

  it("자기유지: 시작을 눌렀다 떼도 유지되고, 정지로 꺼진다", () => {
    const engine = new SimulationEngine(getExample("ladder-self-hold")!.build());
    engine.setPlcInput("P00000", true);
    run(engine, 0.1);
    engine.setPlcInput("P00000", false);
    expect(bit(run(engine, 0.2), "P00010")).toBe(true);
    engine.setPlcInput("P00001", true);
    expect(bit(run(engine, 0.1), "P00010")).toBe(false);
  });

  it("온딜레이: 3초 뒤에 두 번째 출력이 켜진다", () => {
    const engine = new SimulationEngine(getExample("ladder-on-delay")!.build());
    engine.setPlcInput("P00008", true);
    let snap = run(engine, 1);
    expect(bit(snap, "P00010")).toBe(true);
    expect(bit(snap, "P00011")).toBe(false);
    snap = run(engine, 2.2);
    expect(bit(snap, "P00011")).toBe(true);
  });

  it("카운터: 세 번 누르면 켜지고 리셋으로 꺼진다", () => {
    const engine = new SimulationEngine(getExample("ladder-counter")!.build());
    for (let n = 0; n < 3; n++) {
      engine.setPlcInput("P00000", true);
      run(engine, 0.1);
      engine.setPlcInput("P00000", false);
      run(engine, 0.1);
    }
    expect(bit(engine.snapshot(), "P00010")).toBe(true);
    engine.setPlcInput("P00001", true);
    expect(bit(run(engine, 0.1), "P00010")).toBe(false);
  });

  it("인터록: 정회전 중에는 역회전이 켜지지 않는다", () => {
    const engine = new SimulationEngine(getExample("ladder-interlock")!.build());
    engine.setPlcInput("P00000", true);
    run(engine, 0.1);
    engine.setPlcInput("P00000", false);
    engine.setPlcInput("P00001", true);
    const snap = run(engine, 0.2);
    expect(bit(snap, "P00010")).toBe(true);
    expect(bit(snap, "P00011")).toBe(false);
  });

  it("I/O 맵에 물린 디바이스는 화면 스위치보다 부품 상태가 우선한다", () => {
    const doc = getExample("automation-basic")!.build();
    const engine = new SimulationEngine(doc);
    engine.setPlcInput("P0000C", false); // 매거진 센서 — 물품이 있으므로 부품 상태(true)가 이긴다
    expect(bit(run(engine, 0.04), "P0000C")).toBe(true);
  });
});

describe("예제(컨베이어) 황램 렁 (Phase 38)", () => {
  it("M00100이 켜져 있으면 _T1S와 무관하게 황램이 계속 켜진다", () => {
    const doc = getExample("automation-basic")!.build();
    const rung = doc.plcProgram!.rungs.find((r) => r.cells[0][0]?.device === "M00101" && r.cells[0].some((c) => c?.device === "P00018"))!;
    // M00100 병렬이 M00101과 _T1S를 함께 건너뛴다 (노드 0 ↔ 노드 2)
    expect(rung.vlinks).toEqual([{ r: 0, c: 0 }, { r: 0, c: 2 }]);
    expect(rung.cells[1][1]?.kind).toBe("hline");
  });
});
