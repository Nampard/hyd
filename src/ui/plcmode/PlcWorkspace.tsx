import { useEffect, useRef, useState, type ReactElement } from "react";
import { useSimStore } from "../sim/simStore";
import { PropertyPanel } from "../editor/PropertyPanel";
import { PlcPanel } from "../plc/PlcPanel";

/**
 * PLC 래더 모드의 작업 화면 (Phase 38).
 *
 * 실습실 PLC 트레이너 보드처럼 위에는 입출력 판, 아래에는 래더가 있다. 부품을 배선하지 않고
 * 입력 스위치를 눌러 P 입력을 주고, 출력 램프로 P 출력을 본다.
 *   ┌ 입출력 판: 누름버튼 P00000~7 · 토글 P00008~F · 출력 램프 P00010~1F ┬ 학습 활동 ┐
 *   ├ PLC 래더 ─────────────────────────────────────────────────────────┴───────────┤
 */
const hex = (n: number) => n.toString(16).toUpperCase();
const PUSH_INPUTS = Array.from({ length: 8 }, (_, i) => `P0000${hex(i)}`);
const TOGGLE_INPUTS = Array.from({ length: 8 }, (_, i) => `P0000${hex(i + 8)}`);
const OUTPUTS = Array.from({ length: 16 }, (_, i) => `P0001${hex(i)}`);

export function PlcWorkspace(): ReactElement {
  return (
    <div className="plc-workspace">
      <div className="plc-workspace-top">
        <IoBoard />
        <PropertyPanel />
      </div>
      <PlcPanel alwaysOpen />
    </div>
  );
}

function IoBoard(): ReactElement {
  const running = useSimStore((s) => s.running);
  const bits = useSimStore((s) => s.snapshot?.plc?.bits);
  /** 켜져 있는 입력 — 토글은 계속, 누름버튼은 누르는 동안만 */
  const [on, setOn] = useState<Set<string>>(() => new Set());
  const onRef = useRef(on);
  onRef.current = on;

  // 실행을 새로 시작하면 엔진이 새로 만들어지므로, 켜 둔 토글 스위치를 다시 넣어 준다
  useEffect(() => {
    if (!running) return;
    for (const device of onRef.current) useSimStore.getState().setPlcInput(device, true);
  }, [running]);

  const set = (device: string, active: boolean) => {
    const sim = useSimStore.getState();
    if (active && !sim.running) sim.start();
    setOn((prev) => {
      const next = new Set(prev);
      if (active) next.add(device);
      else next.delete(device);
      return next;
    });
    useSimStore.getState().setPlcInput(device, active);
  };

  return (
    <section className="io-board" aria-label="입출력 판">
      <div className="io-group">
        <h3>누름버튼 입력</h3>
        <p className="io-help">누르는 동안만 켜집니다.</p>
        <div className="io-row">
          {PUSH_INPUTS.map((d) => (
            <button
              key={d}
              className={`io-push${on.has(d) ? " on" : ""}`}
              aria-pressed={on.has(d)}
              onPointerDown={(e) => {
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                set(d, true);
              }}
              onPointerUp={() => set(d, false)}
              onPointerCancel={() => set(d, false)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
                  e.preventDefault();
                  set(d, true);
                }
              }}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") set(d, false);
              }}
            >
              <span className="io-cap" aria-hidden="true" />
              <span className="io-addr">{d}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="io-group">
        <h3>토글 스위치 입력</h3>
        <p className="io-help">한 번 누르면 켜지고, 다시 누르면 꺼집니다.</p>
        <div className="io-row">
          {TOGGLE_INPUTS.map((d) => (
            <button key={d} className={`io-toggle${on.has(d) ? " on" : ""}`} aria-pressed={on.has(d)} onClick={() => set(d, !on.has(d))}>
              <span className="io-lever" aria-hidden="true" />
              <span className="io-addr">{d}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="io-group io-outputs">
        <h3>출력 램프</h3>
        <p className="io-help">래더의 출력 코일이 켜지면 램프가 켜집니다.</p>
        <div className="io-row io-row-wide">
          {OUTPUTS.map((d) => {
            const lit = running && (bits?.[d] ?? false);
            return (
              <span key={d} className={`io-lamp${lit ? " lit" : ""}`} title={`${d} ${lit ? "켜짐" : "꺼짐"}`}>
                <span className="io-bulb" aria-hidden="true" />
                <span className="io-addr">{d}</span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
