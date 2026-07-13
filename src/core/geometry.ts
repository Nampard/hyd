import type { Point, Rotation } from "./model/types";

export const GRID = 10;

export function snapToGrid(v: number, grid = GRID): number {
  return Math.round(v / grid) * grid;
}

export function snapPoint(p: Point, grid = GRID): Point {
  return { x: snapToGrid(p.x, grid), y: snapToGrid(p.y, grid) };
}

/** 부품 로컬 좌표를 회전 적용해 변환 (부품 원점 기준) */
export function rotatePoint(p: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 0:
      return { x: p.x, y: p.y };
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

/** 포트가 향하는 방향 (배선 라우팅에 사용) */
export type Direction = "up" | "down" | "left" | "right";

export function rotateDirection(dir: Direction, rotation: Rotation): Direction {
  const order: Direction[] = ["up", "right", "down", "left"];
  const steps = rotation / 90;
  const idx = order.indexOf(dir);
  return order[(idx + steps) % 4];
}

export function addPoints(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}
