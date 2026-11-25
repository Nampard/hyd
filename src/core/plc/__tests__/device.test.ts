import { describe, expect, it } from "vitest";
import { nextFreeDevice, padDevice } from "../device";
import type { LadderProgram } from "../model";

describe("래더 디바이스 자릿수 (Phase 43)", () => {
  it("P·M은 5자리(끝자리 16진), T·C는 4자리로 0을 채운다", () => {
    expect(padDevice("P0")).toBe("P00000");
    expect(padDevice("p3")).toBe("P00003");
    expect(padDevice("M1A")).toBe("M0001A");
    expect(padDevice("P0000C")).toBe("P0000C");
    expect(padDevice("T0")).toBe("T0000");
    expect(padDevice("c12")).toBe("C0012");
    expect(padDevice("_T1S")).toBe("_T1S");
    expect(padDevice("")).toBe("");
  });

  it("새 요소에는 아직 안 쓴 가장 작은 주소를 고른다", () => {
    const program: LadderProgram = {
      rungs: [
        {
          id: "r",
          cells: [[{ kind: "no", device: "M0" }, { kind: "coil", device: "M00001" }, { kind: "ton", device: "T0000", preset: 3 }]],
          vlinks: [],
        },
      ],
    } as unknown as LadderProgram;
    expect(nextFreeDevice("M", program)).toBe("M00002");
    expect(nextFreeDevice("T", program)).toBe("T0001");
    expect(nextFreeDevice("C", program)).toBe("C0000");
    expect(nextFreeDevice("P", undefined, ["P00000"])).toBe("P00001");
  });
});
