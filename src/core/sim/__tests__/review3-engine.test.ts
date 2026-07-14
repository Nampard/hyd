import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { SimulationEngine } from "../engine";
import { StepController } from "../step-controller";
import { validateForSimulation } from "../validate";
import { addComponent, autoWire, updateComponentProperty } from "../../model/operations";
import { createEmptyDocument, type CircuitDocument } from "../../model/types";
import type { SimulationSnapshot } from "../types";

/**
 * codex-review-3 P0 회귀: 다실린더 사이클 상태기계 · 릴리프 최종 상태 활성 ·
 * 디바이스 typed identity 순서 무관성.
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

function build(
  parts: Record<string, string>,
  wires: [string, string, string, string][],
  props: [string, string, unknown][] = [],
): Built {
  let doc = createEmptyDocument("review3 테스트");
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

describe("P0: 다실린더 사이클 참여 상태기계 (A+A−B+B−)", () => {
  /** 두 실린더 문서 + 합성 스냅숏으로 StepController만 단위 검증 */
  function twoCylinderSetup() {
    const { doc, ids } = build({ a: "pneu.cylinder.double", b: "pneu.cylinder.double" }, []);
    const controller = new StepController(doc);
    let time = 0;
    const snap = (posA: number, posB: number): SimulationSnapshot => ({
      time: (time += 0.05),
      components: {
        [ids.a]: { cylinderPos: posA, portState: {} },
        [ids.b]: { cylinderPos: posB, portState: {} },
      },
      wires: {},
    });
    /** 한 동작을 관찰시키고 마지막 경계를 반환 */
    const motion = (frames: [number, number][]) => {
      let boundary = null;
      for (const [pa, pb] of frames) {
        if (controller.observe(snap(pa, pb)) === "pause") {
          boundary = controller.boundaries().at(-1)!;
        }
      }
      return boundary;
    };
    return { controller, motion };
  }

  const ramp = (from: number, to: number, other: number, otherFirst = false): [number, number][] =>
    Array.from({ length: 6 }, (_, i) => {
      const v = from + ((to - from) * (i + 1)) / 6;
      return otherFirst ? [other, v] : [v, other];
    });

  it("A− 직후에는 B가 아직 움직이지 않았으므로 사이클 완료가 아니다", () => {
    const { motion } = twoCylinderSetup();
    const b1 = motion(ramp(0, 1, 0)); // A+
    expect(b1).toMatchObject({ step: 1, cycleComplete: false });
    const b2 = motion(ramp(1, 0, 0)); // A− — 모두 초기 위치지만 B 미참여
    expect(b2).toMatchObject({ step: 2, cycleComplete: false }); // review-3 반례 수정
    const b3 = motion(ramp(0, 1, 0, true)); // B+
    expect(b3).toMatchObject({ step: 3, cycleComplete: false });
    const b4 = motion(ramp(1, 0, 0, true)); // B− — 이제 A·B 모두 참여 후 복귀
    expect(b4).toMatchObject({ step: 4, cycleComplete: true });
  });

  it("사이클 완료 후 참여 추적이 리셋된다 (다음 사이클도 전원 참여 필요)", () => {
    const { motion } = twoCylinderSetup();
    motion(ramp(0, 1, 0)); // A+
    motion(ramp(1, 0, 0)); // A−
    motion(ramp(0, 1, 0, true)); // B+
    const cycle = motion(ramp(1, 0, 0, true)); // B− → 사이클
    expect(cycle!.cycleComplete).toBe(true);
    // 2사이클째: A만 왕복하면 사이클이 아니다
    motion(ramp(0, 1, 0)); // A+
    const b6 = motion(ramp(1, 0, 0)); // A−
    expect(b6!.cycleComplete).toBe(false);
  });
});

describe("P0: 릴리프 활성은 최종 상태 기준", () => {
  it("공급압 = 설정압(초과분 없음)이면 활성이 아니다", () => {
    const { doc, ids } = build(
      { pump: "hyd.power-unit", relief: "hyd.relief", tank: "hyd.tank" },
      [
        ["pump", "P", "relief", "P"],
        ["relief", "T", "tank", "T"],
      ],
      [
        ["pump", "pressure", 40],
        ["relief", "pressure", 40],
      ],
    );
    const snap = run(new SimulationEngine(doc), 0.2);
    expect(snap.components[ids.relief].reliefActive).toBe(false);
    expect(snap.components[ids.relief].portState.P).toBe("pressurized");
    expect(snap.components[ids.relief].portLevel?.P).toBe(40);
  });

  it("공급압 > 설정압이면 활성이고 라인은 설정압으로 제한된다", () => {
    const { doc, ids } = build(
      { pump: "hyd.power-unit", relief: "hyd.relief", tank: "hyd.tank" },
      [
        ["pump", "P", "relief", "P"],
        ["relief", "T", "tank", "T"],
      ],
      [
        ["pump", "pressure", 60],
        ["relief", "pressure", 40],
      ],
    );
    const snap = run(new SimulationEngine(doc), 0.2);
    expect(snap.components[ids.relief].reliefActive).toBe(true);
    expect(snap.components[ids.relief].portLevel?.P).toBe(40);
  });

  it("오픈 센터 언로딩(0 bar) 라인에서는 활성이 아니다", () => {
    const { doc, ids } = build(
      {
        pump: "hyd.power-unit",
        tee: "hyd.tee",
        relief: "hyd.relief",
        valve: "hyd.valve.4-3-open-solenoid",
        tank: "hyd.tank",
        rtank: "hyd.tank",
      },
      [
        ["pump", "P", "tee", "1"],
        ["tee", "2", "valve", "P"],
        ["tee", "3", "relief", "P"],
        ["relief", "T", "rtank", "T"],
        ["pump", "T", "valve", "T"],
      ],
      [
        ["pump", "pressure", 60],
        ["relief", "pressure", 40],
      ],
      // valve A/B는 미배선 — 중립 오픈 센터에서 P가 T로 언로딩
    );
    void ids.tank;
    const snap = run(new SimulationEngine(doc), 0.2);
    expect(snap.components[ids.relief].portState.P).toBe("exhausted"); // 언로딩
    expect(snap.components[ids.relief].reliefActive).toBe(false); // 0 bar에서 열림 표시 금지
  });

  it("설정압이 다른 릴리프 두 개: 낮은 쪽만 활성, 높은 쪽은 비활성", () => {
    const { doc, ids } = build(
      {
        pump: "hyd.power-unit",
        tee: "hyd.tee",
        low: "hyd.relief",
        high: "hyd.relief",
        t1: "hyd.tank",
        t2: "hyd.tank",
      },
      [
        ["pump", "P", "tee", "1"],
        ["tee", "2", "low", "P"],
        ["tee", "3", "high", "P"],
        ["low", "T", "t1", "T"],
        ["high", "T", "t2", "T"],
      ],
      [
        ["pump", "pressure", 60],
        ["low", "pressure", 40],
        ["high", "pressure", 50],
      ],
    );
    const snap = run(new SimulationEngine(doc), 0.2);
    expect(snap.components[ids.low].reliefActive).toBe(true);
    expect(snap.components[ids.high].reliefActive).toBe(false); // 40 bar로 잡힌 라인 — 50은 닫힘
    expect(snap.components[ids.low].portLevel?.P).toBe(40);
  });
});

describe("P0: 디바이스 typed identity — 문서 순서 무관", () => {
  /** 같은 T1 이름표의 타이머 코일 2개(설정 1s/2s) — 순서를 바꿔도 동작이 같아야 한다 */
  function timerDoc(reversed: boolean): Built {
    const parts: Record<string, string> = reversed
      ? { v24: "elec.supply-24v", v0: "elec.supply-0v", pb: "elec.pushbutton", t2: "elec.timer", t1: "elec.timer", contact: "elec.relay-contact", lamp: "elec.lamp" }
      : { v24: "elec.supply-24v", v0: "elec.supply-0v", pb: "elec.pushbutton", t1: "elec.timer", t2: "elec.timer", contact: "elec.relay-contact", lamp: "elec.lamp" };
    return build(
      parts,
      [
        ["v24", "P", "pb", "T"],
        ["pb", "B", "t1", "T"],
        ["t1", "B", "v0", "P"],
        ["pb", "B", "t2", "T"],
        ["t2", "B", "v0", "P"],
        ["v24", "P", "contact", "T"],
        ["contact", "B", "lamp", "T"],
        ["lamp", "B", "v0", "P"],
      ],
      [
        ["t1", "label", "T1"],
        ["t1", "preset", 1],
        ["t2", "label", "T1"],
        ["t2", "preset", 2],
        ["contact", "deviceLabel", "T1"],
      ],
    );
  }

  it.each([false, true])("컴포넌트 순서 반전=%s에서도 동일 동작 (max preset 2s)", (reversed) => {
    const { doc, ids } = timerDoc(reversed);
    // 설정 충돌 경고가 나온다
    expect(validateForSimulation(doc).some((w) => w.includes("설정값이 코일마다"))).toBe(true);

    const engine = new SimulationEngine(doc);
    engine.setManual(ids.pb, true);
    const at1_5 = run(engine, 1.5);
    expect(at1_5.components[ids.lamp].energized).toBe(false); // 1s 아님 — max(1,2)=2s 적용
    const at2_5 = run(engine, 1.0);
    expect(at2_5.components[ids.lamp].energized).toBe(true);
  });
});
