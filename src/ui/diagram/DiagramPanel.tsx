import type { ReactElement } from "react";
import { useEditorStore } from "../editor/store";
import { useSimStore, getRecorder } from "../sim/simStore";
import { useT } from "../i18n";

/**
 * 변위단계선도 패널 (Phase 6).
 * 시뮬레이션 동안 기록된 실린더 위치를 계단 파형으로 그린다.
 * 시뮬레이션 정지 후에도 마지막 기록을 유지해 사후 분석이 가능하다.
 */

const TRACK_HEIGHT = 56;
const TRACK_GAP = 14;
const LEFT = 64;
const TOP = 14;
/** 표시 시간 창 (초) — 기록이 창보다 길면 최근 구간만 */
const VIEW_WINDOW = 20;

export function DiagramPanel(): ReactElement | null {
  const open = useEditorStore((s) => s.diagramPanelOpen);
  const t = useT();
  // 실행 중 갱신 트리거 (스냅숏 구독)
  useSimStore((s) => s.snapshot?.time ?? 0);

  if (!open) return null;

  const recorder = getRecorder();
  const tracks = recorder?.tracks() ?? [];
  const endTime = recorder?.endTime() ?? 0;

  const width = 760;
  const plotWidth = width - LEFT - 16;
  const t1 = Math.max(endTime, 5);
  const t0 = Math.max(0, t1 - VIEW_WINDOW);
  const xOf = (t: number) => LEFT + ((t - t0) / (t1 - t0)) * plotWidth;

  const height = TOP + tracks.length * (TRACK_HEIGHT + TRACK_GAP) + 28;

  return (
    <div className="diagram-panel">
      <div className="diagram-head">
        {t("diagramHead")}
        {tracks.length === 0 && <span className="diagram-empty">{t("diagramEmpty")}</span>}
      </div>
      <div className="diagram-scroll">
        <svg width={width} height={Math.max(height, 80)} className="diagram-svg">
          {tracks.map((track, i) => {
            const yTop = TOP + i * (TRACK_HEIGHT + TRACK_GAP);
            const yOf = (pos: number) => yTop + (1 - pos) * TRACK_HEIGHT;

            // 표시 창 내 점들 (창 시작 직전 점 1개 포함해 파형 연속 유지)
            const pts = track.points;
            let start = pts.findIndex((p) => p.t >= t0);
            if (start < 0) start = Math.max(0, pts.length - 1);
            else if (start > 0) start -= 1;
            const visible = pts.slice(start);

            let path = "";
            if (visible.length > 0) {
              path = `M ${xOf(Math.max(visible[0].t, t0))} ${yOf(visible[0].pos)}`;
              for (let k = 1; k < visible.length; k++) {
                path += ` L ${xOf(visible[k].t)} ${yOf(visible[k].pos)}`;
              }
              // 마지막 값을 현재 시각까지 연장
              path += ` L ${xOf(t1)} ${yOf(visible[visible.length - 1].pos)}`;
            }

            return (
              <g key={track.componentId}>
                <text x={8} y={yTop + TRACK_HEIGHT / 2 + 4} fontSize={12} fontWeight={700} fill="var(--text)">
                  {track.label}
                </text>
                {/* 0(후진)/1(전진) 기준선 */}
                <line x1={LEFT} y1={yOf(0)} x2={LEFT + plotWidth} y2={yOf(0)} stroke="var(--panel-border)" />
                <line x1={LEFT} y1={yOf(1)} x2={LEFT + plotWidth} y2={yOf(1)} stroke="var(--panel-border)" strokeDasharray="3 3" />
                <text x={LEFT - 14} y={yOf(1) + 4} fontSize={9} fill="var(--text-dim)">1</text>
                <text x={LEFT - 14} y={yOf(0) + 4} fontSize={9} fill="var(--text-dim)">0</text>
                {path && <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />}
              </g>
            );
          })}

          {/* 시간축 눈금 (1초 간격, 5초마다 라벨) */}
          {tracks.length > 0 &&
            Array.from({ length: Math.floor(t1 - t0) + 1 }, (_, k) => Math.ceil(t0) + k)
              .filter((t) => t <= t1)
              .map((t) => {
                const yBase = TOP + tracks.length * (TRACK_HEIGHT + TRACK_GAP);
                const major = t % 5 === 0;
                return (
                  <g key={t}>
                    <line x1={xOf(t)} y1={yBase} x2={xOf(t)} y2={yBase + (major ? 8 : 4)} stroke="var(--text-dim)" />
                    {major && (
                      <text x={xOf(t) - 8} y={yBase + 20} fontSize={9} fill="var(--text-dim)">
                        {t}s
                      </text>
                    )}
                  </g>
                );
              })}
        </svg>
      </div>
    </div>
  );
}
