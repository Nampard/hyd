import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerLibraries } from "../../../core/library";
import { getExample } from "../../../core/examples";
import { useEditorStore } from "../store";

beforeAll(() => {
  registerLibraries();
});

describe("작업 모드 전환 (Phase 37)", () => {
  beforeEach(() => {
    useEditorStore.setState({ appMode: null });
    useEditorStore.getState().newDocument();
  });

  it("처음에는 모드를 고르지 않은 상태다", () => {
    expect(useEditorStore.getState().appMode).toBeNull();
  });

  it("컨베이어 모드로 들어가면 스테이션이 놓인 새 과제가 열리고 스테이션이 선택된다", () => {
    useEditorStore.getState().enterMode("conveyor");
    const s = useEditorStore.getState();
    expect(s.appMode).toBe("conveyor");
    expect(s.document.components).toHaveLength(1);
    expect(s.selection).toEqual({ type: "component", id: s.document.components[0].id });
    // 컨베이어의 "새 과제"도 스테이션을 갖춘다
    s.newDocument();
    expect(useEditorStore.getState().document.components).toHaveLength(1);
  });

  it("회로 모드로 돌아가면 빈 회로가 되고, 같은 모드로 다시 들어가면 작업을 이어 간다", () => {
    const s = useEditorStore.getState();
    s.enterMode("conveyor");
    s.enterMode("circuit");
    expect(useEditorStore.getState().document.components).toHaveLength(0);
    useEditorStore.getState().loadDocument(getExample("a-b-sequence")!.build());
    const loaded = useEditorStore.getState().document;
    useEditorStore.getState().leaveMode();
    useEditorStore.getState().enterMode("circuit");
    expect(useEditorStore.getState().document).toBe(loaded);
  });

  it("다른 모드의 문서를 불러오면 그 모드로 바뀐다", () => {
    useEditorStore.getState().enterMode("circuit");
    useEditorStore.getState().loadDocument(getExample("automation-basic")!.build());
    expect(useEditorStore.getState().appMode).toBe("conveyor");
    expect(useEditorStore.getState().statusMessage).toContain("컨베이어 시스템 모드로 바꿨습니다");
    useEditorStore.getState().loadDocument(getExample("a-b-sequence")!.build());
    expect(useEditorStore.getState().appMode).toBe("circuit");
  });
});
