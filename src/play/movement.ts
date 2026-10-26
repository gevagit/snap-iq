import type { Profile } from '../content/playSchemas';

/** Movement model (PRD §6.13): positions come from a path, a speed profile and time - never placed by hand. */
export interface Vec { x: number; y: number }
export const vec = (x: number, y: number): Vec => ({ x, y });
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Distance covered t seconds after he starts moving at speed v0, building to top speed with time constant tau:
 * top*t - (top - v0)*tau*(1 - e^(-t/tau)). From rest this is the PRD formula; the reaction delay is applied by the caller.
 */
export function profileDistance(p: Profile, t: number, v0 = 0): number {
  if (t <= 0) return 0;
  return p.top * t - (p.top - v0) * p.tau * (1 - Math.exp(-t / p.tau));
}

export function profileSpeed(p: Profile, t: number, v0 = 0): number {
  if (t <= 0) return v0;
  return p.top - (p.top - v0) * Math.exp(-t / p.tau);
}

/** Time to cover d yards from speed v0 (bisection; the distance function is increasing). */
export function timeToCover(p: Profile, d: number, v0 = 0): number {
  if (d <= 0) return 0;
  let lo = 0;
  let hi = 1;
  while (profileDistance(p, hi, v0) < d) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (profileDistance(p, mid, v0) < d) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** A polyline path; position by distance along it, clamped at the end. */
export class Path {
  readonly points: Vec[];
  readonly cumulative: number[];
  constructor(points: Vec[]) {
    this.points = points.filter((p, i) => i === 0 || dist(p, points[i - 1]!) > 1e-9);
    this.cumulative = [0];
    for (let i = 1; i < this.points.length; i++) this.cumulative.push(this.cumulative[i - 1]! + dist(this.points[i]!, this.points[i - 1]!));
  }
  get length(): number {
    return this.cumulative[this.cumulative.length - 1]!;
  }
  get end(): Vec {
    return this.points[this.points.length - 1]!;
  }
  at(d: number): Vec {
    const pts = this.points;
    if (pts.length === 1 || d <= 0) return pts[0]!;
    if (d >= this.length) return this.end;
    let i = 1;
    while (this.cumulative[i]! < d) i++;
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const f = (d - this.cumulative[i - 1]!) / (this.cumulative[i]! - this.cumulative[i - 1]!);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  /** Distance along the path of the first point at or below depth y (for a rusher meeting a blocker). */
  distanceToDepth(y: number): number {
    const pts = this.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (b.y <= y && a.y > y) return this.cumulative[i - 1]! + ((a.y - y) / (a.y - b.y)) * (this.cumulative[i]! - this.cumulative[i - 1]!);
    }
    return this.length;
  }
}

/** One leg of movement: follow a path with a profile, starting at time t0 with speed v0, after the profile's delay. */
export interface Leg { t0: number; path: Path; profile: Profile; v0: number; delay: number; job: string }

export function legPosition(leg: Leg, t: number): Vec {
  return leg.path.at(profileDistance(leg.profile, t - leg.t0 - leg.delay, leg.v0));
}
export function legSpeed(leg: Leg, t: number): number {
  const s = t - leg.t0 - leg.delay;
  if (s <= 0) return leg.v0 > 0 && leg.delay === 0 ? leg.v0 : 0;
  return profileDistance(leg.profile, s, leg.v0) >= leg.path.length ? 0 : profileSpeed(leg.profile, s, leg.v0);
}
