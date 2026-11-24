import { describe, expect, it } from "vitest";
import { createAutomationState } from "../../../core/sim/automation-station";
import { activeStages, autoZone, followZone, ZoneFollower } from "../ConveyorScene";

describe("장비 모니터 자동 추적 카메라 (Phase 35)", () => {
  it("정지 상태에서는 전체를 본다", () => {
    const state = createAutomationState({ workpieces: "금,비" });
    expect(activeStages(state).size).toBe(0);
    expect(followZone(state)).toBe("all");
  });

  it("공급·가공·송출 중에는 공급부를 본다", () => {
    const state = createAutomationState({ workpieces: "금" });
    state.cyl.A = 0.4;
    expect(activeStages(state).has("supply")).toBe(true);
    expect(followZone(state)).toBe("supply");
    state.cyl.A = 0;
    state.cyl.B = 0.6;
    expect(activeStages(state).has("drill")).toBe(true);
    expect(followZone(state)).toBe("supply");
  });

  it("벨트 위 공작물은 검출 → 분류 순서로 따라가고, 하류 단계를 우선한다", () => {
    const state = createAutomationState({});
    state.belt.push({ material: "metal", progress: 0.1 });
    expect(followZone(state)).toBe("detect");
    state.cyl.A = 0.5; // 다음 공작물 공급이 동시에 진행돼도
    expect(followZone(state)).toBe("detect");
    state.belt[0].progress = 0.5;
    expect(followZone(state)).toBe("sort");
  });
});

describe("자동 추적 흔들림 방지 (Phase 36)", () => {
  it("자동 추적은 검출·분류를 벨트 전체 한 시점으로 묶는다", () => {
    const state = createAutomationState({});
    state.belt.push({ material: "metal", progress: 0.1 });
    expect(autoZone(state)).toBe("belt");
    state.belt[0].progress = 0.5;
    expect(autoZone(state)).toBe("belt");
  });

  it("판정이 잠깐 바뀌었다 돌아오면 시점을 옮기지 않는다", () => {
    const f = new ZoneFollower();
    expect(f.update("supply", 0)).toBe("all");
    expect(f.update("supply", ZoneFollower.SETTLE_MS)).toBe("supply");
    // 0.2초 동안만 벨트로 튀었다 돌아옴 → 무시
    const t = ZoneFollower.SETTLE_MS + ZoneFollower.HOLD_MS;
    expect(f.update("belt", t)).toBe("supply");
    expect(f.update("belt", t + 200)).toBe("supply");
    expect(f.update("supply", t + 300)).toBe("supply");
  });

  it("옮긴 직후에는 머물고, 사이클 사이 짧은 정지에서는 전체로 물러나지 않는다", () => {
    const f = new ZoneFollower();
    f.update("supply", 0);
    f.update("supply", ZoneFollower.SETTLE_MS);
    const switched = ZoneFollower.SETTLE_MS;
    // 바로 벨트 판정이 안정돼도 HOLD 동안은 공급부에 머문다
    f.update("belt", switched + 10);
    expect(f.update("belt", switched + ZoneFollower.SETTLE_MS + 20)).toBe("supply");
    expect(f.update("belt", switched + ZoneFollower.HOLD_MS)).toBe("belt");
    // 2초 정지는 전체로 물러나지 않음, IDLE_MS를 넘기면 물러남
    const t = switched + ZoneFollower.HOLD_MS;
    expect(f.update("all", t + 100)).toBe("belt");
    expect(f.update("all", t + 2100)).toBe("belt");
    expect(f.update("all", t + 100 + ZoneFollower.IDLE_MS)).toBe("all");
  });
});
