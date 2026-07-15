import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { examples } from "../../examples";
import {
  MAX_LEARNING_ACTIVITY,
  parseDocument,
  prepareDocumentForPersistence,
  serializeDocument,
} from "../schema";
import { addComponent, autoWire, updateComponentProperty } from "../operations";
import { createEmptyDocument, type CircuitDocument } from "../types";
import { SimulationEngine } from "../../sim/engine";

/**
 * review-2 P0: 문서 경계 검증 강화 회귀 테스트.
 * 파싱을 통과한 문서는 엔진 생성 + 첫 틱에서 예외를 던지지 않아야 한다.
 */

beforeAll(() => {
  registerLibraries();
});

function docWithCylinder(): CircuitDocument {
  let doc = createEmptyDocument("경계 테스트");
  const src = addComponent(doc, "pneu.source", { x: 100, y: 300 });
  doc = src.doc;
  const cyl = addComponent(doc, "pneu.cylinder.single", { x: 100, y: 100 });
  doc = cyl.doc;
  return autoWire(
    doc,
    { componentId: src.component.id, portId: "P" },
    { componentId: cyl.component.id, portId: "HEAD" },
  );
}

function reparse(broken: unknown) {
  return parseDocument(JSON.stringify(broken));
}

const ROW = (cells: unknown[]) => [...cells, ...new Array(8 - cells.length).fill(null)];

describe("부품 속성: propertySchema 기반 검증", () => {
  it('strokeTime: "invalid" (문자열)를 거부한다', () => {
    const doc = docWithCylinder();
    const broken = {
      ...doc,
      components: doc.components.map((c) =>
        c.type === "pneu.cylinder.single"
          ? { ...c, properties: { ...c.properties, strokeTime: "invalid" } }
          : c,
      ),
    };
    const result = reparse(broken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("strokeTime");
  });

  it("strokeTime: NaN/범위 이탈을 거부한다", () => {
    const doc = docWithCylinder();
    for (const bad of [Number.NaN, -5, 999]) {
      const broken = {
        ...doc,
        components: doc.components.map((c) =>
          c.type === "pneu.cylinder.single"
            ? { ...c, properties: { ...c.properties, strokeTime: bad } }
            : c,
        ),
      };
      // NaN은 JSON에서 null이 되므로 타입 불일치로, 범위 이탈은 min/max로 거부
      expect(reparse(broken).ok).toBe(false);
    }
  });

  it("select 속성에 허용 목록 밖 값을 거부한다", () => {
    let doc = createEmptyDocument("select 테스트");
    const pb = addComponent(doc, "elec.pushbutton", { x: 0, y: 0 });
    doc = pb.doc;
    const broken = {
      ...doc,
      components: doc.components.map((c) => ({
        ...c,
        properties: { ...c.properties, contactType: "XX" },
      })),
    };
    const result = reparse(broken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("contactType");
  });

  it("누락된 속성은 기본값으로 채워 통과시킨다 (구버전 문서 호환)", () => {
    const doc = docWithCylinder();
    const stripped = {
      ...doc,
      components: doc.components.map((c) => ({ ...c, properties: {} })),
    };
    const result = reparse(stripped);
    expect(result.ok).toBe(true);
    const cyl = result.document!.components.find((c) => c.type === "pneu.cylinder.single")!;
    expect(cyl.properties.strokeTime).toBe(1);
    // 파싱 통과 문서는 엔진 첫 틱까지 안전
    const engine = new SimulationEngine(result.document!);
    expect(() => engine.tick(0.02)).not.toThrow();
  });
});

describe("문서 메타: learningActivity (Phase 12)", () => {
  it("문자열이 아닌 learningActivity를 거부한다", () => {
    const doc = docWithCylinder();
    const broken = { ...doc, meta: { ...doc.meta, learningActivity: 12345 } };
    const result = reparse(broken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("learningActivity");
  });

  it("500자를 넘는 learningActivity를 거부한다", () => {
    const doc = docWithCylinder();
    const broken = {
      ...doc,
      meta: { ...doc.meta, learningActivity: "가".repeat(501) },
    };
    const result = reparse(broken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("학습 활동");
  });

  it("필드가 없는 v2 이전 문서도 통과한다 (선택 필드)", () => {
    const doc = docWithCylinder();
    expect(reparse(doc).ok).toBe(true);
  });
});

describe("저장 경계: prepareDocumentForPersistence (review P1)", () => {
  it("빈 학습 활동 설명은 자동 초안으로 채운다", () => {
    const doc = docWithCylinder();
    const prepared = prepareDocumentForPersistence(doc);
    expect(prepared.meta.learningActivity).toBeTruthy();
  });

  it("공백만 있는 설명도 자동 초안으로 대체한다 (trim 기준)", () => {
    const doc = { ...docWithCylinder() };
    doc.meta = { ...doc.meta, learningActivity: "   \n\t " };
    const prepared = prepareDocumentForPersistence(doc);
    expect(prepared.meta.learningActivity?.trim()).toBeTruthy();
    expect(prepared.meta.learningActivity).not.toBe("   \n\t ");
  });

  it("사용자 설명은 보존한다", () => {
    const doc = { ...docWithCylinder() };
    doc.meta = { ...doc.meta, learningActivity: "내가 직접 적은 설명" };
    expect(prepareDocumentForPersistence(doc).meta.learningActivity).toBe("내가 직접 적은 설명");
  });

  it("500자를 넘는 설명은 상한으로 잘라 재열기 가능하게 만든다 (저장=재열기 보장)", () => {
    const doc = { ...docWithCylinder() };
    doc.meta = { ...doc.meta, learningActivity: "가".repeat(600) };
    const prepared = prepareDocumentForPersistence(doc);
    expect(prepared.meta.learningActivity!.length).toBe(MAX_LEARNING_ACTIVITY);
    // 저장 경계를 거친 문서는 반드시 다시 파싱된다
    expect(parseDocument(serializeDocument(prepared)).ok).toBe(true);
  });

  it("빈 문서(부품 없음)는 설명을 비운 채 둔다 (설명할 회로 없음)", () => {
    const empty = createEmptyDocument("빈 문서");
    const prepared = prepareDocumentForPersistence(empty);
    expect(prepared.meta.learningActivity ?? "").toBe("");
  });
});

describe("미등록 meta 키 제거 (개인정보 방어, review P1)", () => {
  it("조작된 meta.studentName·meta.studentId 등 미등록 키를 제거한다", () => {
    const doc = docWithCylinder();
    const broken = {
      ...doc,
      meta: { ...doc.meta, studentName: "홍길동", studentId: "20301", 반: "3-2" },
    };
    const result = reparse(broken);
    expect(result.ok).toBe(true);
    expect(result.document!.meta).not.toHaveProperty("studentName");
    expect(result.document!.meta).not.toHaveProperty("studentId");
    expect(result.document!.meta).not.toHaveProperty("반");
    // 허용된 키는 보존
    expect(result.document!.meta.title).toBe(doc.meta.title);
  });

  it("최상위 임의 키도 제거한다 (허용 키만 재구성)", () => {
    const doc = docWithCylinder();
    const broken = { ...doc, secretPayload: { x: 1 }, __owner: "leak" };
    const result = reparse(broken);
    expect(result.ok).toBe(true);
    expect(result.document!).not.toHaveProperty("secretPayload");
    expect(result.document!).not.toHaveProperty("__owner");
  });

  it("허용된 description·learningActivity는 보존한다", () => {
    const doc = { ...docWithCylinder() };
    doc.meta = { ...doc.meta, description: "설명", learningActivity: "학습 활동" };
    const result = reparse(doc);
    expect(result.document!.meta.description).toBe("설명");
    expect(result.document!.meta.learningActivity).toBe("학습 활동");
  });
});

describe("PLC 프로그램: 렁/vlink/디바이스 문법", () => {
  const withPlc = (rungs: unknown[]) => ({ ...docWithCylinder(), plcProgram: { rungs } });

  it("빈 렁(cells: [])을 거부한다 — 스캐너 예외 방지", () => {
    const result = reparse(withPlc([{ id: "r1", cells: [], vlinks: [] }]));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("행 수");
  });

  it("vlinks: [null]을 거부한다", () => {
    const rung = {
      id: "r1",
      cells: [ROW([{ kind: "no", device: "P0" }]), ROW([{ kind: "no", device: "P1" }])],
      vlinks: [null],
    };
    expect(reparse(withPlc([rung])).ok).toBe(false);
  });

  it("범위 밖·마지막 행 vlink를 거부한다", () => {
    const cells = [ROW([{ kind: "no", device: "P0" }]), ROW([{ kind: "no", device: "P1" }])];
    for (const v of [{ r: 1, c: 0 }, { r: -1, c: 0 }, { r: 0, c: 99 }, { r: 0.5, c: 0 }]) {
      expect(reparse(withPlc([{ id: "r1", cells, vlinks: [v] }])).ok).toBe(false);
    }
  });

  it("디바이스 표기 문법(P/M/T/C/D+숫자)을 벗어나면 거부한다", () => {
    // D는 word 디바이스 — bit 접점으로 허용하면 안 됨 (codex-review-3 P0)
    for (const device of ["X0", "P", "M99999999", "__proto__", "", "D1", "D100"]) {
      const rung = { id: "r1", cells: [ROW([{ kind: "no", device }])], vlinks: [] };
      expect(reparse(withPlc([rung])).ok).toBe(false);
    }
  });

  it("타이머/카운터 설정값이 숫자가 아니거나 음수면 거부한다", () => {
    for (const preset of ["3", -1, Number.NaN]) {
      const cells = [ROW([null, null, null, null, null, null, null, { kind: "ton", device: "T1", preset }])];
      expect(reparse(withPlc([{ id: "r1", cells, vlinks: [] }])).ok).toBe(false);
    }
  });

  it("출력 요소가 마지막 열이 아니면 거부한다", () => {
    const cells = [ROW([{ kind: "coil", device: "M0" }])];
    const result = reparse(withPlc([{ id: "r1", cells, vlinks: [] }]));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("마지막 열");
  });

  it("렁 id 중복을 거부한다", () => {
    const rung = { id: "r1", cells: [ROW([{ kind: "no", device: "P0" }])], vlinks: [] };
    expect(reparse(withPlc([rung, { ...rung }])).ok).toBe(false);
  });
});

describe("ioMap: 디바이스 문법 + 방향↔역할 적합성", () => {
  it("P 접두사가 아닌 디바이스를 거부한다", () => {
    const doc = docWithCylinder();
    const broken = { ...doc, ioMap: [{ device: "M0", direction: "input", componentId: "" }] };
    expect(reparse(broken).ok).toBe(false);
  });

  it("입력에 접점이 아닌 부품이 연결되면 거부한다", () => {
    let doc = createEmptyDocument("io 테스트");
    const lamp = addComponent(doc, "elec.lamp", { x: 0, y: 0 });
    doc = lamp.doc;
    const broken = {
      ...doc,
      ioMap: [{ device: "P0", direction: "input", componentId: lamp.component.id }],
    };
    const result = reparse(broken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("접점이 아닌");
  });

  it("출력에 부하가 아닌 부품이 연결되면 거부한다", () => {
    let doc = createEmptyDocument("io 테스트");
    const pb = addComponent(doc, "elec.pushbutton", { x: 0, y: 0 });
    doc = pb.doc;
    const broken = {
      ...doc,
      ioMap: [{ device: "P20", direction: "output", componentId: pb.component.id }],
    };
    expect(reparse(broken).ok).toBe(false);
  });
});

describe("크기 상한", () => {
  it("부품 수 상한(2000개)을 넘으면 거부한다", () => {
    const doc = docWithCylinder();
    const template = doc.components[0];
    const broken = {
      ...doc,
      wires: [],
      components: Array.from({ length: 2001 }, (_, i) => ({ ...template, id: `c${i}` })),
    };
    const result = reparse(broken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("상한");
  });

  it("5MB를 넘는 파일을 거부한다", () => {
    const huge = `{"schemaVersion":2,"pad":"${"x".repeat(5 * 1024 * 1024)}"}`;
    const result = parseDocument(huge);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("너무 큽니다");
  });
});

describe("회귀: 파싱을 통과한 문서는 엔진 첫 틱까지 안전하다", () => {
  it("모든 내장 예제가 직렬화→파싱→엔진 1틱을 통과한다", () => {
    for (const ex of examples) {
      const result = parseDocument(serializeDocument(ex.build()));
      expect(result.ok, `${ex.id} 파싱`).toBe(true);
      const engine = new SimulationEngine(result.document!);
      expect(() => engine.tick(0.02), `${ex.id} 첫 틱`).not.toThrow();
      // Phase 12: 내장 예제는 교사가 그대로 배포·활용하므로 학습 활동 설명이 채워져 있어야 한다
      expect(result.document!.meta.learningActivity, `${ex.id} 학습 활동 설명`).toBeTruthy();
    }
  });

  it("속성 편집 경로(updateComponentProperty)로도 범위 내 값만 저장된다", () => {
    // UI 경계는 PropertyPanel이 막지만, 저장 파일 왕복에서 검증이 이를 재확인한다
    const doc = docWithCylinder();
    const cyl = doc.components.find((c) => c.type === "pneu.cylinder.single")!;
    const edited = updateComponentProperty(doc, cyl.id, "strokeTime", 2.5);
    expect(parseDocument(serializeDocument(edited)).ok).toBe(true);
  });
});
