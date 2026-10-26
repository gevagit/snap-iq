import type { Geometry } from '../content/schemas';

/** Where the ball sits across the field before the snap, seen from the offense. */
export type BallSpot = 'left_hash' | 'middle' | 'right_hash';

/**
 * The field around one snap, in scenario coordinates (PRD §6.2): x = yards across from the ball
 * (+ = offense's right), y = yards downfield from the line of scrimmage.
 */
export interface FieldFrame {
  spot: BallSpot;
  leftSideline: number;
  rightSideline: number;
  leftHash: number;
  rightHash: number;
  /** centre of the yard-line numbers on each side */
  numbersLeft: number;
  numbersRight: number;
  /** which side has more room; null with the ball in the middle */
  fieldSide: 'left' | 'right' | null;
  boundarySide: 'left' | 'right' | null;
}

export function fieldFrame(g: Geometry, spot: BallSpot): FieldFrame {
  const { width, hash_from_sideline: hash, numbers } = g.field;
  const fromLeft = g.ball_spots[spot].x_from_left_sideline;
  const leftSideline = -fromLeft;
  const rightSideline = width - fromLeft;
  const numbersCentre = numbers.top_from_sideline - numbers.height / 2;
  const room = { left: fromLeft, right: width - fromLeft };
  const even = Math.abs(room.left - room.right) < 0.01; // content values are rounded to 0.0001 yd
  return {
    spot,
    leftSideline,
    rightSideline,
    leftHash: leftSideline + hash,
    rightHash: rightSideline - hash,
    numbersLeft: leftSideline + numbersCentre,
    numbersRight: rightSideline - numbersCentre,
    fieldSide: even ? null : room.right > room.left ? 'right' : 'left',
    boundarySide: even ? null : room.right > room.left ? 'left' : 'right',
  };
}

/** Sidelines are out of bounds (NFHS), so a player on the line is out. */
export function isInBounds(frame: FieldFrame, x: number): boolean {
  return x > frame.leftSideline && x < frame.rightSideline;
}

export interface Rect { xMin: number; xMax: number; yMin: number; yMax: number }

/** Free-blocking zone: set at the snap, 4 yd either side of the ball, 3 yd behind each line of scrimmage. */
export function freeBlockingZone(g: Geometry): Rect {
  const lm = landmark(g, 'free-blocking-zone');
  const half = lm.half_width ?? 4;
  const depth = lm.depth_behind_each_line ?? 3;
  return { xMin: -half, xMax: half, yMin: -depth, yMax: depth };
}

/** True when the passer is outside the zone's lateral edges (the grounding exception, PRD content rule). */
export function outsideFreeBlockingZone(g: Geometry, passerX: number): boolean {
  const z = freeBlockingZone(g);
  return passerX < z.xMin || passerX > z.xMax;
}

/** The box: from just outside the end man on the line on each side, from the defense's line to the box depth. */
export function box(g: Geometry, endManLeftX: number, endManRightX: number): Rect {
  const lm = landmark(g, 'box');
  const out = lm.outside_end_man ?? 1;
  return { xMin: endManLeftX - out, xMax: endManRightX + out, yMin: 0, yMax: lm.depth ?? 6 };
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.xMin && x <= r.xMax && y >= r.yMin && y <= r.yMax;
}

/** Apex: midpoint between the end man on the line and #2 on that side, at linebacker depth. */
export function apex(g: Geometry, endManX: number, receiver2X: number): { x: number; y: number } {
  return { x: (endManX + receiver2X) / 2, y: landmark(g, 'apex').depth ?? 4.5 };
}

export interface Eligible { id: string; x: number; inBackfieldBehindBall?: boolean }

/**
 * Receiver numbering: on each side of the ball, count from the sideline in (#1 widest).
 * A back directly behind the ball counts to neither side until he releases (owner to confirm, see content).
 */
export function numberReceivers(players: Eligible[]): Record<string, { side: 'left' | 'right'; number: number }> {
  const out: Record<string, { side: 'left' | 'right'; number: number }> = {};
  const counted = players.filter((p) => !(p.inBackfieldBehindBall && Math.abs(p.x) < 0.5));
  const left = counted.filter((p) => p.x < 0).sort((a, b) => a.x - b.x);
  const right = counted.filter((p) => p.x > 0).sort((a, b) => b.x - a.x);
  left.forEach((p, i) => (out[p.id] = { side: 'left', number: i + 1 }));
  right.forEach((p, i) => (out[p.id] = { side: 'right', number: i + 1 }));
  return out;
}

function landmark(g: Geometry, id: string) {
  const lm = g.landmarks.find((l) => l.id === id);
  if (!lm) throw new Error(`landmark ${id} missing from content/field/geometry.yaml`);
  return lm;
}
