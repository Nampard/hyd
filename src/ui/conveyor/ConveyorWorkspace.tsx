import type { ReactElement } from "react";
import { useEditorStore } from "../editor/store";
import { PropertyPanel } from "../editor/PropertyPanel";
import { PlcPanel } from "../plc/PlcPanel";
import { StationStage } from "./StationStage";

/**
 * 컨베이어 시스템 모드의 작업 화면 (Phase 37).
 *
 * 공유압 회로 모드와 달리 기호를 놓고 배선하는 도면이 없다. 스테이션 한 대가 이미 놓여 있고
 * I/O 맵도 갖춰져 있어, 학생은 래더를 쓰고 조작 패널로 운전해 결과를 본다.
 *   ┌ 장비 무대 (공정 단계 · 사진 · 조작 패널) ───────┬ 속성 (매거진 물품·학습 활동) ┐
 *   ├ PLC 래더 + I/O 맵 ─────────────────────────────┴───────────────────────────────┤
 */
export function ConveyorWorkspace(): ReactElement {
  const station = useEditorStore((s) => s.document.components[0]);
  return (
    <div className="conveyor-workspace">
      <div className="conveyor-top">
        {station ? (
          <StationStage stationId={station.id} properties={station.properties} />
        ) : (
          <div className="conveyor-missing">
            이 과제에는 스테이션이 없습니다. [새 과제]로 스테이션이 놓인 과제를 시작하세요.
          </div>
        )}
        <PropertyPanel />
      </div>
      <PlcPanel alwaysOpen />
    </div>
  );
}
