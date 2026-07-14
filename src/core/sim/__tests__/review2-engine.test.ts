import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { getExample } from "../../examples";
import { SimulationEngine } from "../engine";
import { validateForSimulation } from "../validate";
import { addComponent, autoWire, updateComponentProperty } from "../../model/operations";
import { createEmptyDocument, type CircuitDocument } from "../../model/types";

/**
 * review-2 P0 엔진 회귀: 오픈 센터 언로딩 · 이름표 채널 분리 · 수렴 진단.
 */

beforeAll(() => {
  registerLibraries();
});

const DT = 0.02;

function run(engine: SimulationEngine, seconds: number) {
  let snap = engine.snapshot();
  for (let i = 0; i < Math.round(seconds / DT); i++) snap = engine.tick(DT);
  return snap;
}

type Built = { doc: CircuitDocument; ids: Record<string, string> };

/** addComponent/autoWire로 회로를 조립하는 소형 빌더 */
function build(
  parts: Record<string, string>,
  wires: [string, string, string, string][],
  props: [string, string, unknown][] = [],
): Built {
  let doc = createEmptyDocument("review2 테스트");
  const ids: Record<string, string> = {};
  let x = 0;
  for (const [key, type] of Object.entries(parts)) {
    const r = addComponent(doc, type, { x: (x += 200), y: 200 });
    doc = r.doc;
    ids[key] = r.component.id;
  }
  for (const [key, propKey, value] of props) {
    doc = updateComponentProperty(doc, ids[key], propKey, value);
  }
  for (const [a, pa, b, pb] of wires) {
    doc = autoWire(doc, { componentId: ids[a], portId: pa }, { componentId: ids[b], portId: pb });
  }
  return { doc, ids };
}

describe("P0: 4/3 오픈 센터 언로딩", () => {
  function openCenterCircuit(): Built {
    return build(
      {
        pump: "hyd.power-unit",
        valve: "hyd.valve.4-3-open-solenoid",
        cyl: "hyd.cylinder.double",
        v24: "elec.supply-24v",
        v0: "elec.supply-0v",
        pb: "elec.pushbutton",
        sol: "elec.solenoid",
      },
      [
        ["pump", "P", "valve", "P"],
        ["pump", "T", "valve", "T"],
        ["valve", "A", "cyl", "HEAD"],
        ["valve", "B", "cyl", "ROD"],
        ["v24", "P", "pb", "T"],
        ["pb", "B", "sol", "T"],
        ["sol", "B", "v0", "P"],
      ],
      [["sol", "label", "Y1"]],
    );
  }

  it("중립: 펌프·밸브·실린더 라인 전체가 무부하(배기)이고 40bar로 가압되지 않는다", () => {
    const { doc, ids } = openCenterCircuit();
    const engine = new SimulationEngine(doc);
    const snap = run(engine, 0.3);
    const valve = snap.components[ids.valve];
    for (const port of ["P", "A", "B", "T"]) {
      expect(valve.portState[port], `valve.${port}`).toBe("exhausted");
      expect(valve.portLevel?.[port] ?? 0, `valve.${port} level`).toBe(0);
    }
    const cyl = snap.components[ids.cyl];
    expect(cyl.portState.HEAD).toBe("exhausted");
    expect(cyl.portState.ROD).toBe("exhausted");
    expect(cyl.cylinderPos).toBe(0); // 양측 무부하 — 움직이지 않음
  });

  it("좌측 솔레노이드 통전 시 P→A 가압으로 전환되어 실린더가 전진한다", () => {
    const { doc, ids } = openCenterCircuit();
    const engine = new SimulationEngine(doc);
    engine.setManual(ids.pb, true);
    const snap = run(engine, 3);
    expect(snap.components[ids.valve].portState.A).toBe("pressurized");
    expect(snap.components[ids.cyl].cylinderPos).toBe(1);
    engine.setManual(ids.pb, false);
    const after = run(engine, 0.3);
    // 중립 복귀 → 다시 무부하
    expect(after.components[ids.valve].portState.P).toBe("exhausted");
  });
});

describe("P0: 이름표 채널 분리 (솔레노이드 vs 릴레이)", () => {
  it("솔레노이드 K1 통전이 릴레이 접점 K1을 닫지 않는다", () => {
    // PB1 → 솔레노이드(K1) 통전. 릴레이 코일 K1은 PB2(안 누름)에 물려 있음.
    // 릴레이 접점 K1 → 램프: 솔레노이드와 릴레이가 이름표만 공유해도 램프는 꺼져 있어야 한다.
    const { doc, ids } = build(
      {
        v24: "elec.supply-24v",
        v0: "elec.supply-0v",
        pb1: "elec.pushbutton",
        sol: "elec.solenoid",
        pb2: "elec.pushbutton",
        coil: "elec.relay-coil",
        contact: "elec.relay-contact",
        lamp: "elec.lamp",
      },
      [
        ["v24", "P", "pb1", "T"],
        ["pb1", "B", "sol", "T"],
        ["sol", "B", "v0", "P"],
        ["v24", "P", "pb2", "T"],
        ["pb2", "B", "coil", "T"],
        ["coil", "B", "v0", "P"],
        ["v24", "P", "contact", "T"],
        ["contact", "B", "lamp", "T"],
        ["lamp", "B", "v0", "P"],
      ],
      [
        ["sol", "label", "K1"],
        ["coil", "label", "K1"],
        ["contact", "deviceLabel", "K1"],
        ["pb2", "name", "PB2"],
      ],
    );

    // 실행 전 검증이 종류 간 이름표 공유를 경고한다
    const warnings = validateForSimulation(doc);
    expect(warnings.some((w) => w.includes('"K1"') && w.includes("공유"))).toBe(true);

    const engine = new SimulationEngine(doc);
    engine.setManual(ids.pb1, true); // 솔레노이드 K1만 통전
    const snap = run(engine, 0.3);
    expect(snap.components[ids.sol].energized).toBe(true);
    expect(snap.components[ids.lamp].energized).toBe(false); // 릴레이 K1은 여전히 OFF

    engine.setManual(ids.pb2, true); // 진짜 릴레이 코일 K1 통전
    const snap2 = run(engine, 0.3);
    expect(snap2.components[ids.lamp].energized).toBe(true);
  });
});

describe("P0: 수렴 진단", () => {
  it("NC 접점이 자신의 코일을 구동하는 발진 회로는 electricConverged=false로 보고된다", () => {
    const { doc } = build(
      {
        v24: "elec.supply-24v",
        v0: "elec.supply-0v",
        nc: "elec.relay-contact",
        coil: "elec.relay-coil",
      },
      [
        ["v24", "P", "nc", "T"],
        ["nc", "B", "coil", "T"],
        ["coil", "B", "v0", "P"],
      ],
      [
        ["nc", "deviceLabel", "K1"],
        ["nc", "contactType", "NC"],
        ["coil", "label", "K1"],
      ],
    );
    const engine = new SimulationEngine(doc);
    // 예외 없이 실행되고, 미수렴이 진단에 드러난다
    let snap = engine.snapshot();
    expect(() => {
      snap = run(engine, 0.2);
    }).not.toThrow();
    expect(snap.diagnostics?.electricConverged).toBe(false);
  });

  it("정상 예제는 수렴 진단이 모두 true다", () => {
    const doc = getExample("self-holding")!.build();
    const engine = new SimulationEngine(doc);
    const snap = run(engine, 0.3);
    expect(snap.diagnostics?.electricConverged).toBe(true);
    expect(snap.diagnostics?.fluidConverged).toBe(true);
  });
});
