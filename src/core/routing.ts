import type { Point } from "./model/types";
import { pointsEqual, type Direction } from "./geometry";

/** 포트에서 배선이 빠져나오는 기본 직선 길이 */
const STUB = 20;

/**
 * 상대가 스텁 진행 방향 뒤쪽일 때의 짧은 이탈 길이.
 * 포트 원(r=4)과 부품 외곽선을 살짝 벗어나는 정도만 나갔다가 꺾여,
 * 반대편으로 길게 삐져나오지 않는다. 부품 몸체는 포트 뒤쪽에 있으므로
 * 진행 방향으로는 아무리 짧아도 몸체와 겹치지 않는다.
 */
const REVERSE_STUB = 8;

/**
 * 이 포트의 스텁 길이.
 * - 상대가 스텁 진행 방향 앞: 축 거리의 절반까지로 줄여 지나침(overshoot) 방지.
 *   양쪽 모두 절반씩 줄어들므로 마주보는 스텁은 정확히 중간에서 만난다.
 * - 상대가 뒤쪽·옆: REVERSE_STUB — 반대편으로 나갔다 돌아오는 구간을 최소화.
 */
function stubLength(pos: Point, dir: Direction, other: Point): number {
  const ahead =
    dir === "up"
      ? pos.y - other.y
      : dir === "down"
        ? other.y - pos.y
        : dir === "left"
          ? pos.x - other.x
          : other.x - pos.x;
  if (ahead <= 0) return REVERSE_STUB;
  return Math.min(STUB, ahead / 2);
}

function stubEnd(pos: Point, dir: Direction, len: number): Point {
  switch (dir) {
    case "up":
      return { x: pos.x, y: pos.y - len };
    case "down":
      return { x: pos.x, y: pos.y + len };
    case "left":
      return { x: pos.x - len, y: pos.y };
    case "right":
      return { x: pos.x + len, y: pos.y };
  }
}

function isHorizontal(dir: Direction): boolean {
  return dir === "left" || dir === "right";
}

/** 연속 중복점 제거 */
function dedupe(path: Point[]): Point[] {
  const cleaned: Point[] = [];
  for (const p of path) {
    if (cleaned.length > 0 && pointsEqual(cleaned[cleaned.length - 1], p)) continue;
    cleaned.push(p);
  }
  return cleaned;
}

/** 같은 축 위에서 전진 후 후진(스텁 되밟기)이 있는지 — 접속점 반대편 수염의 원인 */
function hasRetrace(pts: Point[]): boolean {
  for (let i = 2; i < pts.length; i++) {
    const p0 = pts[i - 2];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    if (
      p0.x === p1.x &&
      p1.x === p2.x &&
      Math.sign(p1.y - p0.y) * Math.sign(p2.y - p1.y) === -1
    )
      return true;
    if (
      p0.y === p1.y &&
      p1.y === p2.y &&
      Math.sign(p1.x - p0.x) * Math.sign(p2.x - p1.x) === -1
    )
      return true;
  }
  return false;
}

/**
 * 기본 경유점이 스텁을 되밟으면(상대가 포트 방향 반대쪽에 있을 때 발생)
 * 대안 경유점(L자 두 방향·Z자 두 방향)을 차례로 시도해 되밟지 않는 첫 후보를
 * 고른다. 기본 후보가 항상 첫 순위이므로 되밟기가 없는 기존 경로는 결코 바뀌지
 * 않는다 — 근접 스텁 축소(옵션 1)와 충돌하지 않음을 구조적으로 보장.
 */
function chooseMid(fromPos: Point, a: Point, defaultMid: Point[], b: Point, toPos: Point): Point[] {
  const candidates: Point[][] = [
    defaultMid,
    [{ x: b.x, y: a.y }], // L자: 가로 먼저
    [{ x: a.x, y: b.y }], // L자: 세로 먼저
    [
      { x: (a.x + b.x) / 2, y: a.y },
      { x: (a.x + b.x) / 2, y: b.y },
    ], // Z자: 가로 중간에서 꺾음
    [
      { x: a.x, y: (a.y + b.y) / 2 },
      { x: b.x, y: (a.y + b.y) / 2 },
    ], // Z자: 세로 중간에서 꺾음
  ];
  for (const cand of candidates) {
    if (!hasRetrace(dedupe([fromPos, a, ...cand, b, toPos]))) return cand;
  }
  return defaultMid;
}

/**
 * 두 포트 사이의 직교(맨해튼) 경로를 계산한다.
 * 반환값은 시작·끝 포트 좌표를 제외한 경유점 목록.
 * 포트 방향으로 스텁만큼 나간 뒤 경로를 잇는다 — 스텁 길이는 상대 위치에
 * 적응(stubLength)하고, 경유점은 스텁을 되밟지 않는 후보를 고른다(chooseMid).
 */
export function computeOrthogonalRoute(
  fromPos: Point,
  fromDir: Direction,
  toPos: Point,
  toDir: Direction,
): Point[] {
  const a = stubEnd(fromPos, fromDir, stubLength(fromPos, fromDir, toPos));
  const b = stubEnd(toPos, toDir, stubLength(toPos, toDir, fromPos));

  const opposite =
    (fromDir === "left" && toDir === "right") ||
    (fromDir === "right" && toDir === "left") ||
    (fromDir === "up" && toDir === "down") ||
    (fromDir === "down" && toDir === "up");

  // 반대 방향이라도 서로 등지고 있으면(포트가 상대 반대쪽을 봄) 직선 연결이
  // 두 부품을 관통해 역주행한다 — 옆으로 우회 (review-2 P1)
  const facingAway =
    opposite &&
    (isHorizontal(fromDir)
      ? fromDir === "right"
        ? toPos.x < fromPos.x
        : toPos.x > fromPos.x
      : fromDir === "down"
        ? toPos.y < fromPos.y
        : toPos.y > fromPos.y);

  let mid: Point[] = [];
  if (facingAway) {
    // 의도된 우회 — 후보 탐색 대상 아님
    if (isHorizontal(fromDir)) {
      const detourY = Math.min(a.y, b.y) - STUB;
      mid.push({ x: a.x, y: detourY }, { x: b.x, y: detourY });
    } else {
      const detourX = Math.min(a.x, b.x) - STUB;
      mid.push({ x: detourX, y: a.y }, { x: detourX, y: b.y });
    }
  } else if ((a.x === b.x || a.y === b.y) && (opposite || fromDir === toDir)) {
    if (opposite) {
      // 마주보는 포트가 일직선 — 경유점 불필요
    } else {
      // 같은 방향 일직선: 직선으로 이으면 목적지를 지나 역주행하므로 옆으로 우회 (codex-review M10)
      // 의도된 우회 — 후보 탐색 대상 아님
      if (isHorizontal(fromDir)) {
        const detourY = Math.min(a.y, b.y) - STUB;
        mid.push({ x: a.x, y: detourY }, { x: b.x, y: detourY });
      } else {
        const detourX = Math.min(a.x, b.x) - STUB;
        mid.push({ x: detourX, y: a.y }, { x: detourX, y: b.y });
      }
    }
  } else if (a.x === b.x || a.y === b.y) {
    // 직교/기타 방향 조합의 일직선 — 기본은 경유점 불필요, 되밟기 시 대안 탐색
    mid = chooseMid(fromPos, a, [], b, toPos);
  } else if (isHorizontal(fromDir) === isHorizontal(toDir)) {
    // 같은 축 방향끼리: Z자 경로 (중간에서 꺾음)
    const defaultMid = isHorizontal(fromDir)
      ? [
          { x: (a.x + b.x) / 2, y: a.y },
          { x: (a.x + b.x) / 2, y: b.y },
        ]
      : [
          { x: a.x, y: (a.y + b.y) / 2 },
          { x: b.x, y: (a.y + b.y) / 2 },
        ];
    mid = chooseMid(fromPos, a, defaultMid, b, toPos);
  } else {
    // 직교 방향끼리: L자 경로
    const defaultMid = [isHorizontal(fromDir) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }];
    mid = chooseMid(fromPos, a, defaultMid, b, toPos);
  }

  return dedupe([a, ...mid, b]);
}

/** 배선 전체 폴리라인 (렌더링용): 포트 좌표 + 경유점 */
export function wirePolyline(fromPos: Point, waypoints: Point[], toPos: Point): Point[] {
  return [fromPos, ...waypoints, toPos];
}
