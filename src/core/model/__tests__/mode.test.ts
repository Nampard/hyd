import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { buildBlankConveyorDocument, exampleMode, examples, getExample } from "../../examples";
import { documentMode } from "../mode";
import { createEmptyDocument } from "../types";
import { parseDocument, serializeDocument } from "../schema";
import { SimulationEngine } from "../../sim/engine";

beforeAll(() => {
  registerLibraries();
});

describe("작업 모드 판정 (Phase 37)", () => {
  it("빈 문서와 회로 예제는 공유압 회로 모드다", () => {
    expect(documentMode(createEmptyDocument())).toBe("circuit");
    expect(documentMode(getExample("a-b-sequence")!.build())).toBe("circuit");
  });

  it("채널로 물리는 스테이션이 있는 문서는 컨베이어 모드다", () => {
    expect(documentMode(getExample("automation-basic")!.build())).toBe("conveyor");
    expect(documentMode(buildBlankConveyorDocument())).toBe("conveyor");
  });

  it("예제의 모드 분류는 문서 내용과 일치한다 — 컨베이어 예제는 컨베이어 목록에만 있다", () => {
    for (const ex of examples) expect(exampleMode(ex)).toBe(documentMode(ex.build()));
    expect(examples.filter((ex) => exampleMode(ex) === "conveyor").map((ex) => ex.id)).toEqual(["automation-basic"]);
  });
});

describe("빈 컨베이어 과제 (Phase 37)", () => {
  it("스테이션과 I/O 맵 26점은 갖추고 래더는 빈 렁 하나뿐이다", () => {
    const doc = buildBlankConveyorDocument();
    expect(doc.components).toHaveLength(1);
    expect(doc.ioMap).toHaveLength(26);
    expect(doc.plcProgram?.rungs).toHaveLength(1);
    expect(doc.plcProgram!.rungs[0].cells.flat().every((cell) => cell === null)).toBe(true);
    expect(doc.meta.title).toBe("새 컨베이어 과제");
    // 저장 → 다시 열기를 거쳐도 컨베이어 문서로 남는다
    const reopened = parseDocument(serializeDocument(doc));
    expect(reopened.ok).toBe(true);
    expect(documentMode(reopened.document!)).toBe("conveyor");
  });

  it("래더가 비어도 시뮬레이션이 돌고 스테이션은 멈춰 있다", () => {
    const doc = buildBlankConveyorDocument();
    const engine = new SimulationEngine(doc);
    engine.setDiscreteInput(doc.components[0].id, "PB2", true);
    let snap = engine.snapshot();
    for (let i = 0; i < 50; i++) snap = engine.tick(0.02);
    const station = snap.components[doc.components[0].id].equipment as { cyl: Record<string, number> };
    expect(Object.values(station.cyl).every((v) => v === 0)).toBe(true);
  });
});
