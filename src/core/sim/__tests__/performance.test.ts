import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { createEmptyDocument } from "../../model/types";
import { addComponent, autoWire } from "../../model/operations";
import { SimulationEngine } from "../engine";

beforeAll(() => {
  registerLibraries();
});

describe("성능: 부품 100개 회로 (PRD 6절)", () => {
  it("평균 틱 시간이 5ms 미만이다 (50Hz 여유)", () => {
    // 5/2 밸브 + 복동 실린더 + 공압원 셀 25개 = 부품 100개, 배선 100개
    let doc = createEmptyDocument("성능 테스트");
    const valveIds: string[] = [];
    for (let i = 0; i < 25; i++) {
      const x = (i % 5) * 400 + 200;
      const y = Math.floor(i / 5) * 400 + 200;
      const cyl = addComponent(doc, "pneu.cylinder.double", { x, y: y - 120 });
      doc = cyl.doc;
      const valve = addComponent(doc, "pneu.valve.5-2-manual", { x, y });
      doc = valve.doc;
      const src = addComponent(doc, "pneu.source", { x: x + 30, y: y + 130 });
      doc = src.doc;
      const silencer = addComponent(doc, "pneu.silencer", { x: x - 100, y: y + 130 });
      doc = silencer.doc;
      doc = autoWire(doc, { componentId: src.component.id, portId: "P" }, { componentId: valve.component.id, portId: "P" });
      doc = autoWire(doc, { componentId: valve.component.id, portId: "A" }, { componentId: cyl.component.id, portId: "HEAD" });
      doc = autoWire(doc, { componentId: valve.component.id, portId: "B" }, { componentId: cyl.component.id, portId: "ROD" });
      doc = autoWire(doc, { componentId: valve.component.id, portId: "R1" }, { componentId: silencer.component.id, portId: "R" });
      valveIds.push(valve.component.id);
    }
    expect(doc.components.length).toBe(100);

    const engine = new SimulationEngine(doc);
    for (const id of valveIds) engine.setManual(id, true); // 전부 구동

    const ticks = 250; // 5초 분량
    const start = performance.now();
    for (let i = 0; i < ticks; i++) engine.tick(0.02);
    const avgMs = (performance.now() - start) / ticks;

    expect(avgMs).toBeLessThan(5);
  });
});
