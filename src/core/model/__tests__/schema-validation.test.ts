import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { createEmptyDocument } from "../types";
import { parseDocument, serializeDocument } from "../schema";
import { addComponent, autoWire, deleteComponent } from "../operations";
import { computeOrthogonalRoute } from "../../routing";

/**
 * codex-review H1(문서 경계 검증)·M4(삭제 시 ioMap 정리)·M10(라우팅 역주행) 회귀 테스트
 */

beforeAll(() => {
  registerLibraries();
});

function baseDoc() {
  let doc = createEmptyDocument("검증 테스트");
  const a = addComponent(doc, "pneu.source", { x: 100, y: 300 });
  doc = a.doc;
  const b = addComponent(doc, "pneu.cylinder.single", { x: 100, y: 100 });
  doc = b.doc;
  doc = autoWire(
    doc,
    { componentId: a.component.id, portId: "P" },
    { componentId: b.component.id, portId: "HEAD" },
  );
  return { doc, srcId: a.component.id, cylId: b.component.id };
}

describe("H1: 문서 경계 검증", () => {
  it("정상 문서는 통과한다", () => {
    const { doc } = baseDoc();
    expect(parseDocument(serializeDocument(doc)).ok).toBe(true);
  });

  it("미등록 부품 타입을 거부한다", () => {
    const { doc } = baseDoc();
    const broken = {
      ...doc,
      components: [...doc.components.map((c, i) => (i === 0 ? { ...c, type: "unknown.type" } : c))],
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("등록되지 않은 부품 타입");
  });

  it("중복 부품 id를 거부한다", () => {
    const { doc } = baseDoc();
    const broken = {
      ...doc,
      components: doc.components.map((c) => ({ ...c, id: "dup" })),
      wires: [],
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("중복");
  });

  it("존재하지 않는 포트를 참조하는 배선을 거부한다", () => {
    const { doc } = baseDoc();
    const broken = {
      ...doc,
      wires: doc.wires.map((w) => ({ ...w, to: { ...w.to, portId: "NOPE" } })),
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("존재하지 않는 포트");
  });

  it("잘못된 회전값을 거부한다", () => {
    const { doc } = baseDoc();
    const broken = {
      ...doc,
      components: doc.components.map((c, i) => (i === 0 ? { ...c, rotation: 45 } : c)),
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("회전값");
  });

  it("배선 kind가 포트와 다르면 거부한다", () => {
    const { doc } = baseDoc();
    const broken = {
      ...doc,
      wires: doc.wires.map((w) => ({ ...w, kind: "electric" })),
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("배선 종류");
  });

  it("존재하지 않는 부품을 참조하는 ioMap을 거부한다", () => {
    const { doc } = baseDoc();
    const broken = {
      ...doc,
      ioMap: [{ device: "P0", direction: "input", componentId: "ghost" }],
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ioMap");
  });

  it("잘못된 equipmentLayout 좌표를 거부한다", () => {
    const { doc, srcId } = baseDoc();
    const broken = {
      ...doc,
      equipmentLayout: { [srcId]: { x: "abc", y: 0 } },
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("equipmentLayout");
  });

  it("PLC 셀 종류가 잘못되면 거부한다", () => {
    const { doc } = baseDoc();
    const broken = {
      ...doc,
      plcProgram: {
        rungs: [
          {
            id: "r1",
            cells: [[{ kind: "warp", device: "P0" }, null, null, null, null, null, null, null]],
            vlinks: [],
          },
        ],
      },
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("PLC 셀");
  });
});

describe("M4: 부품 삭제 시 ioMap 정리", () => {
  it("삭제된 부품의 ioMap 항목이 함께 제거된다", () => {
    const { doc, srcId, cylId } = baseDoc();
    const withMap = {
      ...doc,
      ioMap: [
        { device: "P0", direction: "input" as const, componentId: srcId },
        { device: "P1", direction: "input" as const, componentId: cylId },
      ],
    };
    const after = deleteComponent(withMap, srcId);
    expect(after.ioMap).toHaveLength(1);
    expect(after.ioMap?.[0].componentId).toBe(cylId);
  });
});

describe("M10: 같은 방향 일직선 포트 라우팅", () => {
  it.each([
    ["right", "right", { x: 0, y: 0 }, { x: 100, y: 0 }],
    ["left", "left", { x: 100, y: 0 }, { x: 0, y: 0 }],
    ["down", "down", { x: 0, y: 0 }, { x: 0, y: 100 }],
    ["up", "up", { x: 0, y: 100 }, { x: 0, y: 0 }],
  ] as const)("%s→%s 일직선은 목적지를 지나치지 않고 우회한다", (fromDir, toDir, from, to) => {
    const route = computeOrthogonalRoute(from, fromDir, to, toDir);
    const pts = [from, ...route, to];
    // 모든 구간이 직교
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      expect(dx === 0 || dy === 0).toBe(true);
    }
    // 역주행 검출: 어떤 축에서든 같은 좌표 구간을 두 번 왕복(전진 후 후진)하며 겹치면 안 됨
    // → 경로가 시작·끝점 직선 위에서만 움직이지 않고 우회점을 가져야 한다
    const detoured = route.some((p) =>
      from.y === to.y ? p.y !== from.y : p.x !== from.x,
    );
    expect(detoured).toBe(true);
  });

  it.each([
    ["right", "left", { x: 100, y: 0 }, { x: 0, y: 0 }],
    ["left", "right", { x: 0, y: 0 }, { x: 100, y: 0 }],
    ["down", "up", { x: 0, y: 100 }, { x: 0, y: 0 }],
    ["up", "down", { x: 0, y: 0 }, { x: 0, y: 100 }],
  ] as const)(
    "%s→%s 등지는 배치는 두 부품 사이 직선을 관통하지 않고 우회한다 (review-2 P1)",
    (fromDir, toDir, from, to) => {
      const route = computeOrthogonalRoute(from, fromDir, to, toDir);
      // 직선 연결(경유점 0)은 두 부품을 관통 — 우회점이 있어야 한다
      expect(route.length).toBeGreaterThan(0);
      const detoured = route.some((p) => (from.y === to.y ? p.y !== from.y : p.x !== from.x));
      expect(detoured).toBe(true);
    },
  );
});
