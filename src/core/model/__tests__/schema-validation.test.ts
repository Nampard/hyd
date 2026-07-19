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

describe("스키마 v4: ioMap channel (Phase 14)", () => {
  /** 접점 부품이 있는 문서 — ioMap 입력 항목의 role 검사(elec-contact)를 통과시키기 위함 */
  function docWithButton() {
    let doc = createEmptyDocument("v4 테스트");
    const btn = addComponent(doc, "elec.pushbutton", { x: 100, y: 100 });
    doc = btn.doc;
    return { doc, btnId: btn.component.id };
  }

  it("v3 문서는 현재 버전(v5)으로 마이그레이션되어 로드된다", () => {
    const { doc } = docWithButton();
    const v3 = { ...doc, schemaVersion: 3 };
    const result = parseDocument(JSON.stringify(v3));
    expect(result.ok).toBe(true);
    expect(result.document?.schemaVersion).toBe(5);
  });

  it("v4 문서의 auto.mps-station 부품 type이 v5에서 auto.automation-station으로 변환된다", () => {
    let doc0 = createEmptyDocument("v5 마이그레이션");
    const st = addComponent(doc0, "auto.automation-station", { x: 300, y: 300 });
    doc0 = st.doc;
    // v4 저장 파일 재현: 옛 type 문자열로 되돌린 문서
    const v4 = {
      ...doc0,
      schemaVersion: 4,
      components: doc0.components.map((c) => ({ ...c, type: "auto.mps-station" })),
      ioMap: [
        { device: "P00000", direction: "input", componentId: st.component.id, channel: "PB1" },
      ],
    };
    const result = parseDocument(JSON.stringify(v4));
    expect(result.ok).toBe(true);
    expect(result.document?.schemaVersion).toBe(5);
    expect(result.document?.components[0].type).toBe("auto.automation-station");
    expect(result.document?.ioMap?.[0].channel).toBe("PB1"); // 채널 검증도 새 정의로 통과
  });

  it("channel이 있는 ioMap 항목이 저장·재열기에서 보존된다", () => {
    // channel은 다채널 부품(자동화설비 스테이션)에서만 유효 (14-3 의미 검증)
    let doc = createEmptyDocument("v4 채널 보존");
    const st = addComponent(doc, "auto.automation-station", { x: 300, y: 300 });
    doc = st.doc;
    const withChannel = {
      ...doc,
      ioMap: [
        { device: "P0", direction: "input" as const, componentId: st.component.id, channel: "PB1" },
      ],
    };
    const result = parseDocument(serializeDocument(withChannel));
    expect(result.ok).toBe(true);
    expect(result.document?.ioMap?.[0].channel).toBe("PB1");
  });

  it.each([
    ["숫자", 7],
    ["빈 문자열", ""],
    ["33자 초과", "x".repeat(33)],
  ])("잘못된 channel(%s)을 거부한다", (_label, channel) => {
    const { doc, btnId } = docWithButton();
    const broken = {
      ...doc,
      ioMap: [{ device: "P0", direction: "input", componentId: btnId, channel }],
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("채널");
  });

  it("ioMap 항목의 미등록 키는 재조립에서 제거된다", () => {
    let doc0 = createEmptyDocument("v4 키 재조립");
    const st = addComponent(doc0, "auto.automation-station", { x: 300, y: 300 });
    doc0 = st.doc;
    const withExtra = {
      ...doc0,
      ioMap: [
        {
          device: "P0",
          direction: "input",
          componentId: st.component.id,
          hack: "주입",
          channel: "PB1",
        },
      ],
    };
    const result = parseDocument(JSON.stringify(withExtra));
    expect(result.ok).toBe(true);
    const entry = result.document?.ioMap?.[0] as unknown as Record<string, unknown>;
    expect(entry.channel).toBe("PB1");
    expect("hack" in entry).toBe(false);
    // 직렬화에도 새어 나가지 않는다
    expect(serializeDocument(result.document!)).not.toContain("주입");
  });
});

describe("Phase 14-3: 16진 어드레스 + 다채널 의미 검증", () => {
  function docWithStation() {
    let doc = createEmptyDocument("다채널 테스트");
    const st = addComponent(doc, "auto.automation-station", { x: 300, y: 300 });
    doc = st.doc;
    const lamp = addComponent(doc, "elec.lamp", { x: 100, y: 100 });
    doc = lamp.doc;
    return { doc, stationId: st.component.id, lampId: lamp.component.id };
  }

  it("P/M 디바이스의 마지막 자리 16진(A~F)을 허용한다 (래더 셀·ioMap)", () => {
    const { doc, stationId } = docWithStation();
    const withHex = {
      ...doc,
      plcProgram: {
        rungs: [
          {
            id: "r1",
            cells: [[{ kind: "no", device: "P0000A" }, null, null, null, null, null, null,
              { kind: "coil", device: "M0010F" }]],
            vlinks: [],
          },
        ],
      },
      ioMap: [
        { device: "P0000A", direction: "input" as const, componentId: stationId, channel: "D후센" },
      ],
    };
    const result = parseDocument(JSON.stringify(withHex));
    expect(result.ok).toBe(true);
  });

  it("중간 자리 16진은 거부한다 (P00A00)", () => {
    const { doc } = docWithStation();
    const broken = {
      ...doc,
      plcProgram: {
        rungs: [
          {
            id: "r1",
            cells: [[{ kind: "no", device: "P00A00" }, null, null, null, null, null, null, null]],
            vlinks: [],
          },
        ],
      },
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("디바이스");
  });

  it("자동화설비 스테이션 항목에는 유효한 채널이 필수다", () => {
    const { doc, stationId } = docWithStation();
    // 채널 없음
    let result = parseDocument(
      JSON.stringify({
        ...doc,
        ioMap: [{ device: "P0", direction: "input", componentId: stationId }],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("채널");
    // 방향에 안 맞는 채널 (출력 채널을 입력에)
    result = parseDocument(
      JSON.stringify({
        ...doc,
        ioMap: [{ device: "P0", direction: "input", componentId: stationId, channel: "녹램" }],
      }),
    );
    expect(result.ok).toBe(false);
    // 올바른 조합
    result = parseDocument(
      JSON.stringify({
        ...doc,
        ioMap: [
          { device: "P0", direction: "input", componentId: stationId, channel: "PB1" },
          { device: "P19", direction: "output", componentId: stationId, channel: "녹램" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("단채널 부품에는 채널을 허용하지 않는다", () => {
    const { doc, lampId } = docWithStation();
    const result = parseDocument(
      JSON.stringify({
        ...doc,
        ioMap: [{ device: "P19", direction: "output", componentId: lampId, channel: "녹램" }],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("다채널");
  });
});

describe("P1-3: ioMap 유일성 (중복 매핑 거부)", () => {
  function docWithStation() {
    let doc = createEmptyDocument("유일성");
    const st = addComponent(doc, "auto.automation-station", { x: 300, y: 300 });
    return { doc: st.doc, stationId: st.component.id };
  }

  it("같은 (방향, 디바이스)가 중복되면 거부한다", () => {
    const { doc, stationId } = docWithStation();
    const dup = {
      ...doc,
      ioMap: [
        { device: "P00019", direction: "output", componentId: stationId, channel: "녹램" },
        { device: "P00019", direction: "output", componentId: stationId, channel: "황램" },
      ],
    };
    const result = parseDocument(JSON.stringify(dup));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("중복");
  });

  it("같은 (부품, 방향, 채널)이 중복되면 거부한다 — 배열 순서로 결과가 뒤집히는 것 차단", () => {
    const { doc, stationId } = docWithStation();
    const dup = {
      ...doc,
      ioMap: [
        { device: "P00000", direction: "input", componentId: stationId, channel: "PB1" },
        { device: "P00001", direction: "input", componentId: stationId, channel: "PB1" },
      ],
    };
    const result = parseDocument(JSON.stringify(dup));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("중복");
  });

  it("같은 디바이스라도 방향이 다르면 허용한다", () => {
    const { doc, stationId } = docWithStation();
    const ok = {
      ...doc,
      ioMap: [
        { device: "P00000", direction: "input", componentId: stationId, channel: "PB1" },
        { device: "P00010", direction: "output", componentId: stationId, channel: "A전솔" },
      ],
    };
    expect(parseDocument(JSON.stringify(ok)).ok).toBe(true);
  });
});

describe("P2-1: 특수릴레이 출력 금지", () => {
  it("_T1S를 출력 코일 대상으로 쓰면 거부한다", () => {
    const doc = createEmptyDocument("특수릴레이");
    const broken = {
      ...doc,
      plcProgram: {
        rungs: [
          {
            id: "r1",
            cells: [[{ kind: "no", device: "P0" }, null, null, null, null, null, null, { kind: "coil", device: "_T1S" }]],
            vlinks: [],
          },
        ],
      },
    };
    const result = parseDocument(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("특수릴레이");
  });

  it("_T1S를 접점으로는 쓸 수 있다", () => {
    const doc = createEmptyDocument("특수릴레이 접점");
    const ok = {
      ...doc,
      plcProgram: {
        rungs: [
          {
            id: "r1",
            cells: [[{ kind: "no", device: "_T1S" }, null, null, null, null, null, null, { kind: "coil", device: "P19" }]],
            vlinks: [],
          },
        ],
      },
    };
    expect(parseDocument(JSON.stringify(ok)).ok).toBe(true);
  });
});
