import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { createEmptyDocument } from "../../model/types";
import type { CircuitDocument } from "../../model/types";
import { addComponent, autoWire } from "../../model/operations";
import { SimulationEngine } from "../engine";

/**
 * codex-review 유체 솔버 결함 회귀 테스트
 * (H6 릴리프, 셔틀 역급기, 2압밸브 압력 레벨, 탠덤 센터 언로딩, 감압밸브 역방향)
 */

beforeAll(() => {
  registerLibraries();
});

const DT = 0.02;

interface B {
  doc: CircuitDocument;
  place(type: string, x: number, y: number, props?: Record<string, unknown>): string;
  wire(aId: string, aPort: string, bId: string, bPort: string): void;
}

function builder(): B {
  const b: B = {
    doc: createEmptyDocument("솔버 테스트"),
    place(type, x, y, props) {
      const r = addComponent(b.doc, type, { x, y });
      b.doc = r.doc;
      if (props) {
        b.doc = {
          ...b.doc,
          components: b.doc.components.map((c) =>
            c.id === r.component.id ? { ...c, properties: { ...c.properties, ...props } } : c,
          ),
        };
      }
      return r.component.id;
    },
    wire(aId, aPort, bId, bPort) {
      const before = b.doc.wires.length;
      b.doc = autoWire(b.doc, { componentId: aId, portId: aPort }, { componentId: bId, portId: bPort });
      if (b.doc.wires.length === before) throw new Error(`배선 실패: ${aPort}→${bPort}`);
    },
  };
  return b;
}

function run(engine: SimulationEngine, seconds: number) {
  let snap = engine.snapshot();
  for (let i = 0; i < Math.round(seconds / DT); i++) snap = engine.tick(DT);
  return snap;
}

describe("H6: 릴리프 밸브", () => {
  /** 40bar 파워유닛 → T분기 → (게이지 / 릴리프 P), 릴리프 T → 탱크 */
  function reliefCircuit(setpoint: number, wireTank: boolean) {
    const b = builder();
    const pu = b.place("hyd.power-unit", 200, 400, { pressure: 40 });
    const tee = b.place("hyd.tee", 200, 300);
    const gauge = b.place("hyd.gauge", 120, 240);
    const relief = b.place("hyd.relief", 300, 240, { pressure: setpoint });
    const tk = b.place("hyd.tank", 400, 340);
    b.wire(pu, "P", tee, "3");
    b.wire(tee, "1", gauge, "P");
    b.wire(tee, "2", relief, "P");
    if (wireTank) b.wire(relief, "T", tk, "T");
    return { b, gauge, relief };
  }

  it("설정 20bar: 라인 압력이 20bar로 제한된다", () => {
    const { b, gauge } = reliefCircuit(20, true);
    const snap = run(new SimulationEngine(b.doc), 0.2);
    expect(snap.components[gauge].portLevel?.P).toBe(20);
  });

  it("설정 80bar: 공급압 40bar 그대로 유지된다 (릴리프 비작동)", () => {
    const { b, gauge } = reliefCircuit(80, true);
    const snap = run(new SimulationEngine(b.doc), 0.2);
    expect(snap.components[gauge].portLevel?.P).toBe(40);
  });

  it("탱크 미연결이면 릴리프가 작동하지 않는다", () => {
    const { b, gauge } = reliefCircuit(20, false);
    const snap = run(new SimulationEngine(b.doc), 0.2);
    expect(snap.components[gauge].portLevel?.P).toBe(40);
  });

  it("설정 20bar와 80bar의 결과가 서로 달라야 한다 (no-op 회귀 방지)", () => {
    const low = run(new SimulationEngine(reliefCircuit(20, true).b.doc), 0.2);
    const high = run(new SimulationEngine(reliefCircuit(80, true).b.doc), 0.2);
    const levelOf = (snap: typeof low) =>
      Object.values(snap.components)
        .map((c) => c.portLevel?.P ?? 0)
        .reduce((a, v) => Math.max(a, v), 0);
    expect(levelOf(low)).not.toBe(levelOf(high));
  });
});

describe("셔틀밸브 역급기 금지", () => {
  it("X1만 가압하면 X2측 회로는 가압되지 않는다", () => {
    const b = builder();
    const src = b.place("pneu.source", 100, 400, { pressure: 6 });
    const shuttle = b.place("pneu.shuttle", 200, 300);
    const gauge = b.place("hyd.gauge", 300, 200); // 레벨 확인용 (kind 불일치 없는 유압 게이지 대신 포트 상태로 검사)
    void gauge;
    const cyl = b.place("pneu.cylinder.single", 200, 150);
    b.wire(src, "P", shuttle, "X1");
    b.wire(shuttle, "A", cyl, "HEAD");
    // X2는 배선하지 않음 (막힌 입력측 라인 대용으로 자체 포트 상태 확인)
    const snap = run(new SimulationEngine(b.doc), 1.5);
    expect(snap.components[shuttle].portState.X1).toBe("pressurized");
    expect(snap.components[shuttle].portState.A).toBe("pressurized");
    expect(snap.components[shuttle].portState.X2).not.toBe("pressurized"); // 역급기 금지
    expect(snap.components[cyl].cylinderPos).toBe(1);
  });
});

describe("2압밸브 압력 레벨", () => {
  it("6bar와 2bar 입력이 모두 켜지면 출력은 낮은 쪽 2bar", () => {
    const b = builder();
    const srcHigh = b.place("pneu.source", 100, 400, { pressure: 6 });
    const srcLow = b.place("pneu.source", 300, 400, { pressure: 2 });
    const and = b.place("pneu.two-pressure", 200, 300);
    const cyl = b.place("pneu.cylinder.single", 200, 150);
    b.wire(srcHigh, "P", and, "X1");
    b.wire(srcLow, "P", and, "X2");
    b.wire(and, "A", cyl, "HEAD");
    const snap = run(new SimulationEngine(b.doc), 0.5);
    expect(snap.components[and].portState.A).toBe("pressurized");
    expect(snap.components[and].portLevel?.A).toBe(2);
  });
});

describe("탠덤 센터 언로딩 상태", () => {
  it("중립에서 탱크 귀환 라인은 가압이 아니라 배출(언로딩)로 표시된다", () => {
    const b = builder();
    const pu = b.place("hyd.power-unit", 200, 400, { pressure: 40 });
    const valve = b.place("hyd.valve.4-3-tandem-solenoid", 200, 250);
    const cyl = b.place("hyd.cylinder.double", 200, 100);
    const tk = b.place("hyd.tank", 350, 300);
    b.wire(pu, "P", valve, "P");
    b.wire(valve, "T", tk, "T");
    b.wire(valve, "A", cyl, "HEAD");
    b.wire(valve, "B", cyl, "ROD");
    const snap = run(new SimulationEngine(b.doc), 0.3); // 중립 (무신호)
    expect(snap.components[valve].valvePosition).toBe(1);
    expect(snap.components[tk].portState.T).toBe("exhausted");
    expect(snap.components[valve].portState.T).toBe("exhausted"); // 탱크와 배선으로 같은 넷
  });
});

describe("감압밸브 방향성", () => {
  it("역방향(A→P) 흐름에는 감압 cap이 적용되지 않는다", () => {
    const b = builder();
    const pu = b.place("hyd.power-unit", 200, 400, { pressure: 40 });
    const red = b.place("hyd.reducing", 200, 300, { pressure: 20 });
    const gauge = b.place("hyd.gauge", 200, 200);
    // 출구(A)측에 공급을 물리고 입구(P)측 게이지 — 역방향
    b.wire(pu, "P", red, "A");
    b.wire(red, "P", gauge, "P");
    const snap = run(new SimulationEngine(b.doc), 0.2);
    expect(snap.components[gauge].portLevel?.P).toBe(40); // cap 없음
  });
});
