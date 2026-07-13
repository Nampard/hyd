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
  );
}
