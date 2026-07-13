import type { Point } from "./model/types";
import { pointsEqual, type Direction } from "./geometry";

/** 포트에서 배선이 빠져나오는 최소 직선 길이 */
const STUB = 20;

function stubEnd(pos: Point, dir: Direction): Point {
  switch (dir) {
    case "up":
      return { x: pos.x, y: pos.y - STUB };
    case "down":
      return { x: pos.x, y: pos.y + STUB };
    case "left":
      return { x: pos.x - STUB, y: pos.y };
    case "right":
      return { x: pos.x + STUB, y: pos.y };
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
  const a = stubEnd(fromPos, fromDir);
  const b = stubEnd(toPos, toDir);

  const mid: Point[] = [];
  if (a.x === b.x || a.y === b.y) {
    // 스텁 끝이 일직선 — 경유점 불필요
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
