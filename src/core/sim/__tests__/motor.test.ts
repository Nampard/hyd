import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { createEmptyDocument } from "../../model/types";
import { addComponent, autoWire } from "../../model/operations";
import { SimulationEngine } from "../engine";

beforeAll(() => {
  registerLibraries();
});

const DT = 0.02;

describe("유압 모터 (Phase 10 완료 기준)", () => {
  it("4/2 밸브 방향에 따라 회전 방향이 바뀐다", () => {
    // 파워유닛 → 4/2 밸브 → 모터 (A, B) / 밸브 T → 탱크
    let doc = createEmptyDocument("모터 테스트");
    const pu = addComponent(doc, "hyd.power-unit", { x: 200, y: 400 });
    doc = pu.doc;
    const valve = addComponent(doc, "hyd.valve.4-2-lever", { x: 200, y: 280 });
    doc = valve.doc;
    const motor = addComponent(doc, "hyd.motor", { x: 200, y: 120 });
    doc = motor.doc;
    const tk = addComponent(doc, "hyd.tank", { x: 320, y: 340 });
    doc = tk.doc;
    const wire = (a: { component: { id: string } }, ap: string, b: { component: { id: string } }, bp: string) => {
      doc = autoWire(doc, { componentId: a.component.id, portId: ap }, { componentId: b.component.id, portId: bp });
    };
    wire(pu, "P", valve, "P");
    wire(valve, "T", tk, "T");
    wire(valve, "A", motor, "A");
    wire(valve, "B", motor, "B");
    expect(doc.wires).toHaveLength(4);

    const engine = new SimulationEngine(doc);

    // 정지 위치 (P→B): B 가압, A 배출 → 역회전 (각도 감소)
    let snap = engine.snapshot();
    for (let i = 0; i < 50; i++) snap = engine.tick(DT);
    const angle1 = snap.components[motor.component.id].motorAngle!;
    expect(angle1).toBeLessThan(-100); // 1초 × 1rev/s = -360도 근처

    // 레버 ON (P→A): 정회전 (각도 증가)
    engine.setManual(valve.component.id, true);
    for (let i = 0; i < 100; i++) snap = engine.tick(DT);
    const angle2 = snap.components[motor.component.id].motorAngle!;
    expect(angle2).toBeGreaterThan(angle1 + 300); // 방향 반전 후 증가
  });
});
