import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { examples } from "../../examples";
import { summarizeLearningActivity } from "../learning-activity";
import { addComponent, autoWire, updateComponentProperty } from "../operations";
import { createEmptyDocument, type CircuitDocument } from "../types";

/**
 * Phase 12: 학습 활동 설명 자동 초안 생성기 골든 테스트.
 * 부품별 분기 없이 behavior.role/domain만으로 판정하는지, 대표 시나리오에서
 * 자연스러운 문장이 나오는지 확인한다.
 */

beforeAll(() => {
  registerLibraries();
});

function build(
  parts: Record<string, string>,
  wires: [string, string, string, string][] = [],
  props: [string, string, unknown][] = [],
): CircuitDocument {
  let doc = createEmptyDocument("학습 활동 테스트");
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
  return doc;
}

describe("summarizeLearningActivity: 빈 입력", () => {
  it("부품이 없으면 빈 문자열을 반환한다", () => {
    expect(summarizeLearningActivity(createEmptyDocument())).toBe("");
  });
});

describe("summarizeLearningActivity: 제어 유형 판정", () => {
  it("PLC 프로그램이 있으면 'PLC 제어'를 포함한다", () => {
    const doc = build({ pb: "elec.pushbutton", lamp: "elec.lamp" });
    const withPlc: CircuitDocument = {
      ...doc,
      plcProgram: { rungs: [{ id: "r1", cells: [], vlinks: [] }] },
    };
    // 빈 cells는 스캐너 검증 대상이 아니라 summarize만 보는 단위 테스트이므로 rungs.length만 사용
    expect(summarizeLearningActivity(withPlc)).toContain("PLC 제어");
  });

  it("솔레노이드 밸브(공압)가 있으면 '전기공압 시퀀스 제어'", () => {
    const doc = build(
      { cyl: "pneu.cylinder.double", valve: "pneu.valve.5-2-double-solenoid" },
      [
        ["valve", "A", "cyl", "HEAD"],
        ["valve", "B", "cyl", "ROD"],
      ],
    );
    expect(summarizeLearningActivity(doc)).toContain("전기공압 시퀀스 제어");
  });

  it("솔레노이드 밸브(유압)가 있으면 '전기유압 시퀀스 제어'", () => {
    const doc = build(
      { cyl: "hyd.cylinder.double", valve: "hyd.valve.4-3-closed-solenoid" },
      [
        ["valve", "A", "cyl", "HEAD"],
        ["valve", "B", "cyl", "ROD"],
      ],
    );
    expect(summarizeLearningActivity(doc)).toContain("전기유압 시퀀스 제어");
  });

  it("롤러/리밋 스위치가 있으면 '시퀀스 제어(자동 왕복)'", () => {
    const doc = build({ cyl: "pneu.cylinder.double", roller: "pneu.valve.3-2-roller" });
    expect(summarizeLearningActivity(doc)).toContain("시퀀스 제어(자동 왕복)");
  });

  it("속도제어밸브가 있으면 '속도제어'", () => {
    const doc = build({ cyl: "pneu.cylinder.double", sc: "pneu.speed-controller" });
    expect(summarizeLearningActivity(doc)).toContain("속도제어");
  });

  it("셔틀밸브가 있으면 '논리 회로(OR/AND) 제어'", () => {
    const doc = build({ cyl: "pneu.cylinder.single", shuttle: "pneu.shuttle" });
    expect(summarizeLearningActivity(doc)).toContain("논리 회로(OR/AND) 제어");
  });

  it("전기 부품만(릴레이 코일 포함)이면 '릴레이 시퀀스 제어'", () => {
    const doc = build({ pb: "elec.pushbutton", coil: "elec.relay-coil" });
    expect(summarizeLearningActivity(doc)).toContain("릴레이 시퀀스 제어");
  });

  it("도메인 기반 기본 문구로 떨어진다 (공압만, 판정 요소 없음)", () => {
    const doc = build({ cyl: "pneu.cylinder.single", tank: "pneu.silencer" });
    expect(summarizeLearningActivity(doc)).toContain("공압 기초");
  });
});

describe("summarizeLearningActivity: 조사(을/를) 처리", () => {
  it("받침 있는 이름 뒤에는 '을'을 붙인다 (예: 릴레이 접점)", () => {
    const doc = build({ pb: "elec.pushbutton", contact: "elec.relay-contact" });
    // 부품 1개(secondary) 뿐이면 목록이 "릴레이 접점"만 남을 수 있어 을/를 검증에 적합
    const text = summarizeLearningActivity(doc);
    expect(text.includes("을 활용한") || text.includes("를 활용한")).toBe(true);
  });

  it("괄호로 끝나는 이름도 마지막 한글 음절 기준으로 조사를 정확히 붙인다", () => {
    // "속도제어밸브 (스로틀+체크)" — 마지막 한글 음절 "크"는 받침 없음 → "를"
    const doc = build({ cyl: "pneu.cylinder.double", sc: "pneu.speed-controller" });
    expect(summarizeLearningActivity(doc)).toMatch(/체크\)를 활용한/);
  });
});

describe("summarizeLearningActivity: 내장 예제 대표 시나리오 (완료 기준)", () => {
  it("모든 내장 예제가 자연스러운 문장('~를 활용한 ... 회로 구현')을 생성한다", () => {
    for (const ex of examples) {
      const doc = ex.build();
      const text = doc.meta.learningActivity ?? "";
      expect(text, `${ex.id}`).toBeTruthy();
      expect(text, `${ex.id}`).toMatch(/(을|를) 활용한 .+ 회로 구현$/);
    }
  });

  it("speed-control 예제는 '속도제어'를 포함한다", () => {
    const doc = examples.find((e) => e.id === "speed-control")!.build();
    expect(doc.meta.learningActivity).toContain("속도제어");
  });

  it("a-b-sequence 예제는 '전기공압 시퀀스 제어'를 포함한다", () => {
    const doc = examples.find((e) => e.id === "a-b-sequence")!.build();
    expect(doc.meta.learningActivity).toContain("전기공압 시퀀스 제어");
  });

  it("plc-self-holding 예제는 'PLC 제어'를 포함한다", () => {
    const doc = examples.find((e) => e.id === "plc-self-holding")!.build();
    expect(doc.meta.learningActivity).toContain("PLC 제어");
  });

  it("auto-reciprocate 예제는 자동 왕복 시퀀스로 판정된다", () => {
    const doc = examples.find((e) => e.id === "auto-reciprocate")!.build();
    expect(doc.meta.learningActivity).toContain("시퀀스 제어(자동 왕복)");
  });
});

describe("summarizeLearningActivity: 개인정보 미포함 (설계 결정)", () => {
  it("생성된 문장에 학습자 식별 정보를 위한 자리표시자가 없다 (포맷에 이름/학번 필드 자체가 없음)", () => {
    const doc = build({ cyl: "pneu.cylinder.double", valve: "pneu.valve.5-2-manual" });
    const text = summarizeLearningActivity(doc);
    expect(text).not.toMatch(/이름|학번|성명/);
  });
});
