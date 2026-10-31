import { z } from 'zod';
import { rng } from '../game/drill';

/**
 * Rooftop Run (docs/plans/rooftop.md): the Pocket workout. A courier on neon rooftops, seen through his own eyes,
 * dodges hunter drones and tosses packages to friends whose lanterns light up when their watcher drone drifts off
 * them. Round after round, a little faster each time; a hit or a snatched package ends the run. Not football: every
 * number comes from content/rooftop/rules.yaml. Deterministic: the same seed and the same inputs give the same run.
 */
export const STEP = 1 / 120;

// ------------------------------------------------------------------ settings (content/rooftop/rules.yaml)
const Range = z.tuple([z.number(), z.number()]).refine((r) => r[0] <= r[1], 'a range runs low to high');
const StartEnd = z.object({ start: z.number(), end: z.number() }).strict();
const FROM = ['ahead', 'side', 'throwing', 'off'] as const;
const Look = z.object({ id: z.string(), name: z.string(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), at: z.number().min(0) }).strict();
export const RooftopRules = z
  .object({
    version: z.number().int(),
    roof: z.object({ half_width: z.number().positive(), back: z.number().negative(), gap: z.number().positive() }).strict(),
    courier: z.object({ eye: z.number().positive(), step: z.number().positive(), dash: z.number().positive(), accel: z.number().positive(), tap_gap: z.number().positive(), start: z.tuple([z.number(), z.number()]) }).strict(),
    drones: z.object({
      speed: StartEnd, spawn: z.number().positive(), height: z.number().positive(), turn: z.number().positive(),
      commit: StartEnd, warn: z.number().min(0), ahead: z.number().min(0), side: Range,
      hit: z.number().positive(), near: z.number().positive(), first: Range, gap: Range, react: z.number().min(0),
    }).strict(),
    friends: z.object({
      count: z.array(z.number().int().min(1).max(5)).min(1),
      depth: Range, bearing: z.number().positive().max(80), spacing: z.number().positive(), rise: Range,
      watcher: z.object({ tight: z.number().positive(), open: z.number().positive(), change: z.number().positive() }).strict(),
      lit: z.number().gt(0).lt(1), snatch: z.number().positive(),
      window: z.object({ after: Range, early: Range, length: StartEnd, more: z.tuple([z.number().int().min(0), z.number().int().min(0)]), later: Range }).strict(),
      blind: StartEnd,
    }).strict(),
    toss: z.object({ release: z.number().min(0), speed: z.number().positive() }).strict(),
    patterns: z.array(z.object({ id: z.string(), from: z.number().int().positive(), weight: z.number().positive(), early: z.boolean(), drones: z.array(z.enum(FROM)).min(1) }).strict()).min(1),
    ramp: z.object({ rounds_per_level: z.number().int().positive(), levels: z.number().int().positive(), restart_below: z.number().int().min(0) }).strict(),
    scoring: z.object({
      delivery: z.number().min(0), quick: z.number().min(0), hot_clock: z.number().positive(), swarm_every: z.number().positive(),
      near_miss: z.number().min(0), streak_step: z.number().min(0), streak_cap: z.number().min(1),
    }).strict(),
    beats: z.object({ result: z.number().min(0), jump: z.number().positive(), over: z.number().min(0) }).strict(),
    unlocks: z.object({ jackets: z.array(Look).min(1), trails: z.array(Look).min(1) }).strict(),
    reviewed: z.boolean(),
  })
  .strict();
export type Rules = z.infer<typeof RooftopRules>;
export type From = (typeof FROM)[number];
export type Pattern = Rules['patterns'][number];

/** The game's settings plus his throwing hand (his blind side is his off-hand side). */
export interface Game { r: Rules; hand: 'left' | 'right' }
export function makeGame(raw: unknown, hand: 'left' | 'right'): Game { return { r: RooftopRules.parse(raw), hand }; }
/** +1 when his off-hand side is to the right of the view (a left-handed courier), -1 otherwise. */
export const offSign = (g: Game) => (g.hand === 'left' ? 1 : -1);

/** Settings checks beyond the schema; each message says what to fix. */
export function checkRules(r: Rules): string[] {
  const e: string[] = [];
  const file = 'rooftop/rules.yaml';
  if (!r.patterns.some((p) => p.from === 1)) e.push(`${file}: no pattern at level 1`);
  if (r.friends.watcher.open <= r.friends.watcher.tight) e.push(`${file}: a watcher off its friend must be farther than on him`);
  if (r.friends.snatch >= r.friends.watcher.tight + r.friends.lit * (r.friends.watcher.open - r.friends.watcher.tight)) e.push(`${file}: snatch reach must be closer than a lit lantern's watcher`);
  if (r.drones.near <= r.drones.hit) e.push(`${file}: a near miss must reach farther than a hit`);
  if (r.drones.commit.end * r.drones.speed.end <= r.drones.hit * 2) e.push(`${file}: drones must lock on well before they are close enough to hit`);
  // after a lock-on he always has time to see it, react and tap once clear, even at the top level
  if (r.courier.step < r.drones.hit + 0.2) e.push(`${file}: one tap must step him clear of a drone (step more than hit + 0.2 m)`);
  const left = r.drones.commit.end - r.drones.react - r.courier.step / r.courier.dash;
  if (left < 0.1) e.push(`${file}: at the top level one tap after his reaction lands only ${left.toFixed(2)} s before the drone arrives; lock on earlier`);
  if (r.drones.side[1] + 2 >= VIEW / 2) e.push(`${file}: drones must launch inside his view (within ${VIEW / 2 - 2} degrees)`);
  const ids = new Set<string>();
  for (const k of ['jackets', 'trails'] as const) {
    if (!r.unlocks[k].some((u) => u.at === 0)) e.push(`${file}: no ${k} look free from the start`);
    for (const u of r.unlocks[k]) { if (ids.has(u.id)) e.push(`${file}: duplicate unlock id ${u.id}`); ids.add(u.id); }
  }
  return e;
}

// ------------------------------------------------------------------ friends: always the same shape and button
/** Friends in button order; each always wears the same shape (◆ ● ▲ ■ ★). */
export const FRIEND_IDS = ['A', 'B', 'C', 'D', 'E'] as const;
export const GLYPHS: Record<string, string> = { A: '◆', B: '●', C: '▲', D: '■', E: '★' };
/** The toss keys on a computer, left to right across the view. With fewer friends the outside keys stay outside. */
export const TOSS_KEYS = ['y', 'u', 'i', 'o', 'p'] as const;
const KEYS_FOR: Record<number, readonly string[]> = { 1: ['i'], 2: ['y', 'p'], 3: ['y', 'i', 'p'], 4: ['y', 'u', 'o', 'p'], 5: TOSS_KEYS };
export function tossKeys(round: Round): Map<string, string> {
  const order = [...round.friends].sort((a, b) => a.x - b.x);
  const keys = KEYS_FOR[order.length]!;
  return new Map(order.map((f, k) => [keys[k]!, f.id]));
}

export interface Friend {
  id: string;
  x: number; z: number; rise: number;
  /** the side of the view he is on, by his hands: his throwing-hand side or his off-hand (blind) side */
  side: 'throwing' | 'off';
  /** which way his watcher drifts off him (+1 right, -1 left) */
  drift: -1 | 1;
  /** when his lantern can light: [start, end] seconds into the round (the watcher is off him in between) */
  windows: [number, number][];
}
export interface Launch { id: string; from: From; t: number; x: number; z: number; speed: number; commit: number }
export interface Round {
  seed: number; level: number; pattern: Pattern;
  friends: Friend[];
  launches: Launch[];
  /** the first lantern: who, and when */
  first: { id: string; t: number };
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const rampAt = (g: Game, level: number) => clamp((level - 1) / Math.max(1, g.r.ramp.levels - 1), 0, 1);
const between = (rand: () => number, [a, b]: readonly [number, number]) => a + (b - a) * rand();

/** How far a friend's watcher is off him at time t: tight on him, open during a window, easing between. */
export function separation(g: Game, f: Friend, t: number): number {
  const { tight, open, change } = g.r.friends.watcher;
  let w = 0;
  for (const [a, b] of f.windows) w = Math.max(w, clamp(Math.min(t - a, b - t) / change, 0, 1));
  return tight + (open - tight) * w;
}
export const litAt = (g: Game) => g.r.friends.watcher.tight + g.r.friends.lit * (g.r.friends.watcher.open - g.r.friends.watcher.tight);
export const isLit = (g: Game, f: Friend, t: number) => separation(g, f, t) >= litAt(g) - 1e-9;

/** How wide his view is (degrees, across): every drone launches inside it, so he always sees it coming. */
export const VIEW = 100;
/** A drone's launch point for each way it can come, from where he stands at the start of a round: always in front of
 * him, inside his view; from a side means off to that side of the middle. */
function launchPoint(g: Game, from: From, rand: () => number): { x: number; z: number; side: number } {
  const off = offSign(g), r = g.r.drones, d = r.spawn, [sx, sz] = g.r.courier.start;
  const side = from === 'throwing' ? -off : from === 'off' ? off : rand() < 0.5 ? -1 : 1;
  const deg = from === 'ahead' ? between(rand, [-r.ahead, r.ahead]) : side * between(rand, r.side);
  const a = (deg * Math.PI) / 180;
  return { x: sx + d * Math.sin(a), z: sz + d * Math.cos(a), side: from === 'ahead' ? 0 : side };
}

/** Deal a round: a wave by level, friends across his view, when each lantern lights. Not yet checked: see makeRound. */
export function draftRound(g: Game, level: number, seed: number): Round {
  const r = g.r, rand = rng(seed), u = rampAt(g, level), off = offSign(g);
  const open = r.patterns.filter((p) => p.from <= level);
  let pick = rand() * open.reduce((a, p) => a + p.weight, 0);
  const pattern = open.find((p) => (pick -= p.weight) <= 0) ?? open[open.length - 1]!;
  // the wave
  const speed = lerp(r.drones.speed.start, r.drones.speed.end, u), commit = lerp(r.drones.commit.start, r.drones.commit.end, u);
  const launches: Launch[] = [];
  let t = between(rand, r.drones.first);
  pattern.drones.forEach((from, k) => {
    const p = launchPoint(g, from, rand);
    launches.push({ id: `H${k + 1}`, from, t, x: p.x, z: p.z, speed, commit });
    t += between(rand, r.drones.gap);
  });
  // friends, spread across his view, never too close together
  const n = r.friends.count[Math.min(level, r.friends.count.length) - 1]!;
  const bearings: number[] = [];
  for (let tries = 0; bearings.length < n && tries < 400; tries++) {
    const b = between(rand, [-r.friends.bearing, r.friends.bearing]);
    if (bearings.every((o) => Math.abs(o - b) >= r.friends.spacing)) bearings.push(b);
  }
  while (bearings.length < n) bearings.push(lerp(-r.friends.bearing, r.friends.bearing, bearings.length / Math.max(1, n - 1)));
  const friends: Friend[] = bearings.map((b, k) => {
    const d = between(rand, r.friends.depth), a = (b * Math.PI) / 180;
    const x = d * Math.sin(a);
    return { id: FRIEND_IDS[k]!, x, z: d * Math.cos(a), rise: between(rand, r.friends.rise), side: Math.sign(x) === off ? 'off' : 'throwing', drift: x >= 0 ? 1 : -1, windows: [] };
  });
  // the first lantern: after the wave has passed, or early (before it gets there); on his blind side as often as the level says
  const blind = rand() < lerp(r.friends.blind.start, r.friends.blind.end, u);
  const pool = friends.filter((f) => (f.side === 'off') === blind);
  const first = (pool.length ? pool : friends)[Math.floor(rand() * (pool.length || friends.length))]!;
  const len = lerp(r.friends.window.length.start, r.friends.window.length.end, u);
  const lastArrive = Math.max(...launches.map((l) => l.t + Math.hypot(l.x - r.courier.start[0], l.z - r.courier.start[1]) / l.speed));
  const t0 = pattern.early ? between(rand, r.friends.window.early) : lastArrive + between(rand, r.friends.window.after);
  first.windows.push([t0, t0 + len]);
  const more = Math.round(between(rand, [r.friends.window.more[0], r.friends.window.more[1] + 0.999]) - 0.499);
  for (let k = 0; k < more && friends.length > 1; k++) {
    const others = friends.filter((f) => f !== first);
    const f = others[Math.floor(rand() * others.length)]!;
    const ts = t0 + between(rand, r.friends.window.later);
    if (f.windows.every(([a, b]) => ts > b + 0.3 || ts + len < a - 0.3)) f.windows.push([ts, ts + len]);
  }
  return { seed, level, pattern, friends, launches, first: { id: first.id, t: t0 } };
}

// ------------------------------------------------------------------ one round, live
/** One tap moves him one step: x across (-1 left, +1 right), z ahead (+1) or back (-1). No tap: he stays where his taps put him. */
export interface Input { tap?: { x: number; z: number } }
export type Action = { kind: 'toss'; target: string };
export interface Drone {
  id: string; from: From; x: number; z: number; dx: number; dz: number; speed: number;
  /** when it launches (it hovers, blinking, for a moment before), and how long before it would reach him it locks on */
  launchT: number; commitIn: number;
  launched: boolean; committed: boolean; commitT: number | null; passed: boolean; gone: boolean; minD: number;
  /** his distance off the drone's line when it committed, and when he had cut clear of it */
  perp0: number; cutT: number | null; near: boolean; swarm: boolean;
}
export type Result =
  | { kind: 'catch'; target: string; t: number; release: number; held: number }
  | { kind: 'drop'; target: string; t: number; release: number; held: number }
  | { kind: 'snatch'; target: string; t: number; release: number; held: number }
  | { kind: 'hit'; by: string; t: number; held: number };
export interface Toss { target: string; press: number; release: number; arrive: number; kind: 'catch' | 'drop' | 'snatch' }

export class RoundSim {
  t = 0;
  x: number; z: number; vx = 0; vz = 0;
  /** where his taps have sent him */
  tx: number; tz: number;
  taps = 0;
  drones: Drone[] = [];
  toss: Toss | null = null;
  result: Result | null = null;
  /** events this step, for sound and effects: near misses, commits, swarm launches */
  events: { kind: 'near' | 'commit' | 'launch' | 'release'; id: string }[] = [];
  nearMisses = 0;
  private nextSwarm: number;
  private swarmN = 0;
  private srand: () => number;
  constructor(readonly g: Game, readonly round: Round) {
    [this.x, this.z] = g.r.courier.start;
    [this.tx, this.tz] = g.r.courier.start;
    for (const l of round.launches) this.drones.push(this.drone(l.id, l.from, l.x, l.z, l.speed, l.commit, false, l.t));
    this.nextSwarm = g.r.scoring.hot_clock;
    this.srand = rng(round.seed ^ 0x5eed);
  }
  private drone(id: string, from: From, x: number, z: number, speed: number, commitIn: number, swarm: boolean, t: number): Drone {
    return { id, from, x, z, dx: 0, dz: -1, speed, launchT: t, commitIn, launched: false, committed: false, commitT: null, passed: false, gone: false, minD: Infinity, perp0: 0, cutT: null, near: false, swarm };
  }
  get holding() { return !this.toss && !this.result; }
  friend(id: string) { return this.round.friends.find((f) => f.id === id); }

  act(a: Action) {
    if (a.kind !== 'toss' || !this.holding) return;
    const f = this.friend(a.target);
    if (!f) return; // no such friend this round: nothing happens
    const release = this.t + this.g.r.toss.release;
    const sep = separation(this.g, f, release);
    const kind = sep >= litAt(this.g) - 1e-9 ? 'catch' : sep < this.g.r.friends.snatch ? 'snatch' : 'drop';
    const flight = Math.hypot(f.x - this.x, f.z - this.z) / this.g.r.toss.speed;
    this.toss = { target: f.id, press: this.t, release, arrive: release + flight, kind };
  }

  step(u: Input) {
    if (this.result) return;
    const r = this.g.r, dt = STEP;
    this.events = [];
    // his feet: each tap sends him one step further; he dashes there and stops (tap fast to go far)
    const hw = r.roof.half_width - 0.4, zb = r.roof.back + 0.4, zf = -r.roof.back - 0.4;
    if (u.tap && (u.tap.x || u.tap.z)) {
      this.tx = clamp(this.tx + Math.sign(u.tap.x) * r.courier.step, -hw, hw);
      this.tz = clamp(this.tz + Math.sign(u.tap.z) * r.courier.step, zb, zf);
      this.taps++;
    }
    const ex = this.tx - this.x, ez = this.tz - this.z, ed = Math.hypot(ex, ez);
    const want = ed < 1e-4 ? 0 : Math.min(r.courier.dash, Math.sqrt(2 * r.courier.accel * ed), ed / dt);
    const wx = ed < 1e-4 ? 0 : (ex / ed) * want, wz = ed < 1e-4 ? 0 : (ez / ed) * want;
    const dv = Math.hypot(wx - this.vx, wz - this.vz), a = r.courier.accel * dt;
    if (dv <= a) { this.vx = wx; this.vz = wz; } else { this.vx += ((wx - this.vx) / dv) * a; this.vz += ((wz - this.vz) / dv) * a; }
    this.x = clamp(this.x + this.vx * dt, -hw, hw);
    this.z = clamp(this.z + this.vz * dt, zb, zf);
    // hold it past the hot clock and more drones come
    if (this.holding && this.t >= this.nextSwarm) {
      const id = `S${++this.swarmN}`, from: From = this.srand() < 0.5 ? 'ahead' : 'side';
      const p = launchPoint(this.g, from, this.srand);
      const l0 = this.round.launches[0]!;
      const d = this.drone(id, from, p.x, p.z, l0.speed, l0.commit, true, this.t + r.drones.warn);
      this.drones.push(d);
      this.nextSwarm += r.scoring.swarm_every;
    }
    for (const d of this.drones) this.fly(d, dt);
    this.t += dt;
    if (this.toss && this.t >= this.toss.release && this.t - dt < this.toss.release) this.events.push({ kind: 'release', id: this.toss.target });
    // a hit counts until the package lands
    for (const d of this.drones) {
      if (!d.launched || d.gone) continue;
      const dist = Math.hypot(d.x - this.x, d.z - this.z);
      d.minD = Math.min(d.minD, dist);
      if (dist < r.drones.hit) { this.result = { kind: 'hit', by: d.id, t: this.t, held: this.held() }; return; }
    }
    if (this.toss && this.t >= this.toss.arrive) {
      const { kind, target, release } = this.toss;
      this.result = { kind, target, t: this.t, release, held: release };
    }
  }
  held() { return this.toss ? this.toss.release : this.t; }

  private fly(d: Drone, dt: number) {
    const r = this.g.r;
    if (d.gone) return;
    if (!d.launched) {
      if (this.t < d.launchT) return;
      d.launched = true;
      const h = Math.hypot(this.x - d.x, this.z - d.z) || 1;
      d.dx = (this.x - d.x) / h; d.dz = (this.z - d.z) / h;
      this.events.push({ kind: 'launch', id: d.id });
    }
    const rx = this.x - d.x, rz = this.z - d.z, dist = Math.hypot(rx, rz);
    if (!d.committed) {
      // steer for where he will be (lead), at a limited turn rate
      const tti = dist / d.speed;
      const ax = this.x + this.vx * tti - d.x, az = this.z + this.vz * tti - d.z, ah = Math.hypot(ax, az) || 1;
      if (tti <= d.commitIn) {
        // lock on: straight at where he would be, no more steering. This is the moment to cut.
        d.dx = ax / ah; d.dz = az / ah; d.committed = true; d.commitT = this.t;
        d.perp0 = Math.abs(rx * d.dz - rz * d.dx);
        this.events.push({ kind: 'commit', id: d.id });
      } else {
        const want = Math.atan2(az, ax), cur = Math.atan2(d.dz, d.dx);
        let diff = want - cur; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
        const turn = clamp(diff, -r.drones.turn * dt, r.drones.turn * dt);
        d.dx = Math.cos(cur + turn); d.dz = Math.sin(cur + turn);
      }
    }
    d.x += d.dx * d.speed * dt; d.z += d.dz * d.speed * dt;
    if (d.committed) {
      const perp = Math.abs(rx * d.dz - rz * d.dx);
      if (d.cutT == null && perp >= r.drones.hit + 0.3 && perp > d.perp0) d.cutT = this.t;
      if (!d.passed && rx * d.dx + rz * d.dz < 0) {
        d.passed = true;
        if (d.minD < r.drones.near && !this.result) { d.near = true; this.nearMisses++; this.events.push({ kind: 'near', id: d.id }); }
      }
      if (d.passed && dist > 30) d.gone = true;
    }
  }
}

/**
 * The right play: stand until a drone locks on, then tap a step square off its line (toward the middle of the roof
 * when either way works), and tap again if that was not enough; toss to the first friend whose lantern is lit at
 * release. With `react` it waits that long after a lock-on before its first tap: what every round must allow a person
 * to do. Used to check every round, for the autoplay demo and as the tests' good player.
 */
export function idealPolicy(g: Game, how: { react?: number } = {}): (s: RoundSim) => Input & { action?: Action } {
  const react = how.react ?? 0, r = g.r;
  const hw = r.roof.half_width - 0.4, zb = r.roof.back + 0.4, zf = -r.roof.back - 0.4;
  const cutSide = new WeakMap<Drone, number>();
  const TAPS = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
  const fits = (s: RoundSim, t: { x: number; z: number }) => {
    const nx = s.tx + t.x * r.courier.step, nz = s.tz + t.z * r.courier.step;
    return nx >= -hw - 1e-9 && nx <= hw + 1e-9 && nz >= zb - 1e-9 && nz <= zf + 1e-9;
  };
  let last = -Infinity;
  return (s) => {
    if (s.t < last) last = -Infinity; // a new round
    let tap: { x: number; z: number } | undefined, threat = Infinity;
    for (const d of s.drones) {
      if (!d.launched || !d.committed || d.passed || d.gone || s.t - d.commitT! < react - 1e-9) continue;
      // where his taps will put him, against the drone's line (its normal is (-dz, dx))
      const rx = s.tx - d.x, rz = s.tz - d.z, along = rx * d.dx + rz * d.dz;
      if (along <= 0) continue;
      const off = rx * -d.dz + rz * d.dx;
      if (Math.abs(off) >= r.drones.hit + 0.45 || along / d.speed > threat) continue;
      threat = along / d.speed;
      let side = cutSide.get(d);
      if (side == null) {
        side = Math.abs(off) > 0.05 ? Math.sign(off) : -s.x * -d.dz - (s.z - r.roof.back / 2) * d.dx >= 0 ? 1 : -1;
        cutSide.set(d, side);
      }
      // the tap that moves him most off the line on that side, if the roof has room; else the other side
      const best = (sd: number) => TAPS.filter((t) => fits(s, t)).map((t) => ({ t, gain: (t.x * -d.dz + t.z * d.dx) * sd })).sort((p, q) => q.gain - p.gain)[0];
      let pick = best(side);
      if (!pick || pick.gain < 0.3) { side = -side; cutSide.set(d, side); pick = best(side); }
      if (pick && pick.gain > 0) tap = pick.t;
    }
    if (threat === Infinity) {
      // nothing locked on: step back toward the start spot, one tap at a time, so there is room to cut
      const safe = s.drones.every((d) => !d.launched || d.passed || d.gone || Math.hypot(d.x - s.x, d.z - s.z) > d.speed * d.commitIn * 2.2);
      const [sx, sz] = r.courier.start;
      if (safe && s.t - last > 0.35) {
        if (Math.abs(sx - s.tx) > r.courier.step * 0.75) tap = { x: Math.sign(sx - s.tx), z: 0 };
        else if (Math.abs(sz - s.tz) > r.courier.step * 0.75) tap = { x: 0, z: Math.sign(sz - s.tz) };
      }
    } else if (tap && s.t - last < r.courier.tap_gap) tap = undefined;
    if (tap) last = s.t;
    let action: Action | undefined;
    if (s.holding) {
      const f = s.round.friends.find((ff) => isLit(g, ff, s.t + r.toss.release));
      if (f) action = { kind: 'toss', target: f.id };
    }
    return { ...(tap ? { tap } : {}), ...(action ? { action } : {}) };
  };
}

/** Whether a drone he has to deal with is inside his view (it hovers or hunts in front of him until it is close). */
export function inView(g: Game, s: RoundSim, d: Drone, margin = 3): boolean {
  const dz = d.z - s.z, dx = Math.abs(d.x - s.x);
  // the last moment of a locked-on drone's run (a quarter second or so) may be at the edge; his head turns to it
  if (Math.hypot(dx, dz) <= (d.committed ? g.r.drones.near * 1.5 : g.r.drones.near)) return true;
  return dz > 0 && (Math.atan2(dx, dz) * 180) / Math.PI <= VIEW / 2 - margin;
}
/** The drones that can still get him: hovering before launch, hunting him, or locked on with its line on him. Every
 * one of them must be in his view (a drone that will miss may fly past his shoulder). */
export const watched = (g: Game, s: RoundSim) => s.drones.filter((d) => {
  if (d.gone || d.passed || !(d.launched || s.t >= d.launchT - g.r.drones.warn)) return false;
  if (!d.committed) return true;
  // locked on: still a threat only while its straight line runs at him
  return Math.abs((s.x - d.x) * d.dz - (s.z - d.z) * d.dx) < g.r.drones.hit + 0.3;
});

/** Play one round with a controller to its end (or a time limit). */
export function runRound(g: Game, round: Round, policy: (s: RoundSim) => Input & { action?: Action }, limit = 30): RoundSim {
  const s = new RoundSim(g, round);
  while (!s.result && s.t < limit) {
    const u = policy(s);
    if (u.action) s.act(u.action);
    s.step(u);
  }
  return s;
}
const still = (): Input => ({});
/** Stand still and toss to the first lit lantern: what the right move has to beat. */
export function standPolicy(g: Game): (s: RoundSim) => Input & { action?: Action } {
  return (s) => {
    const f = s.holding ? s.round.friends.find((ff) => isLit(g, ff, s.t + g.r.toss.release)) : undefined;
    return f ? { ...still(), action: { kind: 'toss', target: f.id } } : still();
  };
}

/** Why a drafted round fails the invariants (empty: it is a fair round). */
export function roundProblems(g: Game, round: Round): string[] {
  const p: string[] = [];
  // fair to a person: seeing the lock-on, reacting and tapping clear is enough, and every drone stays in his view
  let unseen = '';
  const humanPlay = idealPolicy(g, { react: g.r.drones.react });
  const human = runRound(g, round, (s) => { for (const d of watched(g, s)) if (!unseen && !inView(g, s, d)) unseen = `${d.id} at ${s.t.toFixed(2)} s`; return humanPlay(s); });
  if (human.result?.kind !== 'catch') p.push(`reacting to the lock-on and tapping clear does not complete it (${human.result?.kind ?? 'no result'})`);
  if (unseen) p.push(`a drone leaves his view before it reaches him (${unseen})`);
  if (!round.pattern.early) {
    const stand = runRound(g, round, standPolicy(g));
    if (stand.result?.kind !== 'hit') p.push(`standing still is not punished (${stand.result?.kind ?? 'no result'})`);
  }
  return p;
}
/** Deal a fair round: drafts until one passes the invariants (deterministic: the k-th draft uses seed + k). */
export function makeRound(g: Game, level: number, seed: number): Round {
  for (let k = 0; k < 40; k++) {
    const round = draftRound(g, level, (seed + k * 7919) >>> 0);
    if (!roundProblems(g, round).length) return round;
  }
  throw new Error(`no fair round at level ${level} from seed ${seed}`);
}

// ------------------------------------------------------------------ a run: round after round until a hit or a snatch
export interface Log { round: Round; result: Result; points: number; near: number; drones: Drone[]; pressT: number | null }
export type Phase = 'live' | 'result' | 'jump' | 'over';
export class Run {
  phase: Phase = 'live';
  phaseT = 0;
  clock = 0;
  score = 0;
  streak = 0;
  best = 0;
  level: number;
  rounds = 0;
  deliveries = 0;
  nearMisses = 0;
  log: Log[] = [];
  /** score at each whole second of the run, for the best-run ghost */
  timeline: number[] = [0];
  sim: RoundSim;
  /** points from the last scoring moment, for the HUD pop */
  pop: { points: number; label: string; at: number } | null = null;
  constructor(readonly g: Game, readonly seed: number, readonly startLevel = 1) {
    this.level = startLevel;
    this.sim = new RoundSim(g, makeRound(g, this.level, this.seedFor(0)));
  }
  private seedFor(i: number) { return (Math.imul(this.seed ^ 0x9e3779b9, 2654435761) + i * 104729) >>> 0; }
  get multiplier() { return Math.min(this.g.r.scoring.streak_cap, 1 + this.streak * this.g.r.scoring.streak_step); }
  act(a: Action) { if (this.phase === 'live') this.sim.act(a); }
  step(u: Input) {
    if (this.phase === 'over') return;
    const r = this.g.r, sc = r.scoring;
    this.clock += STEP;
    if (Math.floor(this.clock) > this.timeline.length - 1) this.timeline.push(this.score);
    if (this.phase === 'live') {
      const s = this.sim;
      s.step(u);
      for (const e of s.events) if (e.kind === 'near') this.add(sc.near_miss * this.multiplier, 'NEAR MISS');
      if (!s.result) return;
      const res = s.result;
      let points = 0;
      if (res.kind === 'catch') {
        this.streak++;
        this.deliveries++;
        points = (sc.delivery + sc.quick * Math.max(0, sc.hot_clock - res.release)) * this.multiplier;
        this.add(points, this.streak > 1 ? `STREAK ×${this.multiplier.toFixed(2).replace(/\.?0+$/, '')}` : 'DELIVERED');
      } else if (res.kind === 'drop') this.streak = 0;
      this.nearMisses += s.nearMisses;
      this.log.push({ round: s.round, result: res, points, near: s.nearMisses, drones: s.drones, pressT: s.toss?.press ?? null });
      this.rounds++;
      this.phase = res.kind === 'hit' || res.kind === 'snatch' ? 'over' : 'result';
      this.phaseT = 0;
      if (this.phase === 'over') this.timeline.push(this.score);
      return;
    }
    this.phaseT += STEP;
    if (this.phase === 'result' && this.phaseT >= r.beats.result) { this.phase = 'jump'; this.phaseT = 0; }
    else if (this.phase === 'jump' && this.phaseT >= r.beats.jump) {
      this.level = Math.min(r.ramp.levels, this.startLevel + Math.floor(this.rounds / r.ramp.rounds_per_level));
      this.sim = new RoundSim(this.g, makeRound(this.g, this.level, this.seedFor(this.rounds)));
      this.phase = 'live'; this.phaseT = 0;
    }
  }
  private add(points: number, label: string) {
    this.score += Math.round(points);
    this.pop = { points: Math.round(points), label, at: this.clock };
  }
}

/** The run report: what he did, and what to work on. */
export function report(run: Run) {
  const drones = run.log.flatMap((l) => l.drones.filter((d) => d.committed));
  const dodged = drones.filter((d) => d.passed && !d.swarm).length;
  const cuts = drones.filter((d) => d.cutT != null && d.commitT != null).map((d) => d.cutT! - d.commitT!);
  const bySide = { throwing: { lit: 0, caught: 0, spot: [] as number[] }, off: { lit: 0, caught: 0, spot: [] as number[] } };
  for (const l of run.log) {
    const first = l.round.friends.find((f) => f.id === l.round.first.id)!;
    const b = bySide[first.side];
    b.lit++;
    const res = l.result;
    if (res.kind === 'catch' && res.target === first.id) { b.caught++; if (l.pressT != null) b.spot.push(l.pressT - l.round.first.t); }
  }
  const last = run.log.at(-1);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return {
    score: run.score, rounds: run.rounds, deliveries: run.deliveries, nearMisses: run.nearMisses, level: run.level,
    dodged, cut: avg(cuts), bySide: { throwing: { ...bySide.throwing, spot: avg(bySide.throwing.spot) }, off: { ...bySide.off, spot: avg(bySide.off.spot) } },
    end: last?.result.kind ?? null, endBy: last?.result.kind === 'hit' ? last.drones.find((d) => d.id === (last.result as { by: string }).by)?.from ?? null : null,
  };
}

/** The looks he has earned with his best score. */
export function unlocked(g: Game, best: number) {
  return { jackets: g.r.unlocks.jackets.filter((u) => best >= u.at), trails: g.r.unlocks.trails.filter((u) => best >= u.at) };
}

/** Invariant sweep for validation: every round at every level is fair. */
export function sweepRooftop(g: Game, perLevel = 30): { rounds: number; byPattern: Record<string, number>; failures: string[] } {
  const failures = checkRules(g.r), byPattern: Record<string, number> = {};
  let rounds = 0;
  for (let level = 1; level <= g.r.ramp.levels; level++) {
    for (let i = 0; i < perLevel; i++) {
      try {
        const round = makeRound(g, level, 1000 * level + i);
        byPattern[round.pattern.id] = (byPattern[round.pattern.id] ?? 0) + 1;
        rounds++;
      } catch (err) { failures.push(String((err as Error).message)); }
    }
  }
  return { rounds, byPattern, failures };
}
