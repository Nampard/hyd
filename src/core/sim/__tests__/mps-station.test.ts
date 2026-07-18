import { describe, expect, it } from "vitest";
import {
  createMpsState,
  mpsInputs,
  parseWorkpieceQueue,
  stepMpsStation,
  MPS_MAGAZINE_MAX,
  type MpsOutputChannel,
  type MpsStationState,
} from "../mps-station";

/**
 * Phase 14-2: MPS 스테이션 물리 상태기계 단위 테스트.
 * PLC 없이 출력 채널을 스크립트로 구동해, 설비가 "물리만" 올바르게
 * 시뮬레이션하는지 검증한다 (래더 연동 골든 테스트는 Phase 14-5).
 */

const DT = 0.02;

function run(
  state: MpsStationState,
  on: MpsOutputChannel[],
  seconds: number,
): void {
  const set = new Set(on);
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) stepMpsStation(state, (ch) => set.has(ch), DT);
}

describe("매거진 큐 파싱", () => {
  it("금/비 축약과 전체 표기를 인식하고 잘못된 토큰은 무시한다", () => {
    expect(parseWorkpieceQueue("금, 비금속 ,금속,x,비")).toEqual([
      "metal",
      "nonmetal",
      "metal",
      "nonmetal",
    ]);
  });

  it("최대 적재 수를 넘지 않는다", () => {
    const many = new Array(20).fill("금").join(",");
    expect(parseWorkpieceQueue(many)).toHaveLength(MPS_MAGAZINE_MAX);
  });

  it("문자열이 아니면 빈 큐", () => {
    expect(parseWorkpieceQueue(7)).toEqual([]);
  });
});

describe("A실린더 공급 + 판별 센서", () => {
  it("A 전진 완료 시 매거진 → 공급 위치, 용량형/유도형이 재질을 반영한다", () => {
    const state = createMpsState({ workpieces: "금,비" });
    expect(mpsInputs(state).매거진).toBe(true);
    expect(mpsInputs(state).용량형).toBe(false);

    run(state, ["A전솔"], 0.7); // 전 행정 0.5s + 여유
    expect(mpsInputs(state).A전센).toBe(true);
    expect(state.supply).toBe("metal");
    expect(state.magazine).toHaveLength(1);
    expect(mpsInputs(state).용량형).toBe(true);
    expect(mpsInputs(state).유도형).toBe(true); // 금속

    run(state, ["A후솔"], 0.7); // 양솔 복귀
    expect(mpsInputs(state).A후센).toBe(true);
  });

  it("양솔 무신호에서는 위치를 유지한다 (임펄스)", () => {
    const state = createMpsState({});
    run(state, ["A전솔"], 0.3); // 중간까지 전진
    const mid = state.cyl.A;
    expect(mid).toBeGreaterThan(0.3);
    run(state, [], 0.5); // 무신호
    expect(state.cyl.A).toBe(mid);
  });

  it("공급 위치가 차 있으면 재전진해도 매거진이 줄지 않는다 (잼 방지)", () => {
    const state = createMpsState({ workpieces: "금,비" });
    run(state, ["A전솔"], 0.7);
    run(state, ["A후솔"], 0.7);
    expect(state.supply).toBe("metal");
    run(state, ["A전솔"], 0.7); // supply 점유 중 재전진
    expect(state.magazine).toHaveLength(1); // 그대로
    expect(state.supply).toBe("metal");
  });

  it("빈 매거진: 센서 꺼짐, 전진해도 무변화", () => {
    const state = createMpsState({ workpieces: "금" });
    run(state, ["A전솔"], 0.7);
    run(state, ["A후솔"], 0.7);
    expect(mpsInputs(state).매거진).toBe(false);
    run(state, ["A전솔"], 0.7);
    expect(state.supply).toBe("metal"); // 첫 물품 그대로, 추가 공급 없음
  });
});

describe("편솔 스프링 복귀 (B/C/D)", () => {
  it("전솔 OFF면 후진한다", () => {
    const state = createMpsState({});
    run(state, ["B전솔"], 0.7);
    expect(mpsInputs(state).B전센).toBe(true);
    run(state, [], 0.7);
    expect(mpsInputs(state).B후센).toBe(true);
  });
});

describe("C 이송 → 컨베이어 → 분류", () => {
  /** 물품 하나를 공급 위치까지 올려놓는 헬퍼 */
  function supplied(material: string): MpsStationState {
    const state = createMpsState({ workpieces: material });
    run(state, ["A전솔"], 0.7);
    run(state, ["A후솔"], 0.7);
    return state;
  }

  it("비금속: D 미작동 → 포토센서 통과 → 컨베이어 끝 저장박스", () => {
    const state = supplied("비");
    run(state, ["C전솔"], 0.7); // 컨베이어 초입으로 이송
    expect(state.supply).toBeNull();
    expect(state.belt).toHaveLength(1);

    run(state, ["컨베이어"], 0.5); // 초입 통과 중
    expect(mpsInputs(state).포토).toBe(true);

    run(state, ["컨베이어"], 7); // 전 구간 6s
    expect(state.belt).toHaveLength(0);
    expect(state.store).toEqual(["nonmetal"]);
    expect(state.eject).toHaveLength(0);
  });

  it("금속: D 전진 상태로 게이트 통과 → 배출박스", () => {
    const state = supplied("금");
    run(state, ["C전솔"], 0.7);
    run(state, ["컨베이어", "D전솔"], 7); // D 게이트 열림 유지
    expect(state.eject).toEqual(["metal"]);
    expect(state.store).toHaveLength(0);
  });

  it("컨베이어 초입이 차 있으면 C가 밀어도 이송되지 않는다 (잼 방지)", () => {
    const state = supplied("금");
    run(state, ["C전솔"], 0.7);
    run(state, [], 0.7); // C 복귀 — 벨트는 멈춰 있어 초입 점유 유지
    // 두 번째 물품을 공급 위치로
    state.magazine = ["nonmetal"];
    run(state, ["A전솔"], 0.7);
    run(state, ["A후솔"], 0.7);
    run(state, ["C전솔"], 0.7); // 초입 점유 중 재이송 시도
    expect(state.belt).toHaveLength(1); // 그대로
    expect(state.supply).toBe("nonmetal"); // 이송 안 됨
  });

  it("컨베이어 OFF면 물품이 이동하지 않는다", () => {
    const state = supplied("비");
    run(state, ["C전솔"], 0.7);
    const before = state.belt[0].progress;
    run(state, [], 2);
    expect(state.belt[0].progress).toBe(before);
  });
});

describe("램프·드릴 (시각 상태)", () => {
  it("램프는 출력 채널을 그대로 반영한다", () => {
    const state = createMpsState({});
    run(state, ["녹램"], DT);
    expect(state.lamps).toEqual({ red: false, yellow: false, green: true });
  });

  it("드릴모터 ON이면 회전각이 진행된다", () => {
    const state = createMpsState({});
    run(state, ["드릴모터"], 0.1);
    expect(state.drillAngle).toBeGreaterThan(0);
  });
});

describe("Phase 14-3: 엔진 ioMap 채널 연동 (PLC ↔ 스테이션)", () => {
  it("PB1 입력 채널 → 래더 → 녹램 출력 채널이 한 틱 안에 연결된다", async () => {
    const { registerLibraries } = await import("../../library");
    const { createEmptyDocument } = await import("../../model/types");
    const { addComponent } = await import("../../model/operations");
    const { rungOf, lc } = await import("../../examples");
    const { SimulationEngine } = await import("../engine");
    registerLibraries();

    let doc = createEmptyDocument("MPS 채널 연동");
    const st = addComponent(doc, "auto.mps-station", { x: 300, y: 300 });
    doc = st.doc;
    const stationId = st.component.id;
    doc = {
      ...doc,
      // 매거진(P0000C)이 있으면 컨베이어(P00016), PB1(P00000)이면 녹램(P00019)
      plcProgram: {
        rungs: [
          rungOf([[lc("no", "P00000"), lc("coil", "P00019")]]),
          rungOf([[lc("no", "P0000C"), lc("coil", "P00016")]]),
        ],
      },
      ioMap: [
        { device: "P00000", direction: "input", componentId: stationId, channel: "PB1" },
        { device: "P0000C", direction: "input", componentId: stationId, channel: "매거진" },
        { device: "P00019", direction: "output", componentId: stationId, channel: "녹램" },
        { device: "P00016", direction: "output", componentId: stationId, channel: "컨베이어" },
      ],
    };
    const engine = new SimulationEngine(doc);

    // PB 안 누름: 녹램 꺼짐. 매거진(기본 금,비,금)은 차 있으므로 컨베이어 가동
    let snap = engine.tick(0.02);
    engine.tick(0.02); // 출력 반영 후 스테이션 물리 1틱 더
    snap = engine.snapshot();
    expect(snap.components[stationId].mps?.lamps.green).toBe(false);
    const offset1 = snap.components[stationId].mps?.beltOffset ?? 0;
    expect(offset1).toBeGreaterThan(0); // 매거진 → 컨베이어 출력 → 벨트 진행

    engine.setMpsButton(stationId, 0, true); // PB1 누름
    engine.tick(0.02);
    engine.tick(0.02);
    snap = engine.snapshot();
    expect(snap.components[stationId].mps?.lamps.green).toBe(true);

    engine.setMpsButton(stationId, 0, false);
    engine.tick(0.02);
    engine.tick(0.02);
    snap = engine.snapshot();
    expect(snap.components[stationId].mps?.lamps.green).toBe(false);
  });
});
