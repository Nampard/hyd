import { useEffect, useState, type ReactElement } from "react";
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
import { ConveyorWorkspace } from "../ui/conveyor/ConveyorWorkspace";
import { PlcWorkspace } from "../ui/plcmode/PlcWorkspace";
import { ModeSelect } from "./ModeSelect";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

/** 앱 화면을 쓰기 위한 최소 CSS 폭 — styles.css의 좁은 화면 기준(max-width: 1079px)과 같다 */
const MIN_APP_WIDTH = 1080;

/** 현재 화면 폭 — 안내 화면에서 "지금 몇 px인지" 보여 줘 기기 확인을 돕는다 */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export function App(): ReactElement {
  const equipmentOpen = useEditorStore((s) => s.equipmentViewOpen);
  const appMode = useEditorStore((s) => s.appMode);
  const viewportWidth = useViewportWidth();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // 도면 편집 단축키는 공유압 회로 모드에서만 — 컨베이어 모드에는 고를 부품이 없다 (Phase 37)
      const mode = useEditorStore.getState().appMode;
      if (mode !== "circuit") {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && mode !== null && !useSimStore.getState().running) {
          e.preventDefault();
          if (e.shiftKey) useEditorStore.getState().redo();
          else useEditorStore.getState().undo();
        }
        return;
      }
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
      {appMode === null ? (
        <div className="app-layout">
          <ModeSelect />
        </div>
      ) : (
        <div className={`app-layout mode-${appMode}`}>
          <Toolbar />
          {appMode === "conveyor" ? (
            <ConveyorWorkspace />
          ) : appMode === "plc" ? (
            <PlcWorkspace />
          ) : (
            <>
              <div className="app-main">
                <Palette />
                <EditorCanvas />
                {equipmentOpen && <EquipmentView />}
                <PropertyPanel />
              </div>
              <DiagramPanel />
              <PlcPanel />
            </>
          )}
          <StatusBar />
        </div>
      )}
      <div className="narrow-screen-notice">
        <div className="narrow-screen-notice-box">
          <p className="app-name">HYD</p>
          <p>
            이 회로 작도 도구는 부품 목록·회로도·속성 창을 한 화면에 펼쳐 쓰므로
            가로 폭 {MIN_APP_WIDTH}px 이상의 화면이 필요합니다.
          </p>
          <p className="narrow-screen-hint-portrait">
            태블릿이라면 화면을 가로로 돌려 주세요.
          </p>
          <p className="narrow-screen-hint-landscape">
            PC·노트북이나 10인치 이상 태블릿(가로 모드)에서 이용해 주세요. PC라면
            브라우저 확대 비율을 낮추면(Ctrl + −) 열릴 수 있습니다.
          </p>
          <p className="narrow-screen-width">현재 화면 폭: {viewportWidth}px</p>
          <p className="narrow-screen-notice-en">
            This circuit editor needs a screen at least {MIN_APP_WIDTH}px wide. Rotate
            your tablet to landscape, or use a PC/laptop (try zooming out with Ctrl + −).
          </p>
        </div>
      </div>
    </>
  );
}
