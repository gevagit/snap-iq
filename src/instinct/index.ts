import { fieldFrame, type FieldFrame } from '../field/geometry';
import type { PlayContent } from '../play/content';
import type { Instinct } from '../content/playSchemas';
import { rng } from '../game/drill';

/**
 * Pocket Instinct (docs/plans/instinct.md): an endless run of snaps from his eyes. Hitters rush him the ways real
 * rushers do (content/pocket/rules.yaml); allies downfield come open in windows (content/instinct/rules.yaml); he
 * moves with the pad and throws. Deterministic: the same seed and the same inputs give the same run.
 */
export const STEP = 1 / 120;
type Sign = -1 | 1;
export interface V { x: number; y: number }
export type Pattern = Instinct['patterns'][number];

/** Allies in button order; each always wears the same shape (◆ ● ▲ ■ ★). */
export const ALLY_IDS = ['X', 'Y', 'Z', 'H', 'R'] as const;

/** The throw keys on a computer, left to right across the field. */
export const THROW_KEYS = ['y', 'u', 'i', 'o', 'p'] as const;
/** Which keys a snap uses for its receivers: the outside keys always go to the outside receivers (Y the leftmost,
 * P the rightmost at the snap), the inside keys fill in between. */
const KEYS_FOR: Record<number, readonly string[]> = { 1: ['i'], 2: ['y', 'p'], 3: ['y', 'i', 'p'], 4: ['y', 'u', 'o', 'p'], 5: THROW_KEYS };
export function throwKeys(snap: Snap): Map<string, string> {
  const order = [...snap.allies].sort((a, b) => allyAt(a, 0, snap.frame, 0).x - allyAt(b, 0, snap.frame, 0).x);
  const keys = KEYS_FOR[order.length]!;
  return new Map(order.map((a, k) => [keys[k]!, a.id]));
}
const LINE = ['LT', 'LG', 'C', 'RG', 'RT'] as const;

// ------------------------------------------------------------------ one snap
export interface Ally {
  id: string;
  x0: number; y0: number; amp: number; period: number; phase: number; depthAmp: number;
  /** the shadow sits on this side of him (inside, downfield) */
  lean: Sign;
  /** windows when his shadow has fallen off him: [start, end] seconds after the snap */
  windows: [number, number][];
}
export interface Hitter {
  id: string; number: number;
  kind: 'hold' | 'edge' | 'push' | 'free' | 'drop';
  side: Sign; start: V; blocker: string | null; win: number; deep?: boolean; blitz?: boolean;
}
export interface Snap {
  level: number;
  index: number;
  pattern: Pattern;
  /** pressure side (edge, push, free) or the open side (collapse) */
  side: Sign;
  hitters: Hitter[];
  allies: Ally[];
  speedMul: number;
  /** the do-nothing hit time; Infinity on a clean snap until the late rusher */
  arrive: number;
  /** when the pressure turned real (first winning rusher within real_within of his set point) */
  real: number;
  frame: FieldFrame;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const throwSign = (c: PlayContent): Sign => (c.quarterback.throwing_hand === 'left' ? -1 : 1);
const tackleX = (c: PlayContent) => 2 * c.formations.alignment.line.split;
export const setPoint = (c: PlayContent): V => ({ x: 0, y: -c.instinct.snap.set_depth });
/** how far along the ramp a level is, 0 to 1 */
export const rampAt = (c: PlayContent, level: number) => Math.min(1, Math.max(0, (level - 1) / Math.max(1, c.instinct.ramp.levels - 1)));

/** Build the snap for a level, deterministically from the seed; every snap can be survived and completed. */
export function makeSnap(c: PlayContent, level: number, seed: number, index: number): Snap {
  for (let variant = 0; variant < 60; variant++) {
    const s = draftSnap(c, level, seed, index, variant);
    if (!s) continue;
    const ideal = runSnap(c, s, idealPolicy(c, s));
    if (ideal.result && (ideal.result.kind === 'complete')) return s;
  }
  throw new Error(`no playable snap at level ${level} (seed ${seed}, snap ${index})`);
}

export function draftSnap(c: PlayContent, level: number, seed: number, index: number, variant: number): Snap | null {
  const I = c.instinct, f = rampAt(c, level);
  const r = rng(seed * 7477 + index * 104723 + variant * 613 + 11);
  for (let k = 0; k < 4; k++) r();
  const between = (lo: number, hi: number) => lo + (hi - lo) * r();
  // the pattern, weighted, from those unlocked at this level
  const open = I.patterns.filter((p) => p.from <= level);
  let pick = r() * open.reduce((a, p) => a + p.weight, 0);
  const pattern = open.find((p) => (pick -= p.weight) < 0) ?? open[0]!;
  const off = -throwSign(c) as Sign;
  const side: Sign = r() < lerp(I.ramp.blind_side.start, I.ramp.blind_side.end, f) ? off : (-off as Sign);
  const T = tackleX(c), R = I.rush, split = c.formations.alignment.line.split;
  const hitters: Hitter[] = [
    { id: 'DE-L', number: 91, kind: 'hold', side: -1, start: { x: -(T + R.edge_start.outside_tackle), y: R.edge_start.depth }, blocker: 'LT', win: Infinity },
    { id: 'DT-L', number: 95, kind: 'hold', side: -1, start: { x: -R.inside_start.x, y: R.inside_start.depth }, blocker: 'LG', win: Infinity },
    { id: 'DT-R', number: 97, kind: 'hold', side: 1, start: { x: R.inside_start.x, y: R.inside_start.depth }, blocker: 'RG', win: Infinity },
    { id: 'DE-R', number: 99, kind: 'hold', side: 1, start: { x: T + R.edge_start.outside_tackle, y: R.edge_start.depth }, blocker: 'RT', win: Infinity },
    { id: 'LB', number: 44, kind: 'drop', side: side, start: { x: side * R.blitz_start.x, y: R.blitz_start.depth }, blocker: null, win: Infinity },
  ];
  void split;
  const de = (s: Sign) => hitters[s < 0 ? 0 : 3]!, dt = (s: Sign) => hitters[s < 0 ? 1 : 2]!;
  const TUNE = -1; // marks a win time to be tuned to the arrival
  if (pattern.id === 'edge') Object.assign(de(side), { kind: 'edge', win: TUNE });
  else if (pattern.id === 'push') Object.assign(dt(side), { kind: 'push', win: TUNE });
  else if (pattern.id === 'collapse') {
    Object.assign(de(side), { kind: 'edge', win: TUNE, deep: true });
    Object.assign(de(-side as Sign), { kind: 'edge', win: TUNE });
    Object.assign(dt(-side as Sign), { kind: 'push', win: TUNE });
  } else if (pattern.id === 'free') Object.assign(hitters[4]!, { kind: 'free', win: 0, blitz: true });
  // nobody holds the ball forever: the off-hand edge wins late if nothing else has
  const late = lerp(R.late.start, R.late.end, f);
  const lateDE = de(off);
  if (lateDE.kind === 'hold') Object.assign(lateDE, { kind: 'edge', win: late });
  const speedMul = lerp(I.ramp.rush_speed.start, I.ramp.rush_speed.end, f);
  const frame = fieldFrame(c.geometry, 'middle');
  const base: Snap = { level, index, pattern, side, hitters, allies: [], speedMul, arrive: Infinity, real: Infinity, frame };
  // tune the pressure to arrive when this level asks
  const want = between(lerp(I.arrive.start[0], I.arrive.end[0], f), lerp(I.arrive.start[1], I.arrive.end[1], f));
  const withWin = (w: number): Snap => ({
    ...base,
    hitters: hitters.map((h) => (h.win === TUNE ? { ...h, win: w + (h.deep ? R.open_late : 0) } : h)),
  });
  let snap = base;
  if (hitters.some((h) => h.win === TUNE)) {
    const hitAt = (w: number) => { const res = runSnap(c, withWin(w), idle).result; return res?.kind === 'hit' ? res.t : Infinity; };
    let lo = 0.2, hi = want;
    if (!Number.isFinite(hitAt(lo))) return null;
    if (hitAt(lo) < want) for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (hitAt(mid) > want) hi = mid; else lo = mid; }
    snap = withWin(lo);
  }
  const still = runSnap(c, snap, idle);
  const arrive = still.result?.kind === 'hit' ? still.result.t : Infinity;
  const real = still.real ?? Infinity;
  if (pattern.response !== 'stand' && !Number.isFinite(arrive)) return null;
  // the allies and their windows
  const n = I.allies.count[Math.min(level - 1, I.allies.count.length - 1)]!;
  const left = frame.leftSideline + I.allies.margin, right = frame.rightSideline - I.allies.margin;
  const len = lerp(I.allies.window.length.start, I.allies.window.length.end, f);
  const lanes = Array.from({ length: n }, (_, k) => lerp(left, right, (k + 0.5) / n) + (r() - 0.5) * ((right - left) / n) * 0.5);
  const order = [...ALLY_IDS.slice(0, n)].sort(() => r() - 0.5);
  const allies: Ally[] = order.map((id, k) => ({
    id, x0: lanes[k]!, y0: between(I.allies.depth[0], I.allies.depth[1]),
    amp: between(I.allies.weave.amplitude[0], I.allies.weave.amplitude[1]), period: between(I.allies.weave.period[0], I.allies.weave.period[1]),
    phase: r() * Math.PI * 2, depthAmp: I.allies.weave.depth, lean: (lanes[k]! > 0 ? -1 : 1) as Sign, windows: [],
  }));
  const firstStart = pattern.response === 'ball-out'
    ? I.snap.catch + between(I.allies.window.hot[0], I.allies.window.hot[1])
    : pattern.response === 'stand' || !Number.isFinite(real)
    ? between(I.allies.window.first[0], I.allies.window.first[1])
    : Math.max(c.instinct.snap.catch + 0.3, arrive + between(I.allies.window.after_pressure[0], I.allies.window.after_pressure[1]));
  allies[Math.floor(r() * n)]!.windows.push([firstStart, firstStart + len]);
  const more = I.allies.window.more[0] + Math.floor(r() * (I.allies.window.more[1] - I.allies.window.more[0] + 1));
  for (let k = 0; k < more; k++) {
    const a = allies[Math.floor(r() * n)]!, s0 = between(firstStart + 0.4, I.snap.max_time - 1);
    if (!a.windows.some(([s, e]) => s0 < e + 0.5 && s0 + len > s - 0.5)) a.windows.push([s0, s0 + len]);
  }
  for (const a of allies) a.windows.sort((p, q) => p[0] - q[0]);
  return { ...snap, allies, arrive, real };
}

// ------------------------------------------------------------------ allies and their shadows
/** Where an ally is at time t (he holds still before the snap). */
export function allyAt(a: Ally, t: number, frame: FieldFrame, margin: number): V {
  const u = Math.max(0, t);
  const x = a.x0 + a.amp * Math.sin((2 * Math.PI * u) / a.period + a.phase);
  const y = a.y0 + a.depthAmp * Math.sin((2 * Math.PI * u) / (a.period * 0.7) + a.phase * 1.3);
  return { x: Math.min(frame.rightSideline - margin * 0.5, Math.max(frame.leftSideline + margin * 0.5, x)), y };
}
/** How far his shadow is off him: tight, or open during a window (with a short change either way). */
export function separation(c: PlayContent, a: Ally, t: number): number {
  const S = c.instinct.allies.shadow;
  let u = 0;
  for (const [s, e] of a.windows) {
    const rise = Math.min(1, Math.max(0, (t - s) / S.change)), fall = Math.min(1, Math.max(0, (e - t) / S.change));
    u = Math.max(u, Math.min(rise, fall));
  }
  return S.tight + (S.open - S.tight) * u;
}
export function shadowAt(c: PlayContent, a: Ally, t: number, frame: FieldFrame): V {
  const p = allyAt(a, t, frame, c.instinct.allies.margin), d = separation(c, a, t);
  const dx = a.lean * 0.45, dy = 1, n = Math.hypot(dx, dy);
  return { x: p.x + (dx / n) * d, y: p.y + (dy / n) * d };
}
export const isOpen = (c: PlayContent, a: Ally, t: number) => separation(c, a, t) >= c.drills.reads.open_separation;

// ------------------------------------------------------------------ the snap, live
export interface Input { mx: number; my: number }
export type Action = { kind: 'throw'; target: string } | { kind: 'throw-away' };
export interface SnapResult {
  kind: 'hit' | 'complete' | 'incomplete' | 'pick' | 'throw-away' | 'grounding';
  /** when it was decided: the hit, or the ball leaving his hand */
  t: number;
  by?: string;
  target?: string;
  separation?: number;
  catchT?: number;
  catchAt?: V;
  release?: V;
}
interface Live { h: Hitter; x: number; y: number; speed: number; heading: number; phase: 'approach' | 'engaged' | 'free' | 'drop'; cornered: boolean; aimed: boolean; top: number; tau: number; turn: number; relT: number | null; meet: V }

export class SnapSim {
  readonly c: PlayContent;
  readonly snap: Snap;
  readonly set: V;
  t = 0;
  qb = { x: 0, y: 0, vx: 0, vy: 0 };
  hitters: Live[];
  readonly hist = new Map<string, { xs: number[]; ys: number[] }>();
  result: SnapResult | null = null;
  pending: { action: Action; release: number } | null = null;
  moveStart: number | null = null;
  real: number | null = null;
  /** after the result: keep everyone moving for the picture, without changing it */
  coast = false;

  constructor(c: PlayContent, snap: Snap) {
    this.c = c; this.snap = snap;
    this.set = setPoint(c);
    this.qb = { x: this.set.x, y: this.set.y, vx: 0, vy: 0 };
    const prof = c.speeds.profiles, P = c.pocket.rush;
    this.hitters = snap.hitters.map((h) => {
      const pr = prof[h.blitz ? c.speeds.jobs.blitz : c.speeds.jobs.rush]!;
      const bx = h.blocker ? this.blockerHome(h.blocker).x : h.start.x;
      return {
        h, x: h.start.x, y: h.start.y, speed: 0, heading: Math.atan2(this.set.x - h.start.x, this.set.y - h.start.y),
        phase: h.kind === 'free' ? 'free' : h.kind === 'drop' ? 'drop' : 'approach', cornered: false, aimed: false,
        top: pr.top * snap.speedMul, tau: pr.tau, turn: h.kind === 'edge' ? P.turn.edge : h.kind === 'free' ? P.turn.free : P.turn.interior, relT: null,
        meet: { x: (bx + h.start.x) / 2, y: -c.fronts.rush.meet_line },
      };
    });
    for (const id of ['QB', ...LINE, ...snap.hitters.map((h) => h.id)]) this.hist.set(id, { xs: [], ys: [] });
    this.record();
  }

  private blockerHome(id: string): V {
    const k = LINE.indexOf(id as (typeof LINE)[number]);
    return { x: (k - 2) * this.c.formations.alignment.line.split, y: -this.c.formations.alignment.line.depth };
  }

  /** Where anyone is at time t: from the history (live), the allies' paths, or their alignment before the snap. */
  pos(id: string, t: number): V {
    const al = this.snap.allies.find((a) => a.id === id);
    if (al) return allyAt(al, t, this.snap.frame, this.c.instinct.allies.margin);
    if (id.startsWith('S-')) {
      const a = this.snap.allies.find((x) => x.id === id.slice(2))!;
      const p = shadowAt(this.c, a, t, this.snap.frame);
      // a shadow does not close back on an ally the ball is in the air to
      const r = this.result;
      if (r?.target === a.id && t > r.t && r.separation !== undefined && separation(this.c, a, t) < r.separation) {
        const q = allyAt(a, t, this.snap.frame, this.c.instinct.allies.margin), d = r.separation, n = Math.hypot(a.lean * 0.45, 1);
        return { x: q.x + ((a.lean * 0.45) / n) * d, y: q.y + (1 / n) * d };
      }
      return p;
    }
    const h = this.hist.get(id)!;
    if (t <= 0) return { x: h.xs[0]!, y: h.ys[0]! };
    const f = Math.min(h.xs.length - 1, t / STEP), k = Math.floor(f), k2 = Math.min(h.xs.length - 1, k + 1), u = f - k;
    return { x: h.xs[k]! + (h.xs[k2]! - h.xs[k]!) * u, y: h.ys[k]! + (h.ys[k2]! - h.ys[k]!) * u };
  }

  private blockerPos(id: string): V {
    const home = this.blockerHome(id);
    const live = this.hitters.find((x) => x.h.blocker === id);
    const setY = home.y - 0.8 * Math.min(1, this.t / this.c.instinct.rush.meet); // pass set
    if (!live || live.phase === 'approach') return { x: home.x, y: setY };
    const h = this.hist.get(id)!;
    if (live.phase === 'free') return { x: h.xs[h.xs.length - 1]!, y: h.ys[h.ys.length - 1]! };
    const dx = this.qb.x - live.x, dy = this.qb.y - live.y, d = Math.hypot(dx, dy) || 1, g = this.c.pocket.rush.blocker_gap;
    return { x: live.x + (dx / d) * g, y: live.y + (dy / d) * g };
  }

  private record() {
    const put = (id: string, p: V) => { const h = this.hist.get(id)!; h.xs.push(p.x); h.ys.push(p.y); };
    put('QB', this.qb);
    for (const id of LINE) put(id, this.blockerPos(id));
    for (const l of this.hitters) put(l.h.id, l);
  }

  get ballOut() { return !!this.pending && this.t >= this.pending.release; }
  get canThrow() { return !this.result && !this.pending && this.t >= this.c.instinct.snap.catch; }

  act(a: Action) {
    if (!this.canThrow) return;
    // a throw to a receiver who is not on the field this snap does nothing
    if (a.kind === 'throw' && !this.snap.allies.some((x) => x.id === a.target)) return;
    const M = this.c.pocket.movement, off = -throwSign(this.c);
    const reset = this.qb.vx * off > M.offhand_reset.above ? M.offhand_reset.seconds : 0;
    this.pending = { action: a, release: this.t + this.c.drills.ball.release_delay + reset };
  }

  step(input: Input) {
    if (this.result && !this.coast) return;
    const c = this.c, P = c.pocket, R = P.rush;
    if (this.result) input = { mx: 0, my: 0 };
    this.t += STEP;
    const t = this.t;
    // his feet
    if (t >= c.instinct.snap.catch * 0.5) {
      const m = Math.min(1, Math.hypot(input.mx, input.my));
      const run = m > P.movement.run_at;
      const prof = run ? P.movement.run : P.movement.shuffle;
      const speed = run ? prof.top : prof.top * (m / P.movement.run_at);
      const dir = m > 0.05 ? { x: input.mx / Math.hypot(input.mx, input.my), y: input.my / Math.hypot(input.mx, input.my) } : { x: 0, y: 0 };
      const a = 1 - Math.exp(-STEP / prof.tau);
      this.qb.vx += (dir.x * speed - this.qb.vx) * a;
      this.qb.vy += (dir.y * speed - this.qb.vy) * a;
      const fr = this.snap.frame;
      this.qb.x = Math.min(fr.rightSideline - 0.5, Math.max(fr.leftSideline + 0.5, this.qb.x + this.qb.vx * STEP));
      this.qb.y = Math.min(-0.5, this.qb.y + this.qb.vy * STEP);
      if (Math.abs(this.qb.x) < tackleX(c) + 0.5 && this.qb.y > -P.pocket_front) { this.qb.y = -P.pocket_front; this.qb.vy = Math.min(0, this.qb.vy); }
      if (this.moveStart === null && !this.result && m > 0.15) this.moveStart = t;
    }
    // the rush
    for (const l of this.hitters) {
      const h = l.h;
      if (l.phase === 'drop') { l.y += 1.2 * STEP * Math.max(0, 1 - t / 1.5); continue; }
      if (l.phase === 'approach') {
        const u = Math.min(1, t / c.instinct.rush.meet);
        l.x = h.start.x + (l.meet.x - h.start.x) * u; l.y = h.start.y + (l.meet.y - h.start.y) * u;
        if (u >= 1) l.phase = 'engaged';
      } else if (l.phase === 'engaged') {
        let tx = this.qb.x, ty = this.qb.y, v = R.hold_drift;
        if (h.kind === 'edge') {
          tx = h.side * (tackleX(c) + R.edge_lane + (h.deep ? R.ride_wide : 0)); ty = this.set.y + (h.deep ? -R.ride_deep : 0.5); v = h.deep ? c.instinct.rush.ride_speed : R.hold_drift * 4;
          if (t >= h.win) this.free(l);
        } else if (h.kind === 'push' && t >= h.win) {
          tx = this.set.x; ty = this.set.y; v = R.push_speed * this.snap.speedMul;
          if (Math.hypot(this.qb.x - l.x, this.qb.y - l.y) < R.shed_reach) this.free(l);
          if (this.real === null && Math.hypot(l.x - this.set.x, l.y - this.set.y) < R.real_within) this.real = t;
        }
        const dx = tx - l.x, dy = ty - l.y, d = Math.hypot(dx, dy);
        if (d > 0.05 && l.phase === 'engaged') { l.x += (dx / d) * Math.min(d, v * STEP); l.y += (dy / d) * Math.min(d, v * STEP); }
      }
      if (l.phase === 'free') {
        if (this.result?.kind === 'hit' && this.result.by === h.id) continue;
        let tx = this.qb.x, ty = this.qb.y;
        if (h.kind === 'edge' && !l.cornered) {
          const cx = h.side * (tackleX(c) + R.edge_lane), cy = this.set.y + R.edge_corner;
          if (Math.hypot(cx - l.x, cy - l.y) < 1.0 || l.y < cy) l.cornered = true; else { tx = cx; ty = cy; }
        }
        if (h.kind === 'edge' && l.cornered && !l.aimed) {
          const ax = this.set.x + h.side * 0.3, ay = this.set.y - R.edge_aim_behind;
          if (Math.hypot(ax - l.x, ay - l.y) < 1.0 || l.y < ay) l.aimed = true; else { tx = ax; ty = ay; }
        }
        let dh = Math.atan2(tx - l.x, ty - l.y) - l.heading;
        while (dh > Math.PI) dh -= 2 * Math.PI;
        while (dh < -Math.PI) dh += 2 * Math.PI;
        const turn = l.turn * Math.max(1, l.top / Math.max(l.speed, 0.5)) * 0.5 + l.turn * 0.5;
        l.heading += Math.max(-turn * STEP, Math.min(turn * STEP, dh));
        const goal = Math.abs(dh) > R.break_down ? l.top * 0.35 : l.top;
        l.speed += (goal - l.speed) * (1 - Math.exp(-STEP / l.tau));
        l.x += Math.sin(l.heading) * l.speed * STEP;
        l.y += Math.cos(l.heading) * l.speed * STEP;
        if (this.real === null && Math.hypot(l.x - this.set.x, l.y - this.set.y) < R.real_within) this.real = t;
        if (!this.result && !this.ballOut && Math.hypot(l.x - this.qb.x, l.y - this.qb.y) < R.sack_reach) this.result = { kind: 'hit', t, by: h.id };
      }
    }
    this.record();
    if (this.result) return;
    if (this.pending && t >= this.pending.release) this.resolve(this.pending.action, t);
    else if (t >= c.instinct.snap.max_time) this.result = { kind: 'hit', t, by: 'clock' };
  }

  private free(l: Live) {
    l.phase = 'free'; l.relT = this.t; l.speed = 1.5;
    const R = this.c.pocket.rush;
    l.heading = l.h.kind === 'edge'
      ? Math.atan2(l.h.side * (tackleX(this.c) + R.edge_lane) - l.x, this.set.y + R.edge_corner - l.y)
      : Math.atan2(this.qb.x - l.x, this.qb.y - l.y);
  }

  private resolve(a: Action, t: number) {
    const rel = { x: this.qb.x, y: this.qb.y };
    if (a.kind === 'throw-away') {
      const fbz = this.c.geometry.landmarks.find((l) => l.id === 'free-blocking-zone') as unknown as { half_width: number };
      this.result = { kind: Math.abs(rel.x) > fbz.half_width ? 'throw-away' : 'grounding', t, release: rel };
      return;
    }
    const ally = this.snap.allies.find((x) => x.id === a.target)!;
    const { catchT, at } = catchFrom(this.c, this.snap, ally, rel, t);
    // open when the ball leaves his hand (content/instinct/rules.yaml allies)
    const sep = separation(this.c, ally, t);
    const kind = sep >= this.c.drills.reads.open_separation ? 'complete' : sep < this.c.instinct.allies.pick_reach ? 'pick' : 'incomplete';
    this.result = { kind, t, target: ally.id, separation: sep, catchT, catchAt: at, release: rel };
  }
}

/** Ball flight from his release to a moving ally: when and where the catch is. */
export function catchFrom(c: PlayContent, snap: Snap, ally: Ally, from: V, release: number): { catchT: number; at: V } {
  let ct = release + 0.5;
  for (let i = 0; i < 6; i++) { const q = allyAt(ally, ct, snap.frame, c.instinct.allies.margin); ct = release + Math.hypot(q.x - from.x, q.y - from.y) / c.drills.ball.speed; }
  return { catchT: ct, at: allyAt(ally, ct, snap.frame, c.instinct.allies.margin) };
}

const idle = () => ({ mx: 0, my: 0 });
export function runSnap(c: PlayContent, snap: Snap, policy: (s: SnapSim) => Input & { action?: Action }): SnapSim {
  const sim = new SnapSim(c, snap);
  while (!sim.result) { const u = policy(sim); if (u.action) sim.act(u.action); sim.step(u); }
  return sim;
}

/** The right move for the pattern, started just before the pressure turns real; the ball to the first ally whose
 * window will hold at the catch. Used for the ghost line and the invariant that every snap can be won. */
export function idealPolicy(c: PlayContent, snap: Snap): (s: SnapSim) => Input & { action?: Action } {
  const M = c.pocket.moves, start = Number.isFinite(snap.real) ? snap.real - 0.35 : Infinity;
  const ready = (s: SnapSim): Action | null => {
    for (const a of snap.allies) {
      if (separation(c, a, s.t + c.drills.ball.release_delay) >= c.drills.reads.open_separation + 0.3) return { kind: 'throw', target: a.id };
    }
    return null;
  };
  return (s) => {
    const dx = s.qb.x - s.set.x, dy = s.qb.y - s.set.y;
    let u = { mx: 0, my: 0 };
    if (s.t >= start) {
      if (snap.pattern.response === 'climb' && dy < M.climb.forward + 0.5) u = { mx: 0, my: 0.65 };
      if (snap.pattern.response === 'pocket-slide' && Math.abs(dx) < M['pocket-slide'].lateral + 0.9) u = { mx: -snap.side * 0.65, my: 0 };
      if (snap.pattern.response === 'pocket-escape' && Math.abs(s.qb.x) < tackleX(c) + M['pocket-escape'].outside_tackle + 1.6) u = { mx: snap.side * 0.85, my: 0.55 };
    }
    const a = s.canThrow ? ready(s) : null;
    return a ? { ...u, action: a } : u;
  };
}

// ------------------------------------------------------------------ what he did with his feet
export interface Move { kind: 'stand' | 'climb' | 'pocket-slide' | 'pocket-escape'; side: Sign | 0 }
export function classify(c: PlayContent, s: SnapSim): Move {
  const M = c.pocket.moves, h = s.hist.get('QB')!, end = s.pending ? s.pending.release : s.result ? s.result.t : s.t;
  let maxF = 0, latAtF = 0, maxL = 0, sideL: Sign | 0 = 0, out: Sign | 0 = 0;
  for (let k = 0; k < h.xs.length && k * STEP <= end; k++) {
    const dx = h.xs[k]! - s.set.x, dy = h.ys[k]! - s.set.y;
    if (dy > maxF) { maxF = dy; latAtF = Math.abs(dx); }
    if (Math.abs(dx) > maxL) { maxL = Math.abs(dx); sideL = (Math.sign(dx) || 0) as Sign | 0; }
    if (!out && Math.abs(h.xs[k]!) > tackleX(c) + M['pocket-escape'].outside_tackle) out = Math.sign(h.xs[k]!) as Sign;
  }
  if (out) return { kind: 'pocket-escape', side: out };
  if (maxF >= M.climb.forward && latAtF <= M.climb.lateral_max) return { kind: 'climb', side: 0 };
  if (maxL >= M['pocket-slide'].lateral) return { kind: 'pocket-slide', side: sideL };
  return { kind: 'stand', side: 0 };
}
/** best (✓), admissible (~: he got away, not the best move) or wrong (✗); null where only the ball counts. */
export function moveGrade(c: PlayContent, s: SnapSim): 'best' | 'admissible' | 'wrong' | null {
  const p = s.snap.pattern, m = classify(c, s), hit = s.result?.kind === 'hit';
  if (p.response === 'ball-out') return null;
  if (p.response === 'stand') return m.kind === 'stand' ? 'best' : 'wrong';
  const right = p.response === 'climb' ? m.kind === 'climb'
    : p.response === 'pocket-slide' ? (m.kind === 'pocket-slide' || m.kind === 'pocket-escape') && m.side === -s.snap.side
      : m.kind === 'pocket-escape' && m.side === s.snap.side;
  return right && !hit ? 'best' : !hit && m.kind !== 'stand' ? 'admissible' : 'wrong';
}

// ------------------------------------------------------------------ the run
export interface SnapLog {
  snap: Snap; result: SnapResult; move: Move; grade: ReturnType<typeof moveGrade>;
  moveStart: number | null; real: number; held: number; counted: number; level: number;
  /** windows he caught (a completion inside) or missed (it closed while he had the ball), by ally side */
  windows: { ally: string; side: Sign; caught: boolean }[];
}

/** A whole run: snaps one after another, the level rising, until a hit or an interception. */
export class Run {
  readonly c: PlayContent;
  readonly seed: number;
  readonly startLevel: number;
  index = 0;
  level: number;
  sim: SnapSim;
  phase: 'snap' | 'between' | 'over' = 'snap';
  pause = 0;
  /** time after the result before the snap ends (the ball in the air, the hit) */
  private tail = 0;
  hang = 0;
  score = 0;
  multiplier = 1;
  completions = 0;
  log: SnapLog[] = [];
  /** wall time of the run (snaps and pauses) */
  clock = 0;

  constructor(c: PlayContent, seed: number, startLevel = 1) {
    this.c = c; this.seed = seed; this.startLevel = startLevel; this.level = startLevel;
    this.sim = new SnapSim(c, makeSnap(c, this.level, seed, 0));
  }

  act(a: Action) { if (this.phase === 'snap') this.sim.act(a); }

  step(input: Input) {
    if (this.phase === 'over') return;
    this.clock += STEP;
    if (this.phase === 'between') {
      this.pause -= STEP;
      if (this.pause <= 0) this.next();
      return;
    }
    const had = !!this.sim.result;
    this.sim.step(input);
    if (!had && this.sim.result) this.score_(this.sim.result);
    if (this.sim.result) {
      this.tail -= STEP;
      if (this.tail <= 0) {
        if (this.sim.result.kind === 'hit' || this.sim.result.kind === 'pick') this.phase = 'over';
        else { this.phase = 'between'; this.pause = this.c.instinct.snap.between; }
      }
    }
  }

  private score_(r: SnapResult) {
    const I = this.c.instinct, s = this.sim;
    this.sim.coast = true;
    this.tail = r.kind === 'hit' ? 0.9 : r.catchT !== undefined ? r.catchT - r.t + 0.35 : 0.8;
    const held = Math.max(0, (r.kind === 'hit' ? r.t : s.pending!.release) - I.snap.catch);
    const counted = Math.min(held, I.scoring.hot_clock);
    this.hang += counted;
    this.score += counted * this.multiplier;
    if (r.kind === 'complete') { this.completions++; this.multiplier += I.scoring.multiplier_step; }
    else if (r.kind !== 'hit' && r.kind !== 'pick') this.multiplier = 1;
    const end = s.pending ? s.pending.release : r.t;
    const windows: SnapLog['windows'] = [];
    for (const a of s.snap.allies) for (const [ws, we] of a.windows) {
      const caught = r.kind === 'complete' && r.target === a.id && r.t >= ws - 0.05 && r.t <= we + 0.05;
      if (caught || (we < end && ws > I.snap.catch)) windows.push({ ally: a.id, side: (Math.sign(a.x0) || 1) as Sign, caught });
    }
    this.log.push({ snap: s.snap, result: r, move: classify(this.c, s), grade: moveGrade(this.c, s), moveStart: s.moveStart, real: s.snap.real, held, counted, level: this.level, windows });
  }

  private next() {
    this.index++;
    this.level = this.startLevel + Math.floor(this.index / this.c.instinct.ramp.snaps_per_level);
    this.sim = new SnapSim(this.c, makeSnap(this.c, this.level, this.seed, this.index));
    this.phase = 'snap';
  }
}
