import type { BallSpot } from '../field/geometry';
import type { PlayContent } from '../play/content';
import type { PocketType } from '../content/playSchemas';
import { buildPlay, type Play, type PlayCall } from '../play';
import { blitzers, callReviewed, posAt, progression, rng } from '../game/drill';

/**
 * Bubble (PRD §8.4): the pocket, live. The play engine gives everyone's alignment, routes and coverage; from the
 * snap the quarterback, the rushers and their blockers are simulated here, step by step, from his movement input.
 * Every number comes from content/pocket/rules.yaml. Deterministic: same rep + same inputs ⇒ same result.
 */
export const STEP = 1 / 120;
type Sign = -1 | 1;
export type Tier = 'youth' | 'jv';
export type Mode = 'good' | 'bad' | 'unpredictable';
interface V { x: number; y: number }

// ------------------------------------------------------------------ the rep
/** What one rusher does after he meets his blocker. win: when he beats it (edge), starts to drive it (push), or never. */
export interface RushScript {
  role: string;
  blocker: string | null;
  kind: 'hold' | 'edge' | 'push' | 'free';
  win: number;
  side: Sign;
  /** a tackle rides this edge rusher deep past the pocket (the open side of a collapse) */
  deep?: boolean;
}

export interface PocketRep {
  index: number;
  tier: Tier;
  mode: Mode;
  type: PocketType;
  call: PlayCall;
  play: Play;
  reviewed: boolean;
  /** the pressure side (edge, push) or the open side (collapse), by field sign */
  side: Sign;
  scripts: RushScript[];
  speedMul: number;
  /** when the pressure would reach his set point if he stood still (the do-nothing sack time); Infinity if it holds */
  arrive: number;
  /** when the pressure turned real: the first moment a winning rusher is within real_within of his set point */
  real: number;
  /** his first read, where his eyes start */
  firstRead: string | null;
}

const throwingSign = (c: PlayContent): Sign => (c.quarterback.throwing_hand === 'left' ? -1 : 1);
const tackleX = (c: PlayContent) => 2 * c.formations.alignment.line.split;

/** Seconds into the play when his drop ends (he is set): the end of his last movement in the play engine. */
export function setTime(play: Play): number {
  const tr = play.sim.tracks.find((t) => t.id === 'QB')!;
  let last = play.sim.snapIndex;
  const end = Math.min(tr.xs.length - 1, play.sim.snapIndex + Math.round(3 / play.sim.dt));
  for (let k = play.sim.snapIndex; k < end; k++) {
    if (Math.hypot(tr.xs[k + 1]! - tr.xs[k]!, tr.ys[k + 1]! - tr.ys[k]!) / play.sim.dt > 0.05) last = k + 1;
  }
  return play.sim.tStart + last * play.sim.dt;
}

/** When a blocked rusher meets his blocker: the play engine stops him there. */
function meetTime(play: Play, role: string): number {
  for (let t = 0.15; t < 3; t += 1 / 60) {
    const a = posAt(play, role, t), b = posAt(play, role, t + 1 / 60);
    if (Math.hypot(b.x - a.x, b.y - a.y) * 60 < 0.05) return t;
  }
  return 0.6;
}

function holdRate(c: PlayContent, mode: Mode, seed: number, index: number): number {
  const m = c.pocket.modes;
  if (mode !== 'unpredictable') return m[mode].hold;
  // moves between the two values across the drill without a pattern he can count on
  const u = 0.5 + 0.3 * Math.sin(index * 1.93 + seed * 0.37) + 0.2 * Math.sin(index * 0.71 + seed);
  return m.unpredictable.hold[0] + (m.unpredictable.hold[1] - m.unpredictable.hold[0]) * Math.min(1, Math.max(0, u));
}

/** Pick the next rep for a tier and protection mode, deterministically from the seed. */
export function makePocketRep(c: PlayContent, tier: Tier, mode: Mode, seed: number, index: number, playtest: boolean): PocketRep | null {
  const P = c.pocket, T = P.tiers[tier];
  const r = rng(seed * 6151 + index * 92821 + 31);
  for (let k = 0; k < 4; k++) r(); // neighbouring seeds start out correlated
  const pick = <X>(list: readonly X[]) => list[Math.floor(r() * list.length)]!;
  const types = T.types.map((id) => P.rep_types.find((t) => t.id === id)!);
  const holds = r() < holdRate(c, mode, seed, index);
  const pool = types.filter((t) => t.holds === holds);
  const type = pick(pool.length ? pool : types);
  const spots: BallSpot[] = ['left_hash', 'middle', 'right_hash'];
  for (let attempt = 0; attempt < 600; attempt++) {
    const coverageId = pick(T.coverages);
    const coverage = c.coverages.coverages.find((x) => x.id === coverageId)!;
    const fronts = T.fronts.filter((f) => coverage.fronts[f]);
    if (!fronts.length) continue;
    const call: PlayCall = {
      formation: pick(c.formations.formations).id, strength: r() < 0.5 ? 'right' : 'left', motion: 'none', concept: pick(c.concepts.concepts).id,
      protection: pick(c.protections.protections).id, front: pick(fronts), coverage: coverage.id, spot: pick(spots),
    };
    const reviewed = callReviewed(c, call) && P.reviewed;
    if (!reviewed && !playtest) continue;
    const built = buildPlay(c, call);
    if (!built.ok || built.value.checks.some((ch) => !ch.ok)) continue;
    const play = built.value;
    const free = play.sim.rushers.filter((x) => !x.blocker && !play.sim.greenDogs.includes(x.role));
    const blitz = blitzers(play);
    if (type.blitz === 'free' ? !free.length : free.length) continue;
    if (type.blitz === 'picked-up' ? !blitz.length : !type.blitz && blitz.length) continue;
    const side: Sign = r() < 0.5 ? -1 : 1;
    const scripts = scriptRush(c, play, type, side);
    if (!scripts) continue;
    const speedMul = T.rush_speed;
    const window = P.modes[mode].arrive;
    const target = window[0] + (window[1] - window[0]) * r();
    const base: Omit<PocketRep, 'arrive' | 'real'> = {
      index, tier, mode, type, call, play, reviewed, side, scripts, speedMul,
      firstRead: progression(c, play)[0] ?? null,
    };
    const tuned = type.pressure === 'holds' || type.pressure === 'free' ? base : tuneWin(c, base, target);
    if (!tuned) continue;
    const idle = runPolicy(c, { ...tuned, arrive: Infinity, real: Infinity }, () => ({ mx: 0, my: 0 }));
    const arrive = idle.result?.kind === 'sack' ? idle.result.t : Infinity;
    if (!type.holds && !Number.isFinite(arrive)) continue;
    // the pressure cannot turn real for him before he has the ball
    const rep: PocketRep = { ...tuned, arrive, real: idle.real === null ? Infinity : Math.max(idle.real, idle.catchT + 0.2) };
    // every rep can be survived: the right move, on time, beats the rush (otherwise pick another play)
    if (runPolicy(c, rep, idealPolicy(c, rep)).result!.kind === 'sack') continue;
    return rep;
  }
  return null;
}

/** Who does what in the rush for this rep type (rep_types pressure). Null if the play has no rusher for it. */
function scriptRush(c: PlayContent, play: Play, type: PocketType, side: Sign): RushScript[] | null {
  const P = c.pocket;
  const at = (role: string) => posAt(play, role, 0);
  const rushers = play.sim.rushers;
  const dl = rushers.filter((x) => x.dl);
  const off = -throwingSign(c) as Sign;
  const sideOf = (role: string) => ((Math.sign(at(role).x) || 1) as Sign);
  const outer = (s: Sign) => dl.filter((x) => sideOf(x.role) === s).sort((a, b) => Math.abs(at(b.role).x) - Math.abs(at(a.role).x))[0];
  const inner = (s: Sign) => dl.filter((x) => sideOf(x.role) === s).sort((a, b) => Math.abs(at(a.role).x) - Math.abs(at(b.role).x))[0];
  const scripts: RushScript[] = rushers.map((x) => ({
    role: x.role, blocker: x.blocker, kind: x.blocker ? 'hold' : 'free', win: x.blocker ? Infinity : 0, side: sideOf(x.role),
  }));
  const set = (role: string | undefined, kind: RushScript['kind'], win: number, deep = false) => {
    const s = scripts.find((x) => x.role === role);
    if (!s || !s.blocker) return false;
    Object.assign(s, { kind, win }, deep ? { deep } : {});
    return true;
  };
  // whatever the rep, nobody holds the ball forever: the off-hand edge wins at hold_until
  const late = outer(off) ?? outer(-off as Sign);
  set(late?.role, 'edge', P.hold_until);
  if (type.pressure === 'edge') {
    const e = outer(side);
    if (!e || Math.abs(at(e.role).x) < tackleX(c)) return null;
    set(e.role, 'edge', 1);
    if (e.role === late?.role) set(outer(-side as Sign)?.role, 'edge', P.hold_until);
  } else if (type.pressure === 'push') {
    const i = inner(side);
    if (!i || Math.abs(at(i.role).x) > tackleX(c)) return null;
    set(i.role, 'push', 1);
  } else if (type.pressure === 'collapse') {
    const a = outer(side), b = outer(-side as Sign), i = inner(-side as Sign);
    if (!a || !b || !i || i.role === b.role) return null;
    set(a.role, 'edge', 1, true); // the open side: ridden deep, beats his man late
    set(b.role, 'edge', 1);
    set(i.role, 'push', 1);
  }
  return scripts;
}

/** Find the win time that makes the do-nothing sack land on `target` (binary search; the sim is monotone in it). */
function tuneWin(c: PlayContent, rep: Omit<PocketRep, 'arrive' | 'real'>, target: number): Omit<PocketRep, 'arrive' | 'real'> | null {
  const P = c.pocket;
  const make = (w: number) => ({
    ...rep,
    scripts: rep.scripts.map((s) => (s.win === 1 ? { ...s, win: w + (s.deep ? P.open_late : 0) } : s)),
  });
  const sackAt = (w: number) => {
    const res = runPolicy(c, { ...make(w), arrive: Infinity, real: Infinity }, () => ({ mx: 0, my: 0 })).result;
    return res?.kind === 'sack' ? res.t : Infinity;
  };
  let lo = 0.25, hi = target;
  // a rush that cannot get there as early as the mode asks comes as early as it can
  if (!Number.isFinite(sackAt(lo))) return null;
  if (sackAt(lo) >= target) return make(lo);
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (sackAt(mid) > target) hi = mid; else lo = mid;
  }
  return make(lo);
}

// ------------------------------------------------------------------ the simulation
export interface Input { mx: number; my: number }
export type Action = { kind: 'throw'; target: string } | { kind: 'throw-away' } | { kind: 'run' };
export interface PocketResult {
  kind: 'sack' | 'throw' | 'throw-away' | 'run' | 'held';
  t: number;
  by?: string;
  target?: string;
  /** a throw: room at the catch and whether the receiver was open */
  separation?: number;
  open?: boolean;
  catchT?: number;
  catchAt?: V;
  /** a throwaway from outside the free-blocking zone */
  legal?: boolean;
  release?: V;
}

interface Rusher { s: RushScript; x: number; y: number; vx: number; vy: number; speed: number; heading: number; phase: 'approach' | 'engaged' | 'free'; meet: number; aimed: boolean; top: number; tau: number; turn: number; relT: number | null }

export class PocketSim {
  readonly c: PlayContent;
  readonly rep: PocketRep;
  t = 0;
  readonly setT: number;
  /** when he has the ball (formations.yaml drops catch): from then he can throw, hot off his drop included */
  readonly catchT: number;
  readonly set: V;
  qb = { x: 0, y: 0, vx: 0, vy: 0 };
  rushers: Rusher[];
  /** live positions per player id, one entry per STEP from the snap */
  readonly hist = new Map<string, { xs: number[]; ys: number[] }>();
  readonly live = new Set<string>();
  result: PocketResult | null = null;
  pending: { action: Action; release: number } | null = null;
  running = false;
  /** he left his drop early with the pad */
  broke = false;
  /** when he first moved after he was set, and when the pressure turned real (first rusher within real_within) */
  moveStart: number | null = null;
  real: number | null = null;

  constructor(c: PlayContent, rep: PocketRep) {
    this.c = c; this.rep = rep;
    const play = rep.play;
    this.setT = setTime(play);
    this.catchT = c.formations.drops[play.offense.formation.qb].catch;
    const sp = posAt(play, 'QB', this.setT);
    this.set = { x: sp.x, y: sp.y };
    const q0 = posAt(play, 'QB', 0);
    this.qb = { x: q0.x, y: q0.y, vx: 0, vy: 0 };
    const prof = c.speeds.profiles;
    this.rushers = rep.scripts.map((s) => {
      const p = posAt(play, s.role, 0);
      const blitzer = !play.sim.rushers.find((x) => x.role === s.role)!.dl;
      const pr = prof[blitzer ? c.speeds.jobs.blitz : c.speeds.jobs.rush]!;
      const turn = s.kind === 'edge' ? c.pocket.rush.turn.edge : s.kind === 'free' ? c.pocket.rush.turn.free : c.pocket.rush.turn.interior;
      return { s, x: p.x, y: p.y, vx: 0, vy: 0, speed: 0, heading: Math.atan2(-p.x, q0.y - p.y), phase: s.blocker ? 'approach' : 'free', meet: s.blocker ? meetTime(play, s.role) : 0, aimed: false, top: pr.top * rep.speedMul, tau: pr.tau, turn, relT: null };
    });
    this.live.add('QB');
    for (const r of this.rushers) { this.live.add(r.s.role); if (r.s.blocker) this.live.add(r.s.blocker); }
    for (const id of this.live) this.hist.set(id, { xs: [], ys: [] });
    this.record();
  }

  /** Where a player is at time t (live players from the history, everyone else from the play engine). */
  pos(id: string, t: number): V {
    const h = this.hist.get(id);
    if (!h) return posAt(this.rep.play, id, t);
    if (t <= 0) return posAt(this.rep.play, id, t);
    const f = Math.min(h.xs.length - 1, t / STEP), k = Math.floor(f), k2 = Math.min(h.xs.length - 1, k + 1), u = f - k;
    return { x: h.xs[k]! + (h.xs[k2]! - h.xs[k]!) * u, y: h.ys[k]! + (h.ys[k2]! - h.ys[k]!) * u };
  }

  private record() {
    const put = (id: string, x: number, y: number) => { const h = this.hist.get(id)!; h.xs.push(x); h.ys.push(y); };
    put('QB', this.qb.x, this.qb.y);
    for (const r of this.rushers) {
      put(r.s.role, r.x, r.y);
      if (r.s.blocker) {
        const b = this.blockerPos(r);
        put(r.s.blocker, b.x, b.y);
      }
    }
  }

  private blockerPos(r: Rusher): V {
    const id = r.s.blocker!;
    if (r.phase === 'approach' || this.t <= 0) return posAt(this.rep.play, id, this.t);
    const h = this.hist.get(id)!;
    if (r.phase === 'free') return { x: h.xs[h.xs.length - 1]!, y: h.ys[h.ys.length - 1]! }; // beaten: he stays where he lost
    const dx = this.qb.x - r.x, dy = this.qb.y - r.y, d = Math.hypot(dx, dy) || 1, g = this.c.pocket.rush.blocker_gap;
    return { x: r.x + (dx / d) * g, y: r.y + (dy / d) * g };
  }

  /** Can he throw now? Once he has the ball, not past the line of scrimmage. */
  get canThrow() { return !this.result && !this.pending && this.t >= this.catchT && this.qb.y < 0; }

  act(action: Action) {
    if (this.result || this.pending) return;
    if (action.kind === 'run') { this.running = true; return; }
    if (!this.canThrow) return;
    const M = this.c.pocket.movement;
    // moving toward his off-hand side, he resets his hips before the ball comes out (glossary off-hand-reset)
    const off = -throwingSign(this.c);
    const reset = this.qb.vx * off > M.offhand_reset.above ? M.offhand_reset.seconds : 0;
    this.pending = { action, release: this.t + this.c.drills.ball.release_delay + reset };
  }

  step(input: Input) {
    if (this.result) return;
    const c = this.c, P = c.pocket, play = this.rep.play;
    this.t += STEP;
    const t = this.t;
    // the quarterback: his drop from the play engine until he is set, or until he breaks off it with the pad (any
    // time after the catch); then his feet
    if (!this.broke && t >= this.catchT && Math.hypot(input.mx, input.my) > 0.15) this.broke = true;
    if (t < this.setT && !this.broke && !this.running) {
      const p = posAt(play, 'QB', t);
      this.qb = { x: p.x, y: p.y, vx: (p.x - this.qb.x) / STEP, vy: (p.y - this.qb.y) / STEP };
    } else {
      let mx = input.mx, my = input.my;
      if (this.running) { mx = 0; my = 1; }
      const m = Math.min(1, Math.hypot(mx, my));
      const runNow = m > P.movement.run_at;
      const prof = runNow ? P.movement.run : P.movement.shuffle;
      const speed = runNow ? prof.top : prof.top * (m / P.movement.run_at);
      const dir = m > 0.05 ? { x: mx / Math.hypot(mx, my), y: my / Math.hypot(mx, my) } : { x: 0, y: 0 };
      const a = 1 - Math.exp(-STEP / prof.tau);
      this.qb.vx += (dir.x * speed - this.qb.vx) * a;
      this.qb.vy += (dir.y * speed - this.qb.vy) * a;
      const fr = play.offense.frame;
      this.qb.x = Math.min(fr.rightSideline - 0.5, Math.max(fr.leftSideline + 0.5, this.qb.x + this.qb.vx * STEP));
      this.qb.y += this.qb.vy * STEP;
      if (this.moveStart === null && (t >= this.setT || this.broke) && Math.hypot(input.mx, input.my) > 0.15) this.moveStart = t;
    }
    // the rush
    const R = P.rush;
    for (const r of this.rushers) {
      if (r.phase === 'approach') {
        const p = posAt(play, r.s.role, t);
        r.x = p.x; r.y = p.y;
        if (t >= r.meet) r.phase = 'engaged';
      } else if (r.phase === 'engaged') {
        const s = r.s;
        let tx = this.qb.x, ty = this.qb.y, v = R.hold_drift;
        if (s.kind === 'edge') {
          // a speed rusher works up the edge, outside the tackle (deep past the pocket when the tackle rides him)
          tx = s.side * (tackleX(c) + R.edge_lane + (s.deep ? R.ride_wide : 0)); ty = this.set.y + (s.deep ? -R.ride_deep : 0.5); v = R.hold_drift * (s.deep ? 8 : 4);
          if (t >= s.win) this.release(r);
        } else if (s.kind === 'push' && t >= s.win) {
          // a bull rush drives straight back at his set point
          tx = this.set.x; ty = this.set.y; v = R.push_speed * this.rep.speedMul;
          if (Math.hypot(this.qb.x - r.x, this.qb.y - r.y) < R.shed_reach) this.release(r);
        }
        const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy);
        if (d > 0.05 && r.phase === 'engaged') { r.x += (dx / d) * Math.min(d, v * STEP); r.y += (dy / d) * Math.min(d, v * STEP); }
      }
      if (r.phase === 'free') {
        // he chases: toward the top of the rush first (a speed rusher), then at the quarterback, turning only so fast
        let tx = this.qb.x, ty = this.qb.y;
        if (r.s.kind === 'edge' && !r.aimed) {
          // the top of the rush: the spot just behind his set point, until he gets there
          const ax = this.set.x + r.s.side * 0.3, ay = this.set.y - R.edge_aim_behind;
          if (Math.hypot(ax - r.x, ay - r.y) < 1.0 || r.y < ay) r.aimed = true; else { tx = ax; ty = ay; }
        }
        const want = Math.atan2(tx - r.x, ty - r.y);
        let dh = want - r.heading;
        while (dh > Math.PI) dh -= 2 * Math.PI;
        while (dh < -Math.PI) dh += 2 * Math.PI;
        // he turns faster the slower he goes; facing well away from his target he breaks down to turn back
        const turn = r.turn * Math.max(1, r.top / Math.max(r.speed, 0.5)) * 0.5 + r.turn * 0.5;
        r.heading += Math.max(-turn * STEP, Math.min(turn * STEP, dh));
        const goal = Math.abs(dh) > R.break_down ? r.top * 0.35 : r.top;
        r.speed += (goal - r.speed) * (1 - Math.exp(-STEP / r.tau));
        r.x += Math.sin(r.heading) * r.speed * STEP;
        r.y += Math.cos(r.heading) * r.speed * STEP;
        if (this.real === null && Math.hypot(r.x - this.set.x, r.y - this.set.y) < P.rush.real_within) this.real = t;
        if (!this.ballGone(t) && Math.hypot(r.x - this.qb.x, r.y - this.qb.y) < R.sack_reach && this.qb.y < 0) {
          this.result = { kind: 'sack', t, by: r.s.role };
        }
      } else if (r.phase === 'engaged' && r.s.kind === 'push' && t >= r.s.win && this.real === null && Math.hypot(r.x - this.set.x, r.y - this.set.y) < P.rush.real_within) this.real = t;
    }
    this.record();
    if (this.result) return;
    if (this.pending && t >= this.pending.release) this.resolve(this.pending.action, t);
    else if (this.running && this.qb.y > 0.5) this.result = { kind: 'run', t };
    else if (t >= P.max_time) this.result = { kind: 'held', t };
  }

  private ballGone(t: number) { return !!this.pending && t >= this.pending.release; }

  private release(r: Rusher) {
    r.phase = 'free'; r.relT = this.t;
    r.heading = Math.atan2(this.qb.x - r.x, this.qb.y - r.y);
    if (r.s.kind === 'edge') r.heading = Math.atan2(this.set.x + r.s.side * 0.3 - r.x, this.set.y - this.c.pocket.rush.edge_aim_behind - r.y);
    r.speed = 1.5;
  }

  private resolve(a: Action, t: number) {
    const rel = { x: this.qb.x, y: this.qb.y };
    if (a.kind === 'throw-away') {
      const fbz = this.c.geometry.landmarks.find((l) => l.id === 'free-blocking-zone') as unknown as { half_width: number };
      this.result = { kind: 'throw-away', t, legal: Math.abs(rel.x) > fbz.half_width, release: rel };
      return;
    }
    if (a.kind !== 'throw') return;
    const play = this.rep.play, speed = this.c.drills.ball.speed;
    let ct = t + 0.5;
    for (let i = 0; i < 6; i++) { const q = posAt(play, a.target, ct); ct = t + Math.hypot(q.x - rel.x, q.y - rel.y) / speed; }
    const at = posAt(play, a.target, ct);
    const rushers = new Set(this.rushers.map((r) => r.s.role));
    const sep = Math.min(...play.defense.players.filter((d) => !rushers.has(d.role)).map((d) => { const q = posAt(play, d.role, ct); return Math.hypot(q.x - at.x, q.y - at.y); }));
    this.result = { kind: 'throw', t, target: a.target, separation: sep, open: sep >= this.c.drills.reads.open_separation, catchT: ct, catchAt: at, release: rel };
  }
}

/** Run a rep to the end with a controller (input and actions from the state). Used for the ideal path and tests. */
export function runPolicy(c: PlayContent, rep: PocketRep, policy: (sim: PocketSim) => Input & { action?: Action }): PocketSim {
  const sim = new PocketSim(c, rep);
  while (!sim.result) {
    const u = policy(sim);
    if (u.action) sim.act(u.action);
    sim.step(u);
  }
  return sim;
}

// ------------------------------------------------------------------ the right move, and grading
export interface Path { kind: 'stand' | 'climb' | 'pocket-slide' | 'pocket-escape'; side: Sign | 0; maxForward: number; maxLateral: number }

/** What he did with his feet after he was set, up to the ball coming out (or the end). */
export function classify(c: PlayContent, sim: PocketSim): Path {
  const M = c.pocket.moves, h = sim.hist.get('QB')!, end = sim.pending ? sim.pending.release : sim.t;
  let maxF = 0, maxL = 0, sideL: Sign | 0 = 0, out: Sign | 0 = 0, latAtF = 0;
  for (let k = Math.ceil(sim.setT / STEP); k < h.xs.length && k * STEP <= end; k++) {
    const dx = h.xs[k]! - sim.set.x, dy = h.ys[k]! - sim.set.y;
    if (dy > maxF) { maxF = dy; latAtF = Math.abs(dx); }
    if (Math.abs(dx) > maxL) { maxL = Math.abs(dx); sideL = (Math.sign(dx) || 0) as Sign | 0; }
    if (!out && Math.abs(h.xs[k]!) > tackleX(c) + M['pocket-escape'].outside_tackle) out = (Math.sign(h.xs[k]!) as Sign);
  }
  if (out) return { kind: 'pocket-escape', side: out, maxForward: maxF, maxLateral: maxL };
  if (maxF >= M.climb.forward && latAtF <= M.climb.lateral_max) return { kind: 'climb', side: 0, maxForward: maxF, maxLateral: maxL };
  if (maxL >= M['pocket-slide'].lateral) return { kind: 'pocket-slide', side: sideL, maxForward: maxF, maxLateral: maxL };
  return { kind: 'stand', side: 0, maxForward: maxF, maxLateral: maxL };
}

export interface PocketGrade {
  /** his move: best (✓), admissible (~: correct but not the best), wrong (✗); null when the rep grades only the ball */
  move: 'best' | 'admissible' | 'wrong' | null;
  path: Path;
  timing: boolean | null;
  sacked: boolean;
  ball: 'complete' | 'covered' | 'run' | 'throw-away' | 'grounding' | 'none';
  onTime: boolean | null;
  xp: number;
}

export function gradePocket(c: PlayContent, sim: PocketSim): PocketGrade {
  const P = c.pocket, rep = sim.rep, type = rep.type, res = sim.result!;
  const path = classify(c, sim);
  const sacked = res.kind === 'sack' || res.kind === 'held';
  const hf = P.moves['happy-feet'];
  let move: PocketGrade['move'] = null;
  const away = -rep.side as Sign;
  if (type.response === 'stand') {
    const h = sim.hist.get('QB')!, end = sim.pending ? sim.pending.release : sim.t;
    let calm = true;
    for (let k = Math.ceil(sim.setT / STEP); k < h.xs.length && k * STEP <= end; k++) {
      const dx = Math.abs(h.xs[k]! - sim.set.x), dy = h.ys[k]! - sim.set.y;
      if (dx > hf.lateral || dy > hf.forward || -dy > hf.back) calm = false;
    }
    move = calm ? 'best' : 'wrong';
  } else if (type.response === 'climb') move = path.kind === 'climb' ? 'best' : !sacked && path.kind !== 'stand' ? 'admissible' : 'wrong';
  else if (type.response === 'pocket-slide') {
    const awayMove = (path.kind === 'pocket-slide' || path.kind === 'pocket-escape') && path.side === away;
    move = awayMove && !sacked ? 'best' : !sacked && path.kind !== 'stand' ? 'admissible' : 'wrong';
  } else if (type.response === 'pocket-escape') move = path.kind === 'pocket-escape' && path.side === rep.side && !sacked ? 'best' : !sacked && path.kind === 'pocket-escape' ? 'admissible' : 'wrong';
  const T = P.moves.timing;
  const timing = type.response === 'stand' || type.response === 'ball-out' ? null : sim.moveStart !== null && Number.isFinite(rep.real) && sim.moveStart >= rep.real - T.early && sim.moveStart <= rep.real + T.late;
  const ball: PocketGrade['ball'] = sacked ? 'none' : res.kind === 'run' ? 'run' : res.kind === 'throw-away' ? (res.legal ? 'throw-away' : 'grounding') : res.kind === 'throw' ? (res.open ? 'complete' : 'covered') : 'none';
  const outT = sim.pending ? sim.pending.release : null;
  const onTime = type.holds ? outT !== null && outT <= P.on_time : type.response === 'ball-out' ? outT !== null && outT < rep.arrive : null;
  const p = P.points;
  let xp = 0;
  if (move === 'best') xp += p.move; else if (move === 'admissible') xp += p.admissible_move;
  if (timing) xp += p.timing;
  if (!sacked) xp += p.no_sack;
  if (ball === 'complete' || ball === 'run' || ball === 'throw-away') xp += p.ball_out;
  if (ball === 'complete') xp += p.completion;
  if (onTime) xp += p.on_time;
  return { move, path, timing, sacked, ball, onTime, xp };
}

/**
 * The ideal path (the ghost line in the Breakdown, and the invariant that every rep can be survived): the rep type's
 * right move, started just before the pressure turns real, then the ball out to the most open receiver.
 */
export function idealPolicy(c: PlayContent, rep: PocketRep): (sim: PocketSim) => Input & { action?: Action } {
  const P = c.pocket, M = P.moves;
  const start = Number.isFinite(rep.real) ? rep.real - 0.35 : Infinity; // he may break off his drop to do it
  const best = (sim: PocketSim): Action => {
    const play = rep.play;
    let top: { id: string; sep: number } | null = null;
    for (const id of progression(c, play)) {
      const q = posAt(play, id, sim.t + 0.9);
      const rushers = new Set(rep.scripts.map((s) => s.role));
      const sep = Math.min(...play.defense.players.filter((d) => !rushers.has(d.role)).map((d) => { const p = posAt(play, d.role, sim.t + 0.9); return Math.hypot(p.x - q.x, p.y - q.y); }));
      if (!top || sep > top.sep) top = { id, sep };
    }
    return top ? { kind: 'throw', target: top.id } : { kind: 'throw-away' };
  };
  return (sim) => {
    const t = sim.t, dx = sim.qb.x - sim.set.x, dy = sim.qb.y - sim.set.y;
    switch (rep.type.response) {
      case 'stand': return t >= P.on_time - 0.5 && sim.canThrow ? { mx: 0, my: 0, action: best(sim) } : { mx: 0, my: 0 };
      case 'ball-out': return sim.canThrow ? { mx: 0, my: 0, action: best(sim) } : { mx: 0, my: 0 };
      case 'climb':
        if (t < start) return { mx: 0, my: 0 };
        if (dy < M.climb.forward + 0.5) return { mx: 0, my: 0.65 };
        return sim.canThrow ? { mx: 0, my: 0, action: best(sim) } : { mx: 0, my: 0 };
      case 'pocket-slide':
        if (t < start) return { mx: 0, my: 0 };
        if (Math.abs(dx) < M['pocket-slide'].lateral + 0.9) return { mx: -rep.side * 0.65, my: 0 };
        return sim.canThrow ? { mx: 0, my: 0, action: best(sim) } : { mx: 0, my: 0 };
      case 'pocket-escape':
        if (t < start) return { mx: 0, my: 0 };
        if (Math.abs(sim.qb.x) < tackleX(c) + M['pocket-escape'].outside_tackle + 1.6) return { mx: rep.side * 0.85, my: 0.55 };
        return sim.canThrow ? { mx: rep.side * 0.3, my: 0, action: { kind: 'throw-away' } } : { mx: 0, my: 0 };
    }
  };
}
