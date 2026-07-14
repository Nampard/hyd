import { useState, type ReactElement } from "react";
import { useEditorStore } from "../editor/store";
import { useSimStore } from "../sim/simStore";
import {
  createEmptyProgram,
  createRung,
  isOutputKind,
  LADDER_COLS,
  OUTPUT_COL,
  type IoEntry,
  type LadderCell,
  type LadderCellKind,
  type LadderProgram,
  type LadderRung,
} from "../../core/plc/model";
import { getComponentDefinition } from "../../core/library/registry";

/**
 * PLC 래더 편집·모니터링 패널 (XG5000 스타일 단순화).
 * 도구를 고른 뒤 셀을 클릭해 배치하고, 선택 셀의 디바이스/설정값을 입력한다.
 * 시뮬레이션 중에는 통전 셀이 강조된다 (모니터 모드).
 */

type Tool = LadderCellKind | "erase" | "vlink";

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: "no", label: "─┤ ├─", title: "a접점 (NO)" },
  { id: "nc", label: "─┤/├─", title: "b접점 (NC)" },
  { id: "hline", label: "───", title: "가로 연결선" },
  { id: "vlink", label: "│", title: "수직 연결 (OR 분기) — 셀 오른쪽 경계 토글" },
  { id: "coil", label: "─( )─", title: "출력 코일 (OUT)" },
  { id: "set", label: "(S)", title: "SET 코일" },
  { id: "rst", label: "(R)", title: "RST 코일" },
  { id: "ton", label: "TON", title: "온딜레이 타이머" },
  { id: "toff", label: "TOFF", title: "오프딜레이 타이머" },
  { id: "ctu", label: "CTU", title: "업 카운터" },
  { id: "ctd", label: "CTD", title: "다운 카운터" },
  { id: "erase", label: "지우기", title: "셀 비우기" },
];

function defaultDevice(kind: LadderCellKind): string {
  switch (kind) {
    case "ton":
    case "toff":
      return "T0";
    case "ctu":
    case "ctd":
      return "C0";
    case "coil":
    case "set":
    case "rst":
      return "M0";
    default:
      return "P0";
  }
}

function cellLabel(cell: LadderCell): string {
  switch (cell.kind) {
    case "no":
      return `┤ ├ ${cell.device ?? ""}`;
    case "nc":
      return `┤/├ ${cell.device ?? ""}`;
    case "hline":
      return "─────";
    case "coil":
      return `( ) ${cell.device ?? ""}`;
    case "set":
      return `(S) ${cell.device ?? ""}`;
    case "rst":
      return `(R) ${cell.device ?? ""}`;
    case "ton":
      return `TON ${cell.device ?? ""} ${cell.preset ?? 0}s`;
    case "toff":
      return `TOFF ${cell.device ?? ""} ${cell.preset ?? 0}s`;
    case "ctu":
      return `CTU ${cell.device ?? ""} ×${cell.preset ?? 0}`;
    case "ctd":
      return `CTD ${cell.device ?? ""} ×${cell.preset ?? 0}`;
  }
}

export function PlcPanel(): ReactElement | null {
  const open = useEditorStore((s) => s.plcPanelOpen);
  const doc = useEditorStore((s) => s.document);
  const running = useSimStore((s) => s.running);
  const plcMonitor = useSimStore((s) => s.snapshot?.plc ?? null);
  const [tool, setTool] = useState<Tool>("no");
  const [selected, setSelected] = useState<{ rungId: string; r: number; c: number } | null>(null);

  if (!open) return null;

  const program: LadderProgram = doc.plcProgram ?? createEmptyProgram();
  const ioMap: IoEntry[] = doc.ioMap ?? [];

  const commitProgram = (next: LadderProgram) => {
    useEditorStore.getState().commitDocument({ ...doc, plcProgram: next });
  };
  const commitIoMap = (next: IoEntry[]) => {
    useEditorStore.getState().commitDocument({ ...doc, ioMap: next });
  };

  const updateRung = (rungId: string, fn: (rung: LadderRung) => LadderRung) => {
    commitProgram({
      rungs: program.rungs.map((rung) => (rung.id === rungId ? fn(rung) : rung)),
    });
  };

  const handleCellClick = (rung: LadderRung, r: number, c: number) => {
    if (running) return;
    setSelected({ rungId: rung.id, r, c });
    if (tool === "vlink") {
      if (r + 1 >= rung.cells.length) {
        useEditorStore.getState().setStatus("수직 연결은 아랫줄이 있는 행에서만 만들 수 있습니다.");
        return;
      }
      // 셀 오른쪽 경계 (노드 열 c+1)에서 아랫줄 연결 토글
      updateRung(rung.id, (rg) => {
        const exists = rg.vlinks.some((v) => v.r === r && v.c === c + 1);
        return {
          ...rg,
          vlinks: exists
            ? rg.vlinks.filter((v) => !(v.r === r && v.c === c + 1))
            : [...rg.vlinks, { r, c: c + 1 }],
        };
      });
      return;
    }
    if (tool === "erase") {
      updateRung(rung.id, (rg) => ({
        ...rg,
        cells: rg.cells.map((row, ri) =>
          ri === r ? row.map((cell, ci) => (ci === c ? null : cell)) : row,
        ),
      }));
      return;
    }
    const kind = tool as LadderCellKind;
    if (isOutputKind(kind) && c !== OUTPUT_COL) {
      useEditorStore.getState().setStatus("출력 요소는 마지막 열에만 놓을 수 있습니다.");
      return;
    }
    if (!isOutputKind(kind) && c === OUTPUT_COL && kind !== "hline") {
      useEditorStore.getState().setStatus("마지막 열은 출력 전용입니다.");
      return;
    }
    const newCell: LadderCell = {
      kind,
      device: kind === "hline" ? undefined : defaultDevice(kind),
      preset: ["ton", "toff", "ctu", "ctd"].includes(kind) ? 3 : undefined,
    };
    updateRung(rung.id, (rg) => ({
      ...rg,
      cells: rg.cells.map((row, ri) =>
        ri === r ? row.map((cell, ci) => (ci === c ? newCell : cell)) : row,
      ),
    }));
  };

  const selectedCell: LadderCell | null = (() => {
    if (!selected) return null;
    const rung = program.rungs.find((rg) => rg.id === selected.rungId);
    return rung?.cells[selected.r]?.[selected.c] ?? null;
  })();

  const updateSelectedCell = (patch: Partial<LadderCell>) => {
    if (!selected) return;
    updateRung(selected.rungId, (rg) => ({
      ...rg,
      cells: rg.cells.map((row, ri) =>
        ri === selected.r
          ? row.map((cell, ci) => (ci === selected.c && cell ? { ...cell, ...patch } : cell))
          : row,
      ),
    }));
  };

  // 매핑 가능한 부품 목록
  const inputCandidates = doc.components.filter(
    (c) => getComponentDefinition(c.type).behavior?.role === "elec-contact",
  );
  const outputCandidates = doc.components.filter(
    (c) => getComponentDefinition(c.type).behavior?.role === "elec-load",
  );
  const componentLabel = (id: string): string => {
    const comp = doc.components.find((c) => c.id === id);
    if (!comp) return "(삭제됨)";
    const def = getComponentDefinition(comp.type);
    const name = comp.properties.name ?? comp.properties.label ?? "";
    return `${name} — ${def.name}`;
  };

  return (
    <div className="plc-panel">
      <div className="plc-main">
        <div className="plc-toolbar">
          <strong>PLC 래더</strong>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`plc-tool${tool === t.id ? " active" : ""}`}
              title={t.title}
              disabled={running}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
          <span className="plc-toolbar-gap" />
          {selectedCell && !running && (
            <span className="plc-cell-editor">
              디바이스:
              <input
                value={selectedCell.device ?? ""}
                onChange={(e) => updateSelectedCell({ device: e.target.value.toUpperCase() })}
              />
              {["ton", "toff", "ctu", "ctd"].includes(selectedCell.kind) && (
                <>
                  설정:
                  <input
                    type="number"
                    value={selectedCell.preset ?? 0}
                    min={0}
                    step={selectedCell.kind === "ton" || selectedCell.kind === "toff" ? 0.1 : 1}
                    onChange={(e) => updateSelectedCell({ preset: Number(e.target.value) })}
                  />
                </>
              )}
            </span>
          )}
        </div>

        <div className="plc-rungs">
          {program.rungs.map((rung, rungIndex) => {
            const power = plcMonitor?.nodePower[rung.id];
            return (
              <div key={rung.id} className="plc-rung">
                <div className="plc-rung-head">
                  <span>렁 {rungIndex}</span>
                  {!running && (
                    <span className="plc-rung-buttons">
                      <button
                        title="행 추가 (병렬 분기)"
                        onClick={() =>
                          updateRung(rung.id, (rg) => ({
                            ...rg,
                            cells: [...rg.cells, new Array(LADDER_COLS).fill(null)],
                          }))
                        }
                      >
                        +행
                      </button>
                      <button
                        title="렁 삭제"
                        onClick={() =>
                          commitProgram({ rungs: program.rungs.filter((r) => r.id !== rung.id) })
                        }
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>
                {rung.cells.map((row, r) => (
                  <div key={r} className="plc-row">
                    <span className={`plc-rail${power?.[r]?.[0] ? " hot" : ""}`} />
                    {row.map((cell, c) => {
                      const hotLeft = power?.[r]?.[c] ?? false;
                      const hotRight = power?.[r]?.[c + 1] ?? false;
                      const vlink = rung.vlinks.some((v) => v.r === r && v.c === c + 1);
                      return (
                        <span
                          key={c}
                          className={[
                            "plc-cell",
                            cell ? `kind-${cell.kind}` : "empty",
                            running && hotLeft && (cell ? hotRight : false) ? "hot" : "",
                            running && hotLeft && !cell ? "" : "",
                            selected?.rungId === rung.id && selected.r === r && selected.c === c
                              ? "selected"
                              : "",
                            vlink ? "vlink" : "",
                          ].join(" ")}
                          onClick={() => handleCellClick(rung, r, c)}
                        >
                          {cell ? cellLabel(cell) : ""}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
          {!running && (
            <button
              className="plc-add-rung"
              onClick={() => commitProgram({ rungs: [...program.rungs, createRung()] })}
            >
              + 렁 추가
            </button>
          )}
        </div>
      </div>

      <div className="plc-side">
        <strong>I/O 매핑 (P 디바이스 ↔ 부품)</strong>
        <table className="plc-iomap">
          <thead>
            <tr>
              <th>디바이스</th>
              <th>방향</th>
              <th>부품</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ioMap.map((entry, i) => (
              <tr key={i}>
                <td>
                  <input
                    value={entry.device}
                    disabled={running}
                    onChange={(e) => {
                      const next = [...ioMap];
                      next[i] = { ...entry, device: e.target.value.toUpperCase() };
                      commitIoMap(next);
                    }}
                  />
                </td>
                <td>
                  <select
                    value={entry.direction}
                    disabled={running}
                    onChange={(e) => {
                      const next = [...ioMap];
                      next[i] = { ...entry, direction: e.target.value as IoEntry["direction"] };
                      commitIoMap(next);
                    }}
                  >
                    <option value="input">입력</option>
                    <option value="output">출력</option>
                  </select>
                </td>
                <td>
                  <select
                    value={entry.componentId}
                    disabled={running}
                    onChange={(e) => {
                      const next = [...ioMap];
                      next[i] = { ...entry, componentId: e.target.value };
                      commitIoMap(next);
                    }}
                  >
                    <option value="">(선택)</option>
                    {(entry.direction === "input" ? inputCandidates : outputCandidates).map((c) => (
                      <option key={c.id} value={c.id}>
                        {componentLabel(c.id)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {!running && (
                    <button onClick={() => commitIoMap(ioMap.filter((_, j) => j !== i))}>×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!running && (
          <button
            onClick={() =>
              commitIoMap([...ioMap, { device: "P0", direction: "input", componentId: "" }])
            }
          >
            + 매핑 추가
          </button>
        )}
        {running && plcMonitor && (
          <div className="plc-bits">
            <strong>디바이스 상태</strong>
            <div>
              {Object.entries(plcMonitor.bits)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .sort()
                .join(" · ") || "(모두 OFF)"}
            </div>
            {Object.keys(plcMonitor.values ?? {}).length > 0 && (
              <div>
                {Object.entries(plcMonitor.values)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" · ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
