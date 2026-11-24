import { describe, expect, it } from "vitest";
import { createAutomationState } from "../../../core/sim/automation-station";
import { activeStages, followZone } from "../ConveyorScene";

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
