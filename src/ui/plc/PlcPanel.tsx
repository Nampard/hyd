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
import type { PlcMonitor } from "../../core/plc/scanner";
import { getComponentDefinition } from "../../core/library/registry";

/**
 * PLC 래더 편집·모니터링 패널 (교육용 단순화, XG5000 표기 관례 참고, Phase 13 연속 선도 렌더링).
 * 렁 전체를 SVG 하나로 그려 좌·우 모선이 렁 경계에서 끊기지 않고,
 * 접점·코일이 셀 경계에 맞닿는 연속 선으로 이어지도록 한다.
 * 도구를 고른 뒤 셀을 클릭해 배치하고, 선택 셀의 디바이스/설정값을 입력한다.
 * 시뮬레이션 중에는 통전 경로가 선 색으로 강조된다 (모니터 모드).
 */

type Tool = LadderCellKind | "erase" | "vlink";

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: "no", label: "─┤ ├─", title: "a접점 (NO)" },
  { id: "nc", label: "─┤/├─", title: "b접점 (NC)" },
  { id: "ne", label: "─┤N├─", title: "음변환 접점 (N) — 디바이스가 꺼지는 순간 1스캔 통전" },
  { id: "hline", label: "───", title: "가로 연결선" },
  { id: "vlink", label: "│", title: "세로 연결 (OR 분기) — 같은 렁 안의 위/아래 행끼리만 이어집니다. 셀 왼쪽 절반=왼쪽 노드, 오른쪽 절반=오른쪽 노드, 첫 열 왼쪽=좌측 모선 분기" },
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

// ---------- 래더 SVG 기하 상수 ----------
const CW = 86; // 셀 너비
const RH = 34; // 행 높이
const GUTTER = 30; // 좌측 모선 앞 여백 (렁 번호·버튼)
const PAD_Y = 6; // 상하 여백
const RUNG_GAP = 10; // 렁 사이 간격 (모선은 이 구간도 관통)
const LEFT_RAIL_X = GUTTER;
const RIGHT_RAIL_X = LEFT_RAIL_X + LADDER_COLS * CW;
const SVG_WIDTH = RIGHT_RAIL_X + 4;

interface RungLayout {
  rung: LadderRung;
  top: number;
  rows: number;
}

function layoutRungs(rungs: LadderRung[]): { layouts: RungLayout[]; totalHeight: number } {
  let y = PAD_Y;
  const layouts: RungLayout[] = rungs.map((rung) => {
    const rows = rung.cells.length;
    const top = y;
    y += rows * RH + RUNG_GAP;
    return { rung, top, rows };
  });
  const totalHeight = layouts.length > 0 ? y - RUNG_GAP + PAD_Y : PAD_Y * 2;
  return { layouts, totalHeight };
}

/** 셀 좌표 → x (노드 열 nc: 0..LADDER_COLS) */
function nodeX(nc: number): number {
  return LEFT_RAIL_X + nc * CW;
}

function cellCenterY(rungTop: number, r: number): number {
  return rungTop + r * RH + RH / 2;
}

// ---------- 심벌 (셀 경계에 닿는 연속선 위에 작도) ----------

function segColor(hot: boolean): string {
  return hot ? "var(--run)" : "var(--text)";
}

/**
 * 여자(ON) 하이라이트 — 접점·코일·펑션 블록의 디바이스가 여자 상태일 때 기호 뒤에 형광펜처럼 칠한다 (Phase 41).
 * 통전 경로(초록 선)와 따로 본다: b접점은 디바이스가 여자되면 하이라이트되지만 접점은 열려 전류가 끊긴다.
 */
function EnergizedMark({ x, y, w, h, device }: { x: number; y: number; w: number; h: number; device: string }): ReactElement {
  return (
    <rect className="plc-energized" x={x} y={y} width={w} height={h} rx={3}>
      <title>{`${device} 여자 (ON)`}</title>
    </rect>
  );
}

function HLine({ x1, x2, y, hot }: { x1: number; x2: number; y: number; hot: boolean }): ReactElement {
  return <line x1={x1} y1={y} x2={x2} y2={y} stroke={segColor(hot)} strokeWidth={hot ? 2 : 1.5} />;
}

function ContactSymbol({
  cx,
  cy,
  nc,
  edge,
  device,
  enterHot,
  conductHot,
  on,
}: {
  cx: number;
  cy: number;
  nc: boolean;
  /** 음변환(N) 접점 — 막대 사이에 N 표기 (XG5000 관례) */
  edge?: "N";
  device: string;
  enterHot: boolean;
  conductHot: boolean;
  /** 디바이스 여자 여부 (실행 중일 때만) */
  on: boolean;
}): ReactElement {
  const half = CW / 2;
  const gap = 9;
  const barH = 11;
  return (
    <g>
      {on && <EnergizedMark x={cx - gap - 6} y={cy - barH / 2 - 5} w={gap * 2 + 12} h={barH + 10} device={device} />}
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={9} fill="var(--text-dim)">
        {device}
      </text>
      <HLine x1={cx - half} x2={cx - gap} y={cy} hot={enterHot} />
      <line x1={cx - gap} y1={cy - barH / 2} x2={cx - gap} y2={cy + barH / 2} stroke={segColor(conductHot)} strokeWidth={2} />
      <line x1={cx + gap} y1={cy - barH / 2} x2={cx + gap} y2={cy + barH / 2} stroke={segColor(conductHot)} strokeWidth={2} />
      {edge && (
        <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={segColor(conductHot)} stroke="none">
          {edge}
        </text>
      )}
      {nc && (
        <line
          x1={cx - gap + 2.5}
          y1={cy + barH / 2}
          x2={cx + gap - 2.5}
          y2={cy - barH / 2}
          stroke={segColor(conductHot)}
          strokeWidth={2}
        />
      )}
      <HLine x1={cx + gap} x2={cx + half} y={cy} hot={conductHot} />
    </g>
  );
}

function CoilSymbol({
  cx,
  cy,
  device,
  glyph,
  enterHot,
  on,
}: {
  cx: number;
  cy: number;
  device: string;
  glyph?: string;
  enterHot: boolean;
  on: boolean;
}): ReactElement {
  const half = CW / 2;
  const r = 9;
  return (
    <g>
      {on && <EnergizedMark x={cx - 16} y={cy - r - 4} w={32} h={r * 2 + 8} device={device} />}
      <text x={cx} y={cy - 14} textAnchor="middle" fontSize={9} fill="var(--text-dim)">
        {device}
      </text>
      <HLine x1={cx - half} x2={cx - r} y={cy} hot={enterHot} />
      {/* 코일 -( )- — IEC 61131-3 / XG5000 래더 표기는 원이 아니라 마주 보는 두 괄호 */}
      <path
        d={`M ${cx - 6} ${cy - r} A 14 14 0 0 0 ${cx - 6} ${cy + r} M ${cx + 6} ${cy - r} A 14 14 0 0 1 ${cx + 6} ${cy + r}`}
        stroke={segColor(enterHot)}
        strokeWidth={2}
        fill="none"
      />
      {glyph && (
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize={9} fontWeight={700} fill={segColor(enterHot)}>
          {glyph}
        </text>
      )}
      <HLine x1={cx + r} x2={cx + half} y={cy} hot={enterHot} />
    </g>
  );
}

function FunctionBlockSymbol({
  cx,
  cy,
  kindLabel,
  device,
  presetText,
  enterHot,
  on,
}: {
  cx: number;
  cy: number;
  kindLabel: string;
  device: string;
  presetText: string;
  enterHot: boolean;
  /** 타이머·카운터 접점(완료 비트) 여자 */
  on: boolean;
}): ReactElement {
  const half = CW / 2;
  const boxW = 62;
  const boxH = 20;
  return (
    <g>
      {on && <EnergizedMark x={cx - boxW / 2 - 3} y={cy - boxH / 2 - 3} w={boxW + 6} h={boxH + 6} device={device} />}
      <text x={cx} y={cy - 14} textAnchor="middle" fontSize={9} fill="var(--text-dim)">
        {device}
      </text>
      <HLine x1={cx - half} x2={cx - boxW / 2} y={cy} hot={enterHot} />
      <rect
        x={cx - boxW / 2}
        y={cy - boxH / 2}
        width={boxW}
        height={boxH}
        stroke={segColor(enterHot)}
        strokeWidth={1.5}
        fill="none"
      />
      <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={segColor(enterHot)}>
        {kindLabel} {presetText}
      </text>
      <HLine x1={cx + boxW / 2} x2={cx + half} y={cy} hot={enterHot} />
    </g>
  );
}

function cellFunctionLabel(kind: LadderCellKind): string {
  switch (kind) {
    case "ton":
      return "TON";
    case "toff":
      return "TOFF";
    case "ctu":
      return "CTU";
    case "ctd":
      return "CTD";
    default:
      return "";
  }
}

function CellSymbol({
  cell,
  cx,
  cy,
  enterHot,
  conductHot,
  bits,
}: {
  cell: LadderCell;
  cx: number;
  cy: number;
  enterHot: boolean;
  conductHot: boolean;
  /** 실행 중 디바이스 비트 (정지 중이면 null — 하이라이트 없음) */
  bits: Record<string, boolean> | null;
}): ReactElement | null {
  // 여자 판정: 접점·코일·SET·타이머·카운터는 디바이스 비트, RST는 명령이 실행되는(입력이 통전된) 동안
  const on = bits !== null && (cell.kind === "rst" ? enterHot : bits[cell.device ?? ""] === true);
  switch (cell.kind) {
    case "no":
      return <ContactSymbol cx={cx} cy={cy} nc={false} device={cell.device ?? ""} enterHot={enterHot} conductHot={conductHot} on={on} />;
    case "nc":
      return <ContactSymbol cx={cx} cy={cy} nc={true} device={cell.device ?? ""} enterHot={enterHot} conductHot={conductHot} on={on} />;
    case "ne":
      return <ContactSymbol cx={cx} cy={cy} nc={false} edge="N" device={cell.device ?? ""} enterHot={enterHot} conductHot={conductHot} on={on} />;
    case "hline":
      return <HLine x1={cx - CW / 2} x2={cx + CW / 2} y={cy} hot={enterHot && conductHot} />;
    case "coil":
      return <CoilSymbol cx={cx} cy={cy} device={cell.device ?? ""} enterHot={enterHot} on={on} />;
    case "set":
      return <CoilSymbol cx={cx} cy={cy} device={cell.device ?? ""} glyph="S" enterHot={enterHot} on={on} />;
    case "rst":
      return <CoilSymbol cx={cx} cy={cy} device={cell.device ?? ""} glyph="R" enterHot={enterHot} on={on} />;
    case "ton":
    case "toff":
      return (
        <FunctionBlockSymbol
          cx={cx}
          cy={cy}
          kindLabel={cellFunctionLabel(cell.kind)}
          device={cell.device ?? ""}
          presetText={`${cell.preset ?? 0}s`}
          enterHot={enterHot}
          on={on}
        />
      );
    case "ctu":
    case "ctd":
      return (
        <FunctionBlockSymbol
          cx={cx}
          cy={cy}
          kindLabel={cellFunctionLabel(cell.kind)}
          device={cell.device ?? ""}
          presetText={`×${cell.preset ?? 0}`}
          enterHot={enterHot}
          on={on}
        />
      );
  }
}

// ---------- 렁 하나의 SVG 그룹 ----------

function RungGroup({
  rung,
  top,
  rows,
  power,
  bits,
  running,
  selected,
  onCellClick,
}: {
  rung: LadderRung;
  top: number;
  rows: number;
  power: boolean[][] | undefined;
  bits: Record<string, boolean> | null;
  running: boolean;
  selected: { rungId: string; r: number; c: number } | null;
  /** half: 클릭한 셀의 좌/우 절반 — vlink 도구가 좌측 노드(c)/우측 노드(c+1)를 구분하는 데 사용 */
  onCellClick: (r: number, c: number, half: "left" | "right") => void;
}): ReactElement {
  return (
    <g>
      {Array.from({ length: rows }, (_, r) => {
        const cy = cellCenterY(top, r);
        return (
          <g key={r}>
            {Array.from({ length: LADDER_COLS }, (_, c) => {
              const cell = rung.cells[r][c];
              const cx = nodeX(c) + CW / 2;
              const enterHot = power?.[r]?.[c] ?? false;
              const exitHot = power?.[r]?.[c + 1] ?? false;
              const isSelected =
                !running && selected?.rungId === rung.id && selected.r === r && selected.c === c;
              const rowY = top + r * RH;
              return (
                <g key={c}>
                  {cell && (
                    <CellSymbol cell={cell} cx={cx} cy={cy} enterHot={enterHot} conductHot={exitHot} bits={bits} />
                  )}
                  {!running && (
                    <rect
                      x={nodeX(c)}
                      y={rowY}
                      width={CW}
                      height={RH}
                      fill="none"
                      stroke="var(--panel-border)"
                      strokeDasharray="2 2"
                      strokeWidth={1}
                    />
                  )}
                  {/* 히트 영역을 좌/우 절반으로 분리 — vlink 도구가 좌측 모선(c=0) 분기도 만들 수 있게 (review P0) */}
                  <rect
                    className={`plc-cell-hit${cell ? "" : " plc-cell-hit-empty"}`}
                    x={nodeX(c)}
                    y={rowY}
                    width={CW / 2}
                    height={RH}
                    fill="transparent"
                    onClick={() => onCellClick(r, c, "left")}
                  />
                  <rect
                    className={`plc-cell-hit${cell ? "" : " plc-cell-hit-empty"}`}
                    x={nodeX(c) + CW / 2}
                    y={rowY}
                    width={CW / 2}
                    height={RH}
                    fill="transparent"
                    onClick={() => onCellClick(r, c, "right")}
                  />
                  {isSelected && (
                    <rect
                      x={nodeX(c) + 1}
                      y={rowY + 1}
                      width={CW - 2}
                      height={RH - 2}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      {rung.vlinks.map((link, i) => {
        if (link.r + 1 >= rows) return null;
        const x = nodeX(link.c);
        const hot = (power?.[link.r]?.[link.c] ?? false) && (power?.[link.r + 1]?.[link.c] ?? false);
        return (
          <line
            key={i}
            x1={x}
            y1={cellCenterY(top, link.r)}
            x2={x}
            y2={cellCenterY(top, link.r + 1)}
            stroke={segColor(hot)}
            strokeWidth={hot ? 2 : 1.5}
          />
        );
      })}
    </g>
  );
}

// ---------- 좌·우 모선 (전체 관통 + 행별 통전 오버레이) ----------

function Rails({
  layouts,
  totalHeight,
  monitor,
  running,
}: {
  layouts: RungLayout[];
  totalHeight: number;
  monitor: PlcMonitor | null;
  running: boolean;
}): ReactElement {
  return (
    <g>
      <line x1={LEFT_RAIL_X} y1={0} x2={LEFT_RAIL_X} y2={totalHeight} stroke="var(--text-dim)" strokeWidth={3} />
      <line x1={RIGHT_RAIL_X} y1={0} x2={RIGHT_RAIL_X} y2={totalHeight} stroke="var(--text-dim)" strokeWidth={3} />
      {running &&
        layouts.map(({ rung, top, rows }) => {
          const power = monitor?.nodePower[rung.id];
          return Array.from({ length: rows }, (_, r) => {
            const leftHot = power?.[r]?.[0] ?? false;
            const rightHot = power?.[r]?.[LADDER_COLS] ?? false;
            if (!leftHot && !rightHot) return null;
            const y1 = top + r * RH;
            const y2 = y1 + RH;
            return (
              <g key={`${rung.id}-${r}`}>
                {leftHot && <line x1={LEFT_RAIL_X} y1={y1} x2={LEFT_RAIL_X} y2={y2} stroke="var(--run)" strokeWidth={3} />}
                {rightHot && <line x1={RIGHT_RAIL_X} y1={y1} x2={RIGHT_RAIL_X} y2={y2} stroke="var(--run)" strokeWidth={3} />}
              </g>
            );
          });
        })}
    </g>
  );
}

/** alwaysOpen: 컨베이어 모드처럼 래더가 작업의 중심인 화면에서는 토글과 무관하게 늘 보인다 (Phase 37) */
export function PlcPanel({ alwaysOpen = false }: { alwaysOpen?: boolean } = {}): ReactElement | null {
  const open = useEditorStore((s) => s.plcPanelOpen) || alwaysOpen;
  const doc = useEditorStore((s) => s.document);
  const running = useSimStore((s) => s.running);
  const plcMonitor = useSimStore((s) => s.snapshot?.plc ?? null);
  const [tool, setTool] = useState<Tool>("no");
  const [selected, setSelected] = useState<{ rungId: string; r: number; c: number } | null>(null);

  if (!open) return null;

  const program: LadderProgram = doc.plcProgram ?? createEmptyProgram();
  const ioMap: IoEntry[] = doc.ioMap ?? [];

  // 중복 매핑 감지 (저장 시 거부되므로 편집 중 미리 경고) — codex-review P1-3.
  // (방향,디바이스) 또는 (부품,방향,채널)이 겹치는 행의 인덱스 집합
  const dupRows = new Set<number>();
  {
    const byDeviceDir = new Map<string, number>();
    const byTarget = new Map<string, number>();
    ioMap.forEach((e, i) => {
      const dk = `${e.direction}:${e.device}`;
      if (byDeviceDir.has(dk)) {
        dupRows.add(i);
        dupRows.add(byDeviceDir.get(dk)!);
      } else byDeviceDir.set(dk, i);
      if (e.componentId) {
        const tk = `${e.componentId}:${e.direction}:${e.channel ?? ""}`;
        if (byTarget.has(tk)) {
          dupRows.add(i);
          dupRows.add(byTarget.get(tk)!);
        } else byTarget.set(tk, i);
      }
    });
  }

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

  const handleCellClick = (rung: LadderRung, r: number, c: number, half: "left" | "right") => {
    if (running) return;
    setSelected({ rungId: rung.id, r, c });
    if (tool === "vlink") {
      // 자기유지 회로처럼 "새로 추가한 아래 행"을 클릭해 위 행과 연결하려는 시도가 자연스럽다.
      // 클릭한 행에 아래 행이 있으면 아래로(r↔r+1), 없고 위 행이 있으면 위로(r-1↔r) 연결한다 —
      // 어느 쪽 행을 클릭해도 같은 링크를 만들 수 있어야 한다 (review: "클릭해도 안 그려짐" 버그 수정)
      const linkR = r + 1 < rung.cells.length ? r : r > 0 ? r - 1 : null;
      if (linkR === null) {
        // 흔한 오해: 자기유지 하려고 '+ 렁 추가'로 새 렁을 만들면 서로 다른 렁이라 세로선이 이어지지 않는다.
        // 세로선은 같은 렁 안의 위/아래 행끼리만 연결되므로, '+ 병렬 분기'로 이 렁에 행을 먼저 추가해야 한다.
        useEditorStore
          .getState()
          .setStatus("세로선은 같은 렁 안의 위/아래 행끼리만 연결됩니다. 자기유지는 이 렁에서 '+ 병렬 분기'로 행을 추가한 뒤 세로선을 그으세요.");
        return;
      }
      // 셀의 좌/우 절반에 따라 왼쪽 노드(c) 또는 오른쪽 노드(c+1)에 연결 토글.
      // 첫 열 셀의 왼쪽 절반을 클릭하면 c=0(좌측 모선) 분기 — 자기유지 회로를 처음부터 작도 가능 (review P0)
      const node = half === "left" ? c : c + 1;
      updateRung(rung.id, (rg) => {
        const exists = rg.vlinks.some((v) => v.r === linkR && v.c === node);
        return {
          ...rg,
          vlinks: exists
            ? rg.vlinks.filter((v) => !(v.r === linkR && v.c === node))
            : [...rg.vlinks, { r: linkR, c: node }],
        };
      });
      return;
    }
    if (tool === "erase") {
      // 셀 내용과 함께, 클릭한 절반 쪽 노드에 붙은 세로선(vlink)도 지운다 —
      // 세로선은 셀이 아니라 노드에 속하므로 셀만 비우면 남아 있었음 (사용자 보고)
      const node = half === "left" ? c : c + 1;
      updateRung(rung.id, (rg) => ({
        ...rg,
        cells: rg.cells.map((row, ri) =>
          ri === r ? row.map((cell, ci) => (ci === c ? null : cell)) : row,
        ),
        vlinks: rg.vlinks.filter(
          // 클릭한 노드(node)에서 이 행에 닿는 링크: 아래로(r↔r+1) 또는 위로(r-1↔r)
          (v) => !(v.c === node && (v.r === r || v.r === r - 1)),
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
      cells: rg.cells.map((row, ri) => {
        if (ri !== r) return row;
        const newRow = [...row];
        newRow[c] = newCell;
        // 출력 요소를 놓을 때 바로 앞의 빈 셀을 hline으로 자동 연결한다 (기존 요소는 보존, XG5000 관례)
        if (isOutputKind(kind)) {
          for (let cc = c - 1; cc >= 0; cc--) {
            if (newRow[cc] !== null) break;
            newRow[cc] = { kind: "hline" };
          }
        }
        return newRow;
      }),
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

  // 매핑 가능한 부품 목록 — 다채널 부품(ioChannels 있음)은 해당 방향 채널이 있으면
  // 후보에 포함. 부품 type 하드코딩 없이 정의 메타데이터로 판정 (codex-review P1-6)
  const hasChannel = (type: string, dir: "input" | "output"): boolean =>
    !!getComponentDefinition(type).ioChannels?.some((ch) => ch.direction === dir);
  const inputCandidates = doc.components.filter((c) => {
    const role = getComponentDefinition(c.type).behavior?.role;
    return role === "elec-contact" || hasChannel(c.type, "input");
  });
  const outputCandidates = doc.components.filter((c) => {
    const role = getComponentDefinition(c.type).behavior?.role;
    return role === "elec-load" || hasChannel(c.type, "output");
  });
  /** 다채널 부품(ioChannels 보유) 여부 */
  const isMultiChannel = (id: string): boolean => {
    const comp = doc.components.find((c) => c.id === id);
    return !!comp && !!getComponentDefinition(comp.type).ioChannels;
  };
  /** 부품·방향의 채널 이름 목록 (정의 메타데이터) */
  const channelsFor = (id: string, dir: "input" | "output"): string[] => {
    const comp = doc.components.find((c) => c.id === id);
    if (!comp) return [];
    return (getComponentDefinition(comp.type).ioChannels ?? [])
      .filter((ch) => ch.direction === dir)
      .map((ch) => ch.id);
  };
  const componentLabel = (id: string): string => {
    const comp = doc.components.find((c) => c.id === id);
    if (!comp) return "(삭제됨)";
    const def = getComponentDefinition(comp.type);
    const name = String(comp.properties.name ?? comp.properties.label ?? "");
    // 이름표가 있으면 이름표를 앞에 — 없으면 부품 이름만 (예전엔 빈 이름 앞에 대시가 붙었다)
    return name ? `${name} ${def.name}` : def.name;
  };
  /**
   * 채널 장비가 한 대뿐인 문서(컨베이어 모드)는 모든 행이 같은 부품을 가리키므로 부품 열을
   * 숨기고 새 행도 그 장비로 채운다 — 좁은 옆 칸에서 채널 이름이 잘리지 않게 (Phase 38)
   */
  const channelEquipment = doc.components.filter((c) => getComponentDefinition(c.type).ioChannels);
  const soleEquipment =
    channelEquipment.length === 1 && doc.components.length === 1 ? channelEquipment[0] : null;

  const { layouts, totalHeight } = layoutRungs(program.rungs);

  return (
    <div className={`plc-panel${alwaysOpen ? " plc-panel-main" : ""}`}>
      <div className="plc-main">
        <div className="plc-toolbar">
          <strong>PLC 래더</strong>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`plc-tool${tool === t.id ? " active" : ""}`}
              title={t.title}
              aria-label={t.title}
              aria-pressed={tool === t.id}
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
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  // bit 디바이스(P/M/T/C)만 허용 — D는 word 디바이스라 범위 밖 (review-3 P0).
                  // P/M은 비트 어드레스라 마지막 자리 16진(A~F) 허용 (P0000A 등, Phase 14-3).
                  // _T1S/_T2S: 점멸 특수릴레이 (입력 중간 상태 _ / _T / _T1 허용)
                  if (v !== "" && !/^([PM][0-9]{0,4}[0-9A-F]?|[TC][0-9]{0,5}|_|_T|_T[12]|_T[12]S)$/.test(v)) {
                    useEditorStore.getState().setStatus("디바이스는 P/M/T/C + 숫자 또는 _T1S/_T2S(점멸)만 사용할 수 있습니다 (P/M은 마지막 자리 A~F 허용, D는 워드 디바이스 — 미지원).");
                    return;
                  }
                  // 특수릴레이는 읽기 전용 클록 — 출력 요소에는 지정 불가 (codex-review P2-1)
                  if (/^_T[12]S$/.test(v) && isOutputKind(selectedCell.kind)) {
                    useEditorStore.getState().setStatus("_T1S/_T2S는 접점에서만 쓸 수 있습니다 (출력 코일 대상 불가).");
                    return;
                  }
                  updateSelectedCell({ device: v });
                }}
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

        {running ? (
          // 실행 중에는 편집 안내 대신 모니터 범례 — 여자/소자는 디바이스 상태, 초록 선은 통전 경로 (Phase 41)
          <p className="plc-hint plc-hint-legend">
            <span className="plc-legend">
              <span className="plc-legend-on" aria-hidden="true" />
              <strong>여자</strong>(ON)
            </span>
            <span className="plc-legend">
              <span className="plc-legend-off" aria-hidden="true" />
              <strong>소자</strong>(OFF)
            </span>
            <span className="plc-legend">
              <span className="plc-legend-flow" aria-hidden="true" />
              전류가 흐르는 길
            </span>
            b접점은 디바이스가 여자되면 칠해지지만 접점이 열려 전류는 끊깁니다.
          </p>
        ) : (
          <p className="plc-hint">
            렁 = 좌·우 모선을 잇는 독립 회로줄. 자기유지처럼 세로선(OR)으로 잇는 병렬 회로는
            같은 렁 안의 <strong>‘+ 병렬 분기’</strong>로 행을 추가해 만듭니다 —
            <strong>‘+ 새 렁’</strong>은 위 렁과 세로선으로 이어지지 않습니다.
          </p>
        )}

        <div className="plc-rungs">
          <div className="plc-ladder-wrap" style={{ width: SVG_WIDTH }}>
            <svg width={SVG_WIDTH} height={totalHeight} className="plc-ladder-svg">
              <Rails layouts={layouts} totalHeight={totalHeight} monitor={plcMonitor} running={running} />
              {layouts.map(({ rung, top, rows }) => (
                <RungGroup
                  key={rung.id}
                  rung={rung}
                  top={top}
                  rows={rows}
                  power={plcMonitor?.nodePower[rung.id]}
                  bits={running ? (plcMonitor?.bits ?? null) : null}
                  running={running}
                  selected={selected}
                  onCellClick={(r, c, half) => handleCellClick(rung, r, c, half)}
                />
              ))}
            </svg>
            {layouts.map(({ rung, top, rows }, idx) => (
              <div
                key={rung.id}
                className="plc-rung-gutter"
                style={{ top, height: rows * RH, width: GUTTER }}
              >
                <span className="plc-rung-index">{idx}</span>
                {!running && (
                  <span className="plc-rung-buttons">
                    <button
                      title="병렬 분기 추가 — 이 렁 안에 아래 행을 넣습니다. 세로선(OR)으로 위 행과 이어 자기유지 회로를 만들 때 사용합니다."
                      onClick={() =>
                        updateRung(rung.id, (rg) => ({
                          ...rg,
                          cells: [...rg.cells, new Array(LADDER_COLS).fill(null)],
                        }))
                      }
                    >
                      + 병렬 분기
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
            ))}
          </div>
          {!running && (
            <button
              className="plc-add-rung"
              title="새 렁 추가 — 위 렁과 독립된 새 회로줄입니다. 세로선으로 위 렁과 이어지지 않습니다(자기유지에는 '+ 병렬 분기'를 쓰세요)."
              onClick={() => commitProgram({ rungs: [...program.rungs, createRung()] })}
            >
              + 새 렁 (독립 회로줄)
            </button>
          )}
        </div>
      </div>

      <div className="plc-side">
        <div className="plc-disclaimer">
          XG5000 표기 관례를 참고한 교육용 독립 구현 — LS ELECTRIC과 무관하며 .xgp 등
          XG5000 파일과 호환되지 않습니다.
        </div>
        {/* PLC 래더 모드(부품 없음)는 입출력 판의 스위치·램프가 P 디바이스에 바로 물린다 (Phase 38) */}
        {doc.components.length === 0 && alwaysOpen ? (
          <p className="plc-direct-io">
            이 모드에는 배선할 부품이 없습니다. 위쪽 입출력 판의 누름버튼(P00000~P00007)·토글 스위치(P00008~P0000F)가
            입력으로, 출력 램프(P00010~P0001F)가 출력으로 바로 연결됩니다.
          </p>
        ) : (
          <>
            <strong>I/O 매핑 (P 디바이스 ↔ 부품)</strong>
            <table className="plc-iomap">
              <thead>
                <tr>
                  <th className="col-device">디바이스</th>
                  <th className="col-dir">방향</th>
                  {!soleEquipment && <th>부품</th>}
                  <th className="col-channel">채널</th>
                  <th className="col-del" />
                </tr>
              </thead>
              <tbody>
                {ioMap.map((entry, i) => (
                  <tr key={i} className={`plc-iomap-${entry.direction}${dupRows.has(i) ? " plc-iomap-dup" : ""}`} title={dupRows.has(i) ? "중복 매핑 — 저장 시 거부됩니다. 디바이스나 채널을 다르게 바꾸세요." : undefined}>
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
                          const direction = e.target.value as IoEntry["direction"];
                          const next = [...ioMap];
                          // 다채널 부품 항목은 방향이 바뀌면 그 방향의 첫 채널로 재설정
                          next[i] = isMultiChannel(entry.componentId)
                            ? { ...entry, direction, channel: channelsFor(entry.componentId, direction)[0] }
                            : { ...entry, direction };
                          commitIoMap(next);
                        }}
                      >
                        <option value="input">입력</option>
                        <option value="output">출력</option>
                      </select>
                    </td>
                    {!soleEquipment && (
                      <td>
                        <select
                          value={entry.componentId}
                          disabled={running}
                          onChange={(e) => {
                            const componentId = e.target.value;
                            const next = [...ioMap];
                            if (isMultiChannel(componentId)) {
                              // 다채널 부품 선택 시 방향에 맞는 첫 채널을 기본값으로
                              next[i] = {
                                ...entry,
                                componentId,
                                channel: entry.channel ?? channelsFor(componentId, entry.direction)[0],
                              };
                            } else {
                              // 단채널 부품으로 바꾸면 채널 제거 (스키마 규칙)
                              const { channel: _drop, ...rest } = entry;
                              next[i] = { ...rest, componentId };
                            }
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
                    )}
                    <td>
                      {isMultiChannel(entry.componentId) ? (
                        <select
                          value={entry.channel ?? ""}
                          disabled={running}
                          onChange={(e) => {
                            const next = [...ioMap];
                            next[i] = { ...entry, channel: e.target.value };
                            commitIoMap(next);
                          }}
                        >
                          {channelsFor(entry.componentId, entry.direction).map((ch) => (
                            <option key={ch} value={ch}>
                              {ch}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="plc-iomap-nochannel">—</span>
                      )}
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
                  commitIoMap([
                    ...ioMap,
                    soleEquipment
                      ? {
                          device: "P0",
                          direction: "input",
                          componentId: soleEquipment.id,
                          channel: channelsFor(soleEquipment.id, "input")[0],
                        }
                      : { device: "P0", direction: "input", componentId: "" },
                  ])
                }
              >
                + 매핑 추가
              </button>
            )}
          </>
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
