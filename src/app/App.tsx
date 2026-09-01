import { useEffect, type ReactElement } from "react";
import { EditorCanvas } from "../ui/editor/EditorCanvas";
import { Palette } from "../ui/editor/Palette";
import { PropertyPanel } from "../ui/editor/PropertyPanel";
import { Toolbar } from "../ui/editor/Toolbar";
import { StatusBar } from "../ui/editor/StatusBar";
import { PlcPanel } from "../ui/plc/PlcPanel";
import { DiagramPanel } from "../ui/diagram/DiagramPanel";
import { EquipmentView } from "../ui/equipment/EquipmentView";
import { useEditorStore } from "../ui/editor/store";
import { useSimStore } from "../ui/sim/simStore";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

export function App(): ReactElement {
  const equipmentOpen = useEditorStore((s) => s.equipmentViewOpen);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (useSimStore.getState().running) return; // 시뮬레이션 중 편집 단축키 잠금
      const s = useEditorStore.getState();

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      // 부품 복사·붙여넣기 (Phase 16-3). 입력란 포커스·시뮬레이션 중에는 위에서 이미 제외된다
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        s.copySelection();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        s.pasteClipboard();
        return;
      }

      switch (e.key) {
        case "Delete":
        case "Backspace":
          e.preventDefault();
          s.deleteSelection();
          break;
        case "r":
        case "R":
          s.rotateSelection();
          break;
        case "Escape":
          s.cancelWire();
          s.cancelPlacing();
          s.select(null);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <div className="app-layout">
        <Toolbar />
        <div className="app-main">
          <Palette />
          <EditorCanvas />
          {equipmentOpen && <EquipmentView />}
          <PropertyPanel />
        </div>
        <DiagramPanel />
        <PlcPanel />
        <StatusBar />
      </div>
      <div className="narrow-screen-notice">
        <div className="narrow-screen-notice-box">
          <p className="app-name">HYD</p>
          <p>
            이 회로 작도 도구는 정밀한 마우스 조작이 필요해 PC·노트북의 넓은 화면에
            최적화되어 있습니다. 태블릿(가로모드)이나 PC에서 이용해 주세요.
          </p>
          <p className="narrow-screen-notice-en">
            This circuit editor requires precise mouse input and a wide screen.
            Please use a PC/laptop or a tablet in landscape mode.
          </p>
        </div>
      </div>
    </>
  );
}
