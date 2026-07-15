import { beforeAll, describe, expect, it } from "vitest";
import { createEmptyDocument, CURRENT_SCHEMA_VERSION } from "../types";
import { parseDocument, serializeDocument } from "../schema";
import {
  addComponent,
  addWire,
  canConnect,
  deleteComponent,
  getPortWorldPosition,
  getPortDefinition,
  moveComponent,
  rotateComponent,
  updateComponentProperty,
} from "../operations";
import { registerPneumaticLibrary } from "../../library/pneumatic";
import { computeOrthogonalRoute } from "../../routing";

beforeAll(() => {
  registerPneumaticLibrary();
});

describe("문서 직렬화", () => {
  it("저장 → 불러오기 왕복이 문서를 보존한다", () => {
    let doc = createEmptyDocument("테스트 회로");
    const a = addComponent(doc, "pneu.source", { x: 100, y: 300 });
    doc = a.doc;
    const b = addComponent(doc, "pneu.cylinder.double", { x: 300, y: 100 });
    doc = b.doc;
    doc = addWire(
      doc,
      { componentId: a.component.id, portId: "P" },
      { componentId: b.component.id, portId: "HEAD" },
      [{ x: 100, y: 200 }],
    );

    const json = serializeDocument(doc);
    const result = parseDocument(json);

    expect(result.ok).toBe(true);
    expect(result.document).toEqual(doc);
  });

  it("잘못된 JSON은 error를 반환한다", () => {
    expect(parseDocument("{invalid").ok).toBe(false);
    expect(parseDocument("42").ok).toBe(false);
    expect(parseDocument("{}").ok).toBe(false);
  });

  it("장비 배치(equipmentLayout)가 저장 왕복을 보존한다 (v2)", () => {
    let doc = createEmptyDocument("장비 배치");
    const a = addComponent(doc, "pneu.source", { x: 100, y: 100 });
    doc = { ...a.doc, equipmentLayout: { [a.component.id]: { x: 300, y: 200 } } };

    const result = parseDocument(serializeDocument(doc));
    expect(result.ok).toBe(true);
    expect(result.document?.equipmentLayout).toEqual({ [a.component.id]: { x: 300, y: 200 } });
  });

  it("v1 문서는 v2로 마이그레이션된다 (equipmentLayout 기본값)", () => {
    const doc = createEmptyDocument();
    const v1 = { ...doc, schemaVersion: 1 } as Record<string, unknown>;
    delete v1.equipmentLayout;
    const result = parseDocument(JSON.stringify(v1));
    expect(result.ok).toBe(true);
    expect(result.document?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.document?.equipmentLayout).toEqual({});
  });

  it("v2 문서는 v3으로 마이그레이션된다 (learningActivity 없이 로드)", () => {
    const doc = createEmptyDocument();
    const v2 = { ...doc, schemaVersion: 2 } as Record<string, unknown>;
    const result = parseDocument(JSON.stringify(v2));
    expect(result.ok).toBe(true);
    expect(result.document?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.document?.meta.learningActivity).toBeUndefined();
  });

  it("learningActivity가 저장 왕복을 보존한다 (v3)", () => {
    let doc = createEmptyDocument("학습 활동 테스트");
    doc = { ...doc, meta: { ...doc.meta, learningActivity: "제어밸브 및 복동실린더를 활용한 시퀀스 제어" } };
    const result = parseDocument(serializeDocument(doc));
    expect(result.ok).toBe(true);
    expect(result.document?.meta.learningActivity).toBe(
      "제어밸브 및 복동실린더를 활용한 시퀀스 제어",
    );
  });

  it("더 새로운 스키마 버전은 거부한다", () => {
    const doc = createEmptyDocument();
    const json = serializeDocument({ ...doc, schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    const result = parseDocument(json);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("새로운 버전");
  });
});

describe("문서 조작", () => {
  it("부품 배치는 그리드에 스냅된다", () => {
    const { component } = addComponent(createEmptyDocument(), "pneu.source", { x: 103, y: 297 });
    expect(component.position).toEqual({ x: 100, y: 300 });
  });

  it("부품 배치 시 propertySchema 기본값이 채워진다", () => {
    const { component } = addComponent(createEmptyDocument(), "pneu.valve.3-2-manual", {
      x: 0,
      y: 0,
    });
    expect(component.properties).toEqual({ actuation: "pushbutton" });
  });

  it("이동·회전·속성 변경이 적용된다", () => {
    let doc = createEmptyDocument();
    const { doc: d1, component } = addComponent(doc, "pneu.source", { x: 0, y: 0 });
    doc = moveComponent(d1, component.id, { x: 50, y: 50 });
    doc = rotateComponent(doc, component.id);
    doc = updateComponentProperty(doc, component.id, "pressure", 8);

    const c = doc.components[0];
    expect(c.position).toEqual({ x: 50, y: 50 });
    expect(c.rotation).toBe(90);
    expect(c.properties.pressure).toBe(8);
  });

  it("부품 삭제 시 연결된 배선이 함께 삭제된다", () => {
    let doc = createEmptyDocument();
    const a = addComponent(doc, "pneu.source", { x: 0, y: 0 });
    const b = addComponent(a.doc, "pneu.cylinder.double", { x: 200, y: 0 });
    doc = addWire(
      b.doc,
      { componentId: a.component.id, portId: "P" },
      { componentId: b.component.id, portId: "HEAD" },
      [],
    );
    expect(doc.wires).toHaveLength(1);

    doc = deleteComponent(doc, a.component.id);
    expect(doc.components).toHaveLength(1);
    expect(doc.wires).toHaveLength(0);
  });
});

describe("포트와 배선 규칙", () => {
  it("회전된 부품의 포트 월드 좌표가 올바르다", () => {
    let doc = createEmptyDocument();
    const { doc: d1, component } = addComponent(doc, "pneu.source", { x: 100, y: 100 });
    doc = rotateComponent(d1, component.id); // 90도

    const rotated = doc.components[0];
    const port = getPortDefinition(rotated, "P")!;
    // 로컬 (0,-30)이 90도 회전 → (30, 0)
    expect(getPortWorldPosition(rotated, port)).toEqual({ x: 130, y: 100 });
  });

  it("유체 포트는 배관 1개만 허용한다", () => {
    let doc = createEmptyDocument();
    const src = addComponent(doc, "pneu.source", { x: 0, y: 0 });
    const cyl = addComponent(src.doc, "pneu.cylinder.double", { x: 200, y: 0 });
    const valve = addComponent(cyl.doc, "pneu.valve.3-2-manual", { x: 400, y: 0 });
    doc = addWire(
      valve.doc,
      { componentId: src.component.id, portId: "P" },
      { componentId: cyl.component.id, portId: "HEAD" },
      [],
    );

    const check = canConnect(
      doc,
      { componentId: src.component.id, portId: "P" },
      { componentId: valve.component.id, portId: "P" },
    );
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("이미 배관");
  });

  it("중복 연결과 자기 자신 연결을 거부한다", () => {
    let doc = createEmptyDocument();
    const a = addComponent(doc, "pneu.source", { x: 0, y: 0 });
    const b = addComponent(a.doc, "pneu.cylinder.double", { x: 200, y: 0 });
    const refA = { componentId: a.component.id, portId: "P" };
    const refB = { componentId: b.component.id, portId: "HEAD" };
    doc = addWire(b.doc, refA, refB, []);

    expect(canConnect(doc, refB, refA).ok).toBe(false);
    expect(canConnect(doc, refA, refA).ok).toBe(false);
  });
});

describe("직교 라우팅", () => {
  it("마주보는 포트는 일직선 (경유점은 스텁 끝 2개)", () => {
    const route = computeOrthogonalRoute({ x: 0, y: 0 }, "down", { x: 0, y: 100 }, "up");
    for (const p of route) expect(p.x).toBe(0);
  });

  it("어긋난 같은 축 포트는 Z자 경로", () => {
    const route = computeOrthogonalRoute({ x: 0, y: 0 }, "down", { x: 100, y: 100 }, "up");
    // 모든 인접 구간이 수평 또는 수직이어야 함
    const pts = [{ x: 0, y: 0 }, ...route, { x: 100, y: 100 }];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      expect(dx === 0 || dy === 0).toBe(true);
    }
  });

  it("직교 방향 포트는 L자 경로", () => {
    const route = computeOrthogonalRoute({ x: 0, y: 0 }, "right", { x: 100, y: 100 }, "up");
    const pts = [{ x: 0, y: 0 }, ...route, { x: 100, y: 100 }];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      expect(dx === 0 || dy === 0).toBe(true);
    }
  });
});
