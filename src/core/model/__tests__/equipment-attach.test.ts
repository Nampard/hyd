import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { createEmptyDocument } from "../types";
import {
  addComponent,
  getEquipmentAttachment,
  getEquipmentPosition,
  moveEquipment,
  rotateComponent,
  updateComponentProperty,
} from "../operations";
import type { CircuitDocument } from "../types";

/**
 * Phase 16-5 — 장비 뷰에서 리밋 스위치를 대상 실린더의 끝단에 부착한다.
 * 판정 로직(cylinderLabel + triggerAt)은 그대로 두고 표시 위치만 계산한다.
 */

beforeAll(() => {
  registerLibraries();
});

/** 실린더 A + 리밋 스위치 1개를 만든 문서 */
function rig(triggerAt: "retracted" | "extended", cylinderLabel = "A") {
  let doc: CircuitDocument = createEmptyDocument();
  const cyl = addComponent(doc, "pneu.cylinder.double", { x: 300, y: 200 });
  doc = updateComponentProperty(cyl.doc, cyl.component.id, "label", "A");
  const sw = addComponent(doc, "elec.limit-switch", { x: 50, y: 600 });
  doc = updateComponentProperty(sw.doc, sw.component.id, "cylinderLabel", cylinderLabel);
  doc = updateComponentProperty(doc, sw.component.id, "triggerAt", triggerAt);
  return { doc, cylinderId: cyl.component.id, switchId: sw.component.id };
}

const compOf = (doc: CircuitDocument, id: string) => doc.components.find((c) => c.id === id)!;

describe("장비 뷰 부착 (Phase 16-5)", () => {
  it("리밋 스위치는 대상 실린더의 후진단/전진단에 각각 부착된다", () => {
    const back = rig("retracted");
    expect(getEquipmentPosition(back.doc, compOf(back.doc, back.switchId))).toEqual({
      x: 348,
      y: 170,
    });

    const front = rig("extended");
    expect(getEquipmentPosition(front.doc, compOf(front.doc, front.switchId))).toEqual({
      x: 388,
      y: 170,
    });

    // 두 끝단의 부착 위치는 서로 다르다 (같은 자리에 겹쳐 그려지지 않는다)
    expect(getEquipmentPosition(back.doc, compOf(back.doc, back.switchId))).not.toEqual(
      getEquipmentPosition(front.doc, compOf(front.doc, front.switchId)),
    );
  });

  it("실린더를 장비 뷰에서 옮기면 부착된 스위치도 따라간다", () => {
    const { doc, cylinderId, switchId } = rig("retracted");
    const moved = moveEquipment(doc, cylinderId, { x: 500, y: 100 });
    expect(getEquipmentPosition(moved, compOf(moved, switchId))).toEqual({ x: 548, y: 70 });
  });

  it("실린더가 회전하면 부착 오프셋도 함께 회전한다", () => {
    const { doc, cylinderId, switchId } = rig("retracted");
    const turned = rotateComponent(doc, cylinderId); // 90°
    // (48, -30) 회전 90° → (30, 48)
    expect(getEquipmentPosition(turned, compOf(turned, switchId))).toEqual({ x: 330, y: 248 });
  });

  it("대상 실린더를 찾지 못하면 기존 자유 배치로 폴백한다", () => {
    const { doc, switchId } = rig("retracted", "없는이름표");
    expect(getEquipmentAttachment(doc, compOf(doc, switchId))).toBeNull();
    expect(getEquipmentPosition(doc, compOf(doc, switchId))).toEqual({ x: 50, y: 600 });
  });

  it("실린더가 아닌 부품은 부착 대상이 아니다", () => {
    const { doc, cylinderId } = rig("retracted");
    expect(getEquipmentAttachment(doc, compOf(doc, cylinderId))).toBeNull();
  });
});
