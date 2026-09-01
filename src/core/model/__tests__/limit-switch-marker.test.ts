import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { createEmptyDocument } from "../types";
import {
  addComponent,
  getEquipmentPosition,
  getLimitSwitchMarkers,
  moveEquipment,
  rotateComponent,
  updateComponentProperty,
} from "../operations";
import type { CircuitDocument } from "../types";

/**
 * Phase 19-4 — 리밋 스위치는 도면처럼 **두 자리에 나눠** 표시한다.
 * 부품 자체는 전기 배선 자리에 그대로 두고(배선이 패널을 가로지르지 않도록),
 * 실린더 옆에는 표시 전용 장치 마커만 덧그린다.
 */

beforeAll(() => {
  registerLibraries();
});

/** 실린더 A + 리밋 스위치들 */
function rig(switches: { triggerAt: "retracted" | "extended"; name: string; label?: string }[]) {
  let doc: CircuitDocument = createEmptyDocument();
  const cyl = addComponent(doc, "pneu.cylinder.double", { x: 300, y: 200 });
  doc = updateComponentProperty(cyl.doc, cyl.component.id, "label", "A");
  const switchIds: string[] = [];
  for (const spec of switches) {
    const sw = addComponent(doc, "elec.limit-switch", { x: 50, y: 600 });
    doc = updateComponentProperty(sw.doc, sw.component.id, "cylinderLabel", spec.label ?? "A");
    doc = updateComponentProperty(doc, sw.component.id, "triggerAt", spec.triggerAt);
    doc = updateComponentProperty(doc, sw.component.id, "name", spec.name);
    switchIds.push(sw.component.id);
  }
  return { doc, cylinderId: cyl.component.id, switchIds };
}

const compOf = (doc: CircuitDocument, id: string) => doc.components.find((c) => c.id === id)!;

describe("리밋 스위치 표시 (Phase 19-4)", () => {
  it("스위치 부품은 자기 배치 좌표에 남는다 — 실린더로 끌려가지 않는다", () => {
    const { doc, switchIds } = rig([{ triggerAt: "retracted", name: "S1" }]);
    // 배선이 패널을 가로지르지 않도록 부품은 놓인 자리를 지킨다
    expect(getEquipmentPosition(doc, compOf(doc, switchIds[0]))).toEqual({ x: 50, y: 600 });
  });

  it("실린더 양 끝단에 각각 마커가 생긴다", () => {
    const { doc } = rig([
      { triggerAt: "retracted", name: "S1" },
      { triggerAt: "extended", name: "S2" },
    ]);
    const markers = getLimitSwitchMarkers(doc);
    expect(markers).toHaveLength(2);

    const back = markers.find((m) => m.atRetracted)!;
    const front = markers.find((m) => !m.atRetracted)!;
    // 회로도: 실린더 기호의 로드 끝 (후진 44 · 전진 84) 위
    expect(back.position).toEqual({ x: 344, y: 158 });
    expect(front.position).toEqual({ x: 384, y: 158 });
    // 장비 뷰: 스프라이트의 로드 캠 (후진 48 · 전진 88) 위
    expect(back.equipmentPosition).toEqual({ x: 348, y: 170 });
    expect(front.equipmentPosition).toEqual({ x: 388, y: 170 });
    expect(back.names).toBe("S1");
    expect(front.names).toBe("S2");
  });

  it("같은 끝단을 감지하는 스위치가 여러 개여도 마커는 하나로 묶인다", () => {
    // A+B+A−B− 예제처럼 같은 이름의 스위치가 여러 렁에 쓰이는 경우
    const { doc, switchIds } = rig([
      { triggerAt: "retracted", name: "S1" },
      { triggerAt: "retracted", name: "S1" },
      { triggerAt: "retracted", name: "S5" },
    ]);
    const markers = getLimitSwitchMarkers(doc);
    expect(markers).toHaveLength(1); // 한 점에 겹쳐 쌓이지 않는다
    expect(markers[0].switchIds).toEqual(switchIds);
    expect(markers[0].names).toBe("S1,S5"); // 이름은 중복 없이 모아 표시
  });

  it("실린더를 장비 뷰에서 옮기면 마커도 따라간다", () => {
    const { doc, cylinderId } = rig([{ triggerAt: "retracted", name: "S1" }]);
    const moved = moveEquipment(doc, cylinderId, { x: 500, y: 100 });
    const marker = getLimitSwitchMarkers(moved)[0];
    expect(marker.equipmentPosition).toEqual({ x: 548, y: 70 });
    // 회로도 좌표는 실린더의 회로도 위치를 그대로 따른다
    expect(marker.position).toEqual({ x: 344, y: 158 });
  });

  it("실린더가 회전하면 마커 오프셋도 함께 회전한다", () => {
    const { doc, cylinderId } = rig([{ triggerAt: "retracted", name: "S1" }]);
    const turned = rotateComponent(doc, cylinderId); // 90°
    const marker = getLimitSwitchMarkers(turned)[0];
    // 회로도 (44, -42) 회전 90° → (42, 44)
    expect(marker.position).toEqual({ x: 342, y: 244 });
    // 장비 뷰 (48, -30) 회전 90° → (30, 48)
    expect(marker.equipmentPosition).toEqual({ x: 330, y: 248 });
  });

  it("감지 대상 실린더를 찾지 못하면 마커를 만들지 않는다", () => {
    const { doc } = rig([{ triggerAt: "retracted", name: "S1", label: "없는이름표" }]);
    expect(getLimitSwitchMarkers(doc)).toEqual([]);
  });
});
