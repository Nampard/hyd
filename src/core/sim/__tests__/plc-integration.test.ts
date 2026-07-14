import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { createEmptyDocument } from "../../model/types";
import type { CircuitDocument } from "../../model/types";
import { addComponent, autoWire } from "../../model/operations";
import { lc, rungOf } from "../../examples";
import { SimulationEngine } from "../engine";

/**
 * codex-review H2/M2 회귀 테스트:
 * PLC 출력 → 릴레이/타이머/카운터 디바이스 연동, 동일 label 솔레노이드 OR 의미
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

interface B {
  doc: CircuitDocument;
  place(type: string, x: number, y: number, props?: Record<string, unknown>): string;
  wire(aId: string, aPort: string, bId: string, bPort: string): void;
}

function builder(): B {
  const b: B = {
    doc: createEmptyDocument("PLC 통합 테스트"),
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
      b.doc = autoWire(b.doc, { componentId: aId, portId: aPort }, { componentId: bId, portId: bPort });
    },
  };
  return b;
}

describe("H2: PLC 출력 → 전기 디바이스 연동", () => {
  it("PLC 출력에 매핑한 릴레이 코일이 같은 이름의 접점을 닫는다", () => {
    const b = builder();
    // 전기 회로: 24V → K1 접점 → 램프 → 0V (K1 코일은 배선 없이 PLC 출력으로만 구동)
    const sup24 = b.place("elec.supply-24v", 100, 100);
    const k1ct = b.place("elec.relay-contact", 100, 200, { contactType: "NO", deviceLabel: "K1" });
    const lamp = b.place("elec.lamp", 100, 300, { name: "L1" });
    const sup0 = b.place("elec.supply-0v", 100, 400);
    b.wire(sup24, "P", k1ct, "T");
    b.wire(k1ct, "B", lamp, "T");
    b.wire(lamp, "B", sup0, "P");
    const k1coil = b.place("elec.relay-coil", 300, 200, { label: "K1" });
    const sw = b.place("elec.pushbutton", 300, 100, { contactType: "NO", actuation: "maintained", name: "SW" });

    b.doc = {
      ...b.doc,
      // 렁: P0 → 코일 P20
      plcProgram: { rungs: [rungOf([[lc("no", "P0"), lc("coil", "P20")]])] },
      ioMap: [
        { device: "P0", direction: "input", componentId: sw },
        { device: "P20", direction: "output", componentId: k1coil },
      ],
    };

    const engine = new SimulationEngine(b.doc);
    let snap = run(engine, 0.2);
    expect(snap.components[lamp].energized).toBe(false);

    engine.setManual(sw, true); // P0 ON → P20 ON → K1 코일 → K1 접점 → 램프
    snap = run(engine, 0.2);
    expect(snap.components[k1coil].energized).toBe(true);
    expect(snap.components[k1ct].contactClosed).toBe(true);
    expect(snap.components[lamp].energized).toBe(true);

    engine.setManual(sw, false);
    snap = run(engine, 0.2);
    expect(snap.components[lamp].energized).toBe(false);
  });

  it("PLC 출력에 매핑한 타이머가 지연 후 접점을 구동한다", () => {
    const b = builder();
    const sup24 = b.place("elec.supply-24v", 100, 100);
    const t1ct = b.place("elec.relay-contact", 100, 200, { contactType: "NO", deviceLabel: "T1" });
    const lamp = b.place("elec.lamp", 100, 300, { name: "L1" });
    const sup0 = b.place("elec.supply-0v", 100, 400);
    b.wire(sup24, "P", t1ct, "T");
    b.wire(t1ct, "B", lamp, "T");
    b.wire(lamp, "B", sup0, "P");
    const timer = b.place("elec.timer", 300, 200, { label: "T1", mode: "on-delay", preset: 0.5 });
    const sw = b.place("elec.pushbutton", 300, 100, { contactType: "NO", actuation: "maintained", name: "SW" });

    b.doc = {
      ...b.doc,
      plcProgram: { rungs: [rungOf([[lc("no", "P0"), lc("coil", "P20")]])] },
      ioMap: [
        { device: "P0", direction: "input", componentId: sw },
        { device: "P20", direction: "output", componentId: timer },
      ],
    };

    const engine = new SimulationEngine(b.doc);
    engine.setManual(sw, true);
    let snap = run(engine, 0.3); // 0.5초 미달
    expect(snap.components[lamp].energized).toBe(false);
    snap = run(engine, 0.4); // 누적 0.7초 > 0.5초
    expect(snap.components[lamp].energized).toBe(true);
  });
});

describe("M2: 동일 label 솔레노이드 OR", () => {
  /** 통전 코일 + 비통전 코일(같은 label)의 문서 순서가 밸브 전환에 영향을 주지 않아야 한다 */
  function circuit(energizedFirst: boolean) {
    const b = builder();
    // 공압부: 소스 → 3/2 솔레노이드 밸브 → 단동 실린더
    const src = b.place("pneu.source", 100, 400);
    const valve = b.place("pneu.valve.3-2-solenoid", 100, 300, { solenoidLeft: "Y1" });
    const cyl = b.place("pneu.cylinder.single", 100, 150);
    b.wire(src, "P", valve, "P");
    b.wire(valve, "A", cyl, "HEAD");

    // 전기부: 통전 Y1 코일 (버튼 경유) + 상시 비통전 Y1 코일 (전원 미연결)
    const ids: string[] = [];
    const placeEnergized = () => {
      const sup24 = b.place("elec.supply-24v", 300, 100);
      const sw = b.place("elec.pushbutton", 300, 200, { contactType: "NO", actuation: "maintained", name: "SW" });
      const y1 = b.place("elec.solenoid", 300, 300, { label: "Y1" });
      const sup0 = b.place("elec.supply-0v", 300, 400);
      b.wire(sup24, "P", sw, "T");
      b.wire(sw, "B", y1, "T");
      b.wire(y1, "B", sup0, "P");
      ids.push(sw);
    };
    const placeDead = () => {
      b.place("elec.solenoid", 500, 300, { label: "Y1" }); // 미배선 — 항상 비통전
    };
    if (energizedFirst) {
      placeEnergized();
      placeDead();
    } else {
      placeDead();
      placeEnergized();
    }
    return { b, cyl, sw: ids[0] };
  }

  it.each([true, false])("통전 코일이 앞(%s)이든 뒤든 밸브가 전환된다", (energizedFirst) => {
    const { b, cyl, sw } = circuit(energizedFirst);
    const engine = new SimulationEngine(b.doc);
    engine.setManual(sw, true);
    const snap = run(engine, 1.5);
    expect(snap.components[cyl].cylinderPos).toBe(1);
  });
});
