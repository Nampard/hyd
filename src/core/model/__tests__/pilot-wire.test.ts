import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { getExample } from "../../examples";
import { getPilotPortIds, isPilotWire } from "../operations";

beforeAll(() => {
  registerLibraries();
});

describe("파일럿 관로 판별 (Phase 27 — KS B 0054 선 종류)", () => {
  it("behavior 데이터에서 파일럿 포트를 뽑는다", () => {
    expect(getPilotPortIds("pneu.valve.5-2-double-pilot")).toEqual(["X", "Y"]);
    expect(getPilotPortIds("pneu.valve.5-2-single-pilot")).toEqual(["X"]);
    expect(getPilotPortIds("hyd.pilot-check")).toEqual(["X"]);
    expect(getPilotPortIds("hyd.counterbalance")).toEqual(["X"]);
    // 내부 파일럿(시퀀스)·솔레노이드 밸브·실린더에는 외부 파일럿 포트가 없다
    expect(getPilotPortIds("hyd.sequence")).toEqual([]);
    expect(getPilotPortIds("pneu.valve.5-2-double-solenoid")).toEqual([]);
    expect(getPilotPortIds("pneu.cylinder.double")).toEqual([]);
  });

  it("파일럿 포트에 닿은 배관만 파일럿 관로이고, 주관로·전기 배선은 아니다", () => {
    const doc = getExample("indirect-pilot")!.build();
    const pilotValve = doc.components.find((c) => c.type.includes("pilot"))!;
    const pilotWires = doc.wires.filter((w) => isPilotWire(doc, w));
    expect(pilotWires.length).toBeGreaterThan(0);
    for (const w of pilotWires) {
      const end = w.from.componentId === pilotValve.id ? w.from : w.to;
      expect(end.componentId).toBe(pilotValve.id);
      expect(getPilotPortIds(pilotValve.type)).toContain(end.portId);
    }
    // 실린더로 가는 주관로는 실선
    const cylinder = doc.components.find((c) => c.type.startsWith("pneu.cylinder"))!;
    const mainWires = doc.wires.filter(
      (w) => w.from.componentId === cylinder.id || w.to.componentId === cylinder.id,
    );
    expect(mainWires.length).toBeGreaterThan(0);
    for (const w of mainWires) expect(isPilotWire(doc, w)).toBe(false);

    const electric = getExample("electro-reciprocate")!.build();
    expect(electric.wires.some((w) => isPilotWire(electric, w))).toBe(false);
  });
});
