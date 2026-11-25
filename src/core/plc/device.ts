import type { LadderProgram } from "./model";

/**
 * 래더 디바이스 주소 표기 (Phase 43) — XG5000 관례처럼 자릿수를 0으로 채운다.
 * P·M(비트): 문자 + 5자리(앞 4자리 10진 + 끝자리 16진 0~F) → P00000, M0000A
 * T·C(타이머·카운터): 문자 + 4자리 → T0000, C0012
 * `P3` → `P00003`, `t12` → `T0012`. 특수릴레이(_T1S 등)나 형식이 다른 값은 그대로 둔다.
 */
export function padDevice(device: string): string {
  const v = device.trim().toUpperCase();
  const bit = /^([PM])([0-9]{0,4})([0-9A-F])$/.exec(v);
  if (bit) return bit[1] + bit[2].padStart(4, "0") + bit[3];
  const word = /^([TC])([0-9]{1,4})$/.exec(v);
  if (word) return word[1] + word[2].padStart(4, "0");
  return v;
}

/** 프로그램에서 이미 쓰는 디바이스(자릿수 정규화) */
function usedDevices(program: LadderProgram | undefined): Set<string> {
  const used = new Set<string>();
  for (const rung of program?.rungs ?? []) {
    for (const row of rung.cells) for (const cell of row) if (cell?.device) used.add(padDevice(cell.device));
  }
  return used;
}

/**
 * 새 요소의 기본 디바이스 — 그 문자에서 아직 안 쓴 가장 작은 주소 (Phase 43).
 * 코일·타이머·카운터가 이미 쓰는 번호와 겹치지 않게 해서, 놓자마자 이중 코일이 되는 일을 막는다.
 * P·M은 16진 끝자리 순서(…0009, 000A … 000F, 0010)로 센다.
 */
export function nextFreeDevice(letter: "P" | "M" | "T" | "C", program: LadderProgram | undefined, extra: Iterable<string> = []): string {
  const used = usedDevices(program);
  for (const d of extra) used.add(padDevice(d));
  const bit = letter === "P" || letter === "M";
  const limit = bit ? 0x10000 : 10000;
  for (let n = 0; n < limit; n++) {
    const candidate = bit
      ? letter + Math.floor(n / 16).toString().padStart(4, "0") + (n % 16).toString(16).toUpperCase()
      : letter + n.toString().padStart(4, "0");
    if (!used.has(candidate)) return candidate;
  }
  return bit ? `${letter}00000` : `${letter}0000`;
}
