import type { Point } from "./model/types";
import { pointsEqual, type Direction } from "./geometry";

/** 포트에서 배선이 빠져나오는 기본 직선 길이 */
const STUB = 20;

/**
 * 이 포트의 스텁 길이. 기본은 STUB이지만, 상대 포트가 스텁 진행 방향 앞에
 * 있으면 두 포트 사이 축 거리의 절반까지로 줄인다 — 부품이 가깝게 배치됐을 때
 * 스텁이 상대를 지나쳐 접속점 반대편으로 삐져나오는 것(overshoot)을 막는다.
 * 양쪽 모두 절반씩 줄어들므로 마주보는 스텁은 정확히 중간에서 만난다.
 * 상대가 스텁 뒤쪽·옆이면 기존 길이를 유지한다 (우회 경로의 이격 확보).
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
  if (ahead <= 0) return STUB;
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

/**
 * 두 포트 사이의 직교(맨해튼) 경로를 계산한다.
 * 반환값은 시작·끝 포트 좌표를 제외한 경유점 목록.
 * 항상 포트 방향으로 STUB만큼 나간 뒤 경로를 잇는다.
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

  const mid: Point[] = [];
  if (facingAway) {
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
      if (isHorizontal(fromDir)) {
        const detourY = Math.min(a.y, b.y) - STUB;
        mid.push({ x: a.x, y: detourY }, { x: b.x, y: detourY });
      } else {
        const detourX = Math.min(a.x, b.x) - STUB;
        mid.push({ x: detourX, y: a.y }, { x: detourX, y: b.y });
      }
    }
  } else if (a.x === b.x || a.y === b.y) {
    // 직교/기타 방향 조합의 일직선 — 경유점 불필요
  } else if (isHorizontal(fromDir) === isHorizontal(toDir)) {
    // 같은 축 방향끼리: Z자 경로 (중간에서 꺾음)
    if (isHorizontal(fromDir)) {
      const midX = (a.x + b.x) / 2;
      mid.push({ x: midX, y: a.y }, { x: midX, y: b.y });
    } else {
      const midY = (a.y + b.y) / 2;
      mid.push({ x: a.x, y: midY }, { x: b.x, y: midY });
    }
  } else {
    // 직교 방향끼리: L자 경로
    mid.push(isHorizontal(fromDir) ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
  }

  const path = [a, ...mid, b];

  // 중복·일직선 위 불필요한 점 제거
  const cleaned: Point[] = [];
  for (const p of path) {
    if (cleaned.length > 0 && pointsEqual(cleaned[cleaned.length - 1], p)) continue;
    cleaned.push(p);
  }
  return cleaned;
}

/** 배선 전체 폴리라인 (렌더링용): 포트 좌표 + 경유점 */
export function wirePolyline(fromPos: Point, waypoints: Point[], toPos: Point): Point[] {
  return [fromPos, ...waypoints, toPos];
}
