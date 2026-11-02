import { z } from 'zod';
import { rng } from '../game/drill';

/**
 * Rooftop Run (docs/plans/rooftop.md): the Pocket workout. A courier on neon rooftops, seen through his own eyes. Each
 * round is a pass rush made of drones: before the snap he sees the rushers, his protectors (each with a strength
 * rating) and his RB, and may keep the RB in on a threat he suspects. After GO the protectors hold their rushers with
 * beams until they break free; inside rushers dart at him, edge rushers go around him; friends' lanterns light on their
 * route timing, sooner the more drones rush. He tosses to a lit friend; a hit or a snatched package ends the run. The
 * game's numbers come from content/rooftop/rules.yaml. Deterministic: the same seed and inputs give the same run.
 */
export const STEP = 1 / 120;

// ------------------------------------------------------------------ settings (content/rooftop/rules.yaml)
const Range = z.tuple([z.number(), z.number()]).refine((r) => r[0] <= r[1], 'a range runs low to high');
const StartEnd = z.object({ start: z.number(), end: z.number() }).strict();
const RangeByLevel = z.object({ start: Range, end: Range }).strict();
const Look = z.object({ id: z.string(), name: z.string(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), at: z.number().min(0) }).strict();
export const RooftopRules = z
  .object({
    version: z.number().int(),
    roof: z.object({ half_width: z.number().positive(), back: z.number().negative(), gap: z.number().positive() }).strict(),
    courier: z.object({
      eye: z.number().positive(), step: z.number().positive(), dash: z.number().positive(), accel: z.number().positive(),
      tap_gap: z.number().positive(), power_max: z.number().min(1), start: z.tuple([z.number(), z.number()]),
    }).strict(),
    protection: z.object({
      linemen: z.number().int().min(1).max(7), ahead: z.number().positive(), spacing: z.number().positive(),
      strength: RangeByLevel, rb_strength: RangeByLevel, hold_max: z.number().positive(),
      double: z.number().min(0), strain: z.number().min(0), engage: z.number().positive(),
      bust: StartEnd,
    }).strict(),
    rush: z.object({
      boxes: z.array(z.object({
        id: z.string(), front: z.number().int().min(0).max(8), back: z.number().int().min(0).max(5),
        from: z.number().int().positive(), weight: z.number().positive(),
      }).strict()).min(1),
      line: Range, back_depth: Range, width: z.number().positive(), back_width: z.number().positive(), edge: z.number().positive(),
      blitz: StartEnd, front_drop: StartEnd, honest: StartEnd, delayed: StartEnd, delay: Range,
    }).strict(),
    drones: z.object({
      height: z.number().positive(), hit: z.number().positive(), near: z.number().positive(), react: z.number().min(0),
      inside: z.object({ speed: StartEnd, free_speed: StartEnd, commit: StartEnd, turn: z.number().positive() }).strict(),
      edge: z.object({ speed: StartEnd, wide: z.number().positive(), behind: z.number().positive() }).strict(),
    }).strict(),
    friends: z.object({
      count: z.array(z.number().int().min(1).max(5)).min(1),
      depth: Range, bearing: z.number().positive().max(80), spacing: z.number().positive(), rise: Range,
      watcher: z.object({ tight: z.number().positive(), open: z.number().positive(), change: z.number().positive() }).strict(),
      lit: z.number().gt(0).lt(1), snatch: z.number().positive(),
      routes: z.object({ short: z.number().positive(), long: z.number().positive() }).strict(),
      open: z.object({ quick: Range, mid: Range, deep: Range }).strict(),
      sooner: z.number().min(0), length: Range, chance: StartEnd,
      rb: z.object({ open: Range, length: Range, out: z.number().positive(), depth: z.number() }).strict(),
    }).strict(),
    toss: z.object({ release: z.number().min(0), speed: z.number().positive() }).strict(),
    ramp: z.object({ rounds_per_level: z.number().int().positive(), levels: z.number().int().positive(), restart_below: z.number().int().min(0) }).strict(),
    scoring: z.object({
      delivery: z.number().min(0), quick: z.number().min(0), quick_until: z.number().positive(), missed: z.number().min(0),
      near_miss: z.number().min(0), pickup: z.number().min(0), streak_step: z.number().min(0), streak_cap: z.number().min(1),
      clutch: z.object({ window: z.number().positive(), points: z.number().min(0) }).strict(),
    }).strict(),
    beats: z.object({ result: z.number().min(0), jump: z.number().positive(), over: z.number().min(0) }).strict(),
    unlocks: z.object({ jackets: z.array(Look).min(1), trails: z.array(Look).min(1) }).strict(),
    reviewed: z.boolean(),
  })
  .strict();
export type Rules = z.infer<typeof RooftopRules>;

/** The game's settings plus his throwing hand (his blind side is his off-hand side). */
export interface Game { r: Rules; hand: 'left' | 'right' }
export function makeGame(raw: unknown, hand: 'left' | 'right'): Game { return { r: RooftopRules.parse(raw), hand }; }
/** +1 when his off-hand side is to the right of the view (a left-handed courier), -1 otherwise. */
export const offSign = (g: Game) => (g.hand === 'left' ? 1 : -1);

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const rampAt = (g: Game, level: number) => clamp((level - 1) / Math.max(1, g.r.ramp.levels - 1), 0, 1);
const between = (rand: () => number, [a, b]: readonly [number, number]) => a + (b - a) * rand();
const atLevel = (se: { start: number; end: number }, u: number) => lerp(se.start, se.end, u);
const rangeAt = (se: { start: readonly [number, number]; end: readonly [number, number] }, u: number): [number, number] => [lerp(se.start[0], se.end[0], u), lerp(se.start[1], se.end[1], u)];

/** Settings checks beyond the schema; each message says what to fix. */
export function checkRules(r: Rules): string[] {
  const e: string[] = [];
  const file = 'rooftop/rules.yaml';
  if (r.protection.hold_max > 4) e.push(`${file}: a protector holds a drone 4 s at most (owner)`);
  if (r.drones.near <= r.drones.hit) e.push(`${file}: a near miss must reach farther than a hit`);
  if (r.courier.step < r.drones.hit + 0.2) e.push(`${file}: one tap must step him clear of a drone (step more than hit + 0.2 m)`);
  const left = r.drones.inside.commit.end - r.drones.react - r.courier.step / r.courier.dash;
  if (left < 0.1) e.push(`${file}: at the top level one tap after his reaction lands only ${left.toFixed(2)} s before an inside drone arrives; lock on earlier`);
  if (r.friends.watcher.open <= r.friends.watcher.tight) e.push(`${file}: a watcher off its friend must be farther than on him`);
  const lit = r.friends.watcher.tight + r.friends.lit * (r.friends.watcher.open - r.friends.watcher.tight);
  if (r.friends.snatch >= lit) e.push(`${file}: snatch reach must be closer than a lit lantern's watcher`);
  if (r.friends.length[0] < 1 || r.friends.length[1] > 3) e.push(`${file}: a lantern stays lit 1 to 3 seconds (owner)`);
  for (const b of r.rush.boxes) {
    if (b.front + b.back > 8 || b.front + b.back < 3) e.push(`${file}: box ${b.id} has ${b.front + b.back} drones (the box holds 3 to 8)`);
    if (b.front < 2) e.push(`${file}: box ${b.id} needs at least 2 drones on the line`);
  }
  if (!r.rush.boxes.some((b) => b.from === 1)) e.push(`${file}: no box at level 1`);
  const ids = new Set<string>();
  for (const k of ['jackets', 'trails'] as const) {
    if (!r.unlocks[k].some((u) => u.at === 0)) e.push(`${file}: no ${k} look free from the start`);
    for (const u of r.unlocks[k]) { if (ids.has(u.id)) e.push(`${file}: duplicate unlock id ${u.id}`); ids.add(u.id); }
  }
  return e;
}

// ------------------------------------------------------------------ friends: numbered left to right
export const FRIEND_IDS = ['A', 'B', 'C', 'D', 'E'] as const;
/** The RB, when he runs a route, is a friend too (on his roof, a short throw). */
export const RB_ID = 'RB';
export interface Friend {
  id: string;
  x: number; z: number; rise: number;
  /** quick, intermediate or deep route (by how far out he is), or the RB's short route */
  route: 'quick' | 'mid' | 'deep' | 'rb';
  /** the side of the view he is on, by his hands: his throwing-hand side or his off-hand (blind) side */
  side: 'throwing' | 'off';
  /** which way his watcher drifts off him (+1 right, -1 left) */
  drift: -1 | 1;
  /** when his lantern is lit: [start, end] seconds after the snap (none: covered the whole play) */
  windows: [number, number][];
}
/** The friends out this play: the rooftop friends, and the RB when he runs a route (sent out, or his threat dropped). */
export function friendsOf(round: Round, rb: string | null): Friend[] {
  const rbRuns = rb == null || !round.threats.find((t) => t.id === rb)?.blitz;
  return rbRuns ? [...round.friends, round.rbRoute] : round.friends;
}
/** The toss keys and buttons: 1 to the number of friends, left to right across his view. */
export function tossKeys(friends: Friend[]): Map<string, string> {
  const order = [...friends].sort((a, b) => Math.atan2(a.x, a.z) - Math.atan2(b.x, b.z));
  return new Map(order.map((f, k) => [String(k + 1), f.id]));
}
export function friendNumber(friends: Friend[], id: string): number {
  for (const [k, fid] of tossKeys(friends)) if (fid === id) return Number(k);
  return 0;
}

/** How far a friend's watcher is off him at time t: tight on him, open during a window, easing between. */
export function separation(g: Game, f: Friend, t: number): number {
  const { tight, open, change } = g.r.friends.watcher;
  let w = 0;
  for (const [a, b] of f.windows) w = Math.max(w, clamp(Math.min(t - a, b - t) / change, 0, 1));
  return tight + (open - tight) * w;
}
export const litAt = (g: Game) => g.r.friends.watcher.tight + g.r.friends.lit * (g.r.friends.watcher.open - g.r.friends.watcher.tight);
export const isLit = (g: Game, f: Friend, t: number) => separation(g, f, t) >= litAt(g) - 1e-9;

// ------------------------------------------------------------------ the play
/** How wide his view is (degrees, across). */
export const VIEW = 100;
export interface Protector { id: string; x: number; z: number; strength: number; rb: boolean }
/** A drone in the box. On the line (front) it nearly always rushes (one may drop out); at the second level (back) it is
 * a threat: it may blitz (maybe a beat late: delay) or drop out, and may show a tell (creeping in). */
export interface Rusher { id: string; x: number; z: number; threat: boolean; blitz: boolean; tell: boolean; edge: boolean; side: -1 | 1; delay: number }
export interface Round {
  seed: number; level: number;
  /** the box's front: how many on the line and how many at the second level (like 4-3) */
  box: string;
  protectors: Protector[]; rb: Protector;
  rushers: Rusher[]; threats: Rusher[];
  /** which lineman whiffs on his man this play (a protection bust), if any */
  bust: string | null;
  friends: Friend[]; rbRoute: Friend;
  /** jitter of each protector's hold, seconds */
  jitter: Record<string, number>;
}

/** Deal a play: the rush, the protection, the friends and their routes. Not yet checked: see makeRound. */
export function draftRound(g: Game, level: number, seed: number): Round {
  const r = g.r, rand = rng(seed), u = rampAt(g, level), off = offSign(g), [sx, sz] = r.courier.start;
  // protectors: the line in front of him, and the RB just in front of him on his blind (off-hand) side
  const P = r.protection, str = rangeAt(P.strength, u);
  const protectors: Protector[] = Array.from({ length: P.linemen }, (_, k) => ({
    id: `P${k + 1}`, x: sx + (k - (P.linemen - 1) / 2) * P.spacing, z: sz + P.ahead, strength: Math.round(between(rand, str)), rb: false,
  }));
  const rb: Protector = { id: 'RB', x: sx + off * 1.4, z: sz + 1.3, strength: Math.round(between(rand, rangeAt(P.rb_strength, u))), rb: true };
  // the box: drones on the line and at the second level (no DBs), in a front picked by level (like 4-3, 3-3, 5-3)
  const R = r.rush;
  const fronts = R.boxes.filter((x) => x.from <= level);
  let pick = rand() * fronts.reduce((a, x) => a + x.weight, 0);
  const box = fronts.find((x) => (pick -= x.weight) <= 0) ?? fronts[fronts.length - 1]!;
  const dropP = atLevel(R.front_drop, u), blitzP = atLevel(R.blitz, u), honest = atLevel(R.honest, u), lateP = atLevel(R.delayed, u);
  const rushers: Rusher[] = [];
  for (let k = 0; k < box.front; k++) {
    const x = sx + (box.front === 1 ? 0 : lerp(-R.width, R.width, k / (box.front - 1))) + between(rand, [-0.25, 0.25]);
    // a line drone nearly always rushes; now and then one drops out after the snap
    const blitz = !(k > 0 && k < box.front - 1 && rand() < dropP);
    rushers.push({ id: `D${k + 1}`, x, z: sz + between(rand, R.line), threat: false, blitz, tell: false, edge: false, side: x >= sx ? 1 : -1, delay: 0 });
  }
  const threats: Rusher[] = [];
  for (let k = 0; k < box.back; k++) {
    const x = sx + (box.back === 1 ? 0 : lerp(-R.back_width, R.back_width, k / (box.back - 1))) + between(rand, [-0.4, 0.4]);
    const blitz = rand() < blitzP;
    const tell = blitz ? rand() < honest : rand() < (1 - honest) * 0.6;
    const delay = blitz && rand() < lateP ? between(rand, R.delay) : 0;
    threats.push({ id: `T${k + 1}`, x, z: sz + between(rand, R.back_depth), threat: true, blitz, tell, edge: false, side: x >= sx ? 1 : -1, delay });
  }
  // the outermost line drone on each side, out past the end of the line, is an edge
  const sorted = [...rushers].sort((a, b) => a.x - b.x);
  for (const d of [sorted[0], sorted.at(-1)]) if (d && Math.abs(d.x - sx) >= R.edge) d.edge = true;
  const bust = rand() < atLevel(P.bust, u) ? protectors[Math.floor(rand() * protectors.length)]!.id : null;
  const jitter: Record<string, number> = {};
  for (const p of [...protectors, rb]) jitter[p.id] = between(rand, [-0.2, 0.2]);
  // friends across his view, never too close together; their route by how far out they are
  const F = r.friends;
  const n = F.count[Math.min(level, F.count.length) - 1]!;
  const bearings: number[] = [];
  for (let tries = 0; bearings.length < n && tries < 400; tries++) {
    const b = between(rand, [-F.bearing, F.bearing]);
    if (bearings.every((o) => Math.abs(o - b) >= F.spacing)) bearings.push(b);
  }
  while (bearings.length < n) bearings.push(lerp(-F.bearing, F.bearing, bearings.length / Math.max(1, n - 1)));
  const friends: Friend[] = bearings.map((b, k) => {
    const d = between(rand, F.depth), a = (b * Math.PI) / 180, x = d * Math.sin(a);
    const route = d < F.routes.short ? 'quick' : d < F.routes.long ? 'mid' : 'deep';
    return { id: FRIEND_IDS[k]!, x, z: d * Math.cos(a), rise: between(rand, F.rise), route, side: Math.sign(x) === off ? 'off' : 'throwing', drift: x >= 0 ? 1 : -1, windows: [] };
  });
  // lanterns: each route opens on its timing, sooner (and more of them) the more drones rush; 1 to 3 s each
  const rushing = rushers.filter((d) => d.blitz).length + threats.filter((t) => t.blitz).length;
  const sooner = F.sooner * (rushing - 4), chance = clamp(atLevel(F.chance, u) + 0.1 * (rushing - 4), 0.2, 1);
  const open = (f: Friend) => { const t0 = Math.max(0.4, between(rand, F.open[f.route as 'quick' | 'mid' | 'deep']) - sooner); f.windows.push([t0, t0 + between(rand, F.length)]); };
  for (const f of friends) if (rand() < chance) open(f);
  // somebody always comes open: the quickest route
  if (!friends.some((f) => f.windows.length)) open([...friends].sort((a, b) => a.z - b.z)[0]!);
  const rbT = between(rand, F.rb.open);
  const rbRoute: Friend = { id: RB_ID, x: sx + off * F.rb.out, z: sz + F.rb.depth, rise: 0, route: 'rb', side: 'off', drift: off === 1 ? 1 : -1, windows: [[rbT, rbT + between(rand, F.rb.length)]] };
  return { seed, level, box: box.id, protectors, rb, rushers, threats, bust, friends, rbRoute, jitter };
}

// ------------------------------------------------------------------ one play, live
/** One tap moves him one step: x across (-1 left, +1 right), z ahead (+1) or back (-1); a sharper flick (power above
 * 1) is a longer, faster step. No tap: he stays where his taps put him. */
export interface Input { tap?: { x: number; z: number; power?: number } }
export type Action = { kind: 'toss'; target: string };
export type Phase = 'pre' | 'engage' | 'held' | 'free' | 'drop';
export interface Drone {
  id: string; threat: boolean; edge: boolean; side: -1 | 1;
  x: number; z: number; dx: number; dz: number; h: number; speed: number;
  /** pre: before the snap; engage: flying to its blocker; held: in his beam; free: after him; drop: dropping out */
  phase: Phase;
  /** a delayed blitzer waits this long after the snap before it comes */
  delay: number;
  /** who blocks it (a protector id, 'RB', or none), and when it breaks free (seconds after the snap; never if it drops) */
  blocker: string | null; freeT: number;
  /** an inside drone locks on (eye and ring red) this long before it would reach him; an edge locks when it breaks free */
  commitIn: number; committed: boolean; commitT: number | null;
  /** an edge: the depth he stood at when it broke free (it goes around to it, chasing him sideways and back); its leg */
  z0: number; leg: number;
  passed: boolean; gone: boolean; minD: number;
  /** his distance off its line when it locked on; when he was clear of it */
  perp0: number; clearT: number | null; near: boolean; clutch: boolean;
}
export type Result =
  | { kind: 'catch'; target: string; t: number; release: number }
  | { kind: 'drop'; target: string; t: number; release: number }
  | { kind: 'snatch'; target: string; t: number; release: number }
  | { kind: 'hit'; by: string; t: number };
export interface Toss { target: string; press: number; release: number; arrive: number; kind: 'catch' | 'drop' | 'snatch' }
export type SimEvent =
  | { kind: 'near' | 'commit' | 'release' | 'free' | 'strain' | 'drop' | 'pickup' | 'missed'; id: string }
  | { kind: 'clutch'; id: string; margin: number };

export class RoundSim {
  t = 0;
  x: number; z: number; vx = 0; vz = 0;
  /** where his taps have sent him, and how fast he goes there (a sharp flick is faster) */
  tx: number; tz: number; dash: number;
  taps = 0;
  drones: Drone[] = [];
  friends: Friend[];
  toss: Toss | null = null;
  result: Result | null = null;
  events: SimEvent[] = [];
  nearMisses = 0;
  clutches = 0;
  missed = 0;
  /** lantern windows already counted as missed */
  lost: Record<string, boolean> = {};
  /** the threat the RB picks up (it blitzed and he was kept in on it), if any */
  readonly rbOn: string | null;
  constructor(readonly g: Game, readonly round: Round, rb: string | null = null) {
    const r = g.r, u = rampAt(g, round.level);
    [this.x, this.z] = r.courier.start;
    [this.tx, this.tz] = r.courier.start;
    this.dash = r.courier.dash;
    const rbThreat = rb ? round.threats.find((t) => t.id === rb) : undefined;
    this.rbOn = rbThreat?.blitz ? rbThreat.id : null;
    this.friends = friendsOf(round, rb);
    // blocking: each lineman takes the nearest rusher, middle out; spare linemen pick up blitzers, then help (double)
    const line = [...round.protectors].sort((a, b) => a.x - b.x);
    const rushing = [...round.rushers, ...round.threats].filter((d) => d.blitz);
    const blocker: Record<string, string | null> = {};
    const helpers: Record<string, number> = {};
    const open = new Set(line.map((p) => p.id));
    const take = (d: Rusher) => {
      let best: Protector | null = null;
      for (const p of line) if (open.has(p.id) && (!best || Math.abs(p.x - d.x) < Math.abs(best.x - d.x))) best = p;
      blocker[d.id] = best ? best.id : null;
      if (best) open.delete(best.id);
    };
    for (const d of round.rushers.filter((x) => x.blitz).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))) take(d);
    for (const t of round.threats.filter((x) => x.blitz)) { if (this.rbOn === t.id) blocker[t.id] = 'RB'; else take(t); }
    for (const pid of open) {
      const p = line.find((q) => q.id === pid)!;
      let best: Rusher | null = null;
      for (const d of rushing) if (blocker[d.id] && blocker[d.id] !== 'RB' && (!best || Math.abs(d.x - p.x) < Math.abs(best.x - p.x))) best = d;
      if (best) helpers[best.id] = (helpers[best.id] ?? 0) + 1;
    }
    if (round.bust) for (const d of rushing) if (blocker[d.id] === round.bust) blocker[d.id] = null;
    const P = r.protection, D = r.drones;
    const hold = (d: Rusher) => {
      const b = blocker[d.id]!;
      const p = b === 'RB' ? round.rb : round.protectors.find((q) => q.id === b)!;
      return clamp(P.hold_max * (p.strength / 99) + (round.jitter[p.id] ?? 0) + P.double * (helpers[d.id] ?? 0), 0.3, P.hold_max);
    };
    for (const d of [...round.rushers, ...round.threats]) {
      const b = d.blitz ? blocker[d.id] ?? null : null;
      this.drones.push({
        id: d.id, threat: d.threat, edge: d.edge, side: d.side, x: d.x, z: d.z, dx: 0, dz: -1, h: D.height, speed: 0,
        phase: 'pre', blocker: b, freeT: d.blitz ? d.delay + (b ? P.engage + hold(d) : 0) : Infinity, delay: d.delay,
        commitIn: atLevel(D.inside.commit, u), committed: false, commitT: null, z0: 0, leg: 0,
        passed: false, gone: false, minD: Infinity, perp0: 0, clearT: null, near: false, clutch: false,
      });
    }
  }
  /** A copy to look ahead with (the right play tries tap combos on it). */
  clone(): RoundSim {
    const c = Object.create(RoundSim.prototype) as RoundSim;
    Object.assign(c, this);
    c.drones = this.drones.map((d) => ({ ...d }));
    c.toss = this.toss && { ...this.toss };
    c.lost = { ...this.lost };
    c.events = [];
    return c;
  }
  get holding() { return !this.toss && !this.result; }
  friend(id: string) { return this.friends.find((f) => f.id === id); }
  /** Where a protector stands (the RB steps up beside him when he blocks). */
  blockerAt(id: string): { x: number; z: number } {
    if (id === 'RB') return { x: this.round.rb.x, z: this.round.rb.z + 0.4 };
    const p = this.round.protectors.find((q) => q.id === id)!;
    return { x: p.x, z: p.z };
  }

  act(a: Action) {
    if (a.kind !== 'toss' || !this.holding) return;
    const f = this.friend(a.target);
    if (!f) return; // no such friend this play: nothing happens
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
    // his feet: each tap sends him one step further (a sharp flick further and faster); he dashes there and stops
    const hw = r.roof.half_width - 0.4, zb = r.roof.back + 0.4, zf = -r.roof.back - 0.4;
    if (u.tap && (u.tap.x || u.tap.z)) {
      const pw = clamp(u.tap.power ?? 1, 1, r.courier.power_max), m = Math.hypot(u.tap.x, u.tap.z);
      this.tx = clamp(this.tx + (u.tap.x / m) * r.courier.step * pw, -hw, hw);
      this.tz = clamp(this.tz + (u.tap.z / m) * r.courier.step * pw, zb, zf);
      this.dash = r.courier.dash * pw;
      this.taps++;
    }
    const ex = this.tx - this.x, ez = this.tz - this.z, ed = Math.hypot(ex, ez);
    const want = ed < 1e-4 ? 0 : Math.min(this.dash, Math.sqrt(2 * r.courier.accel * ed), ed / dt);
    const wx = ed < 1e-4 ? 0 : (ex / ed) * want, wz = ed < 1e-4 ? 0 : (ez / ed) * want;
    const dv = Math.hypot(wx - this.vx, wz - this.vz), a = r.courier.accel * dt * (this.dash / r.courier.dash);
    if (dv <= a) { this.vx = wx; this.vz = wz; } else { this.vx += ((wx - this.vx) / dv) * a; this.vz += ((wz - this.vz) / dv) * a; }
    this.x = clamp(this.x + this.vx * dt, -hw, hw);
    this.z = clamp(this.z + this.vz * dt, zb, zf);
    for (const d of this.drones) this.fly(d, dt);
    this.t += dt;
    if (this.toss && this.t >= this.toss.release && this.t - dt < this.toss.release) this.events.push({ kind: 'release', id: this.toss.target });
    // a lantern that goes out while he still holds the package is a missed throw (once the ball is out, none count)
    if (this.holding) for (const f of this.friends) f.windows.forEach(([, b], k) => {
      const key = `${f.id}:${k}`;
      if (!this.lost[key] && this.t >= b) { this.lost[key] = true; this.missed++; this.events.push({ kind: 'missed', id: f.id }); }
    });
    for (const d of this.drones) {
      if (d.phase !== 'free' || d.gone || d.passed) continue;
      const dist = Math.hypot(d.x - this.x, d.z - this.z);
      d.minD = Math.min(d.minD, dist);
      if (dist < r.drones.hit) { this.result = { kind: 'hit', by: d.id, t: this.t }; return; }
    }
    if (this.toss && this.t >= this.toss.arrive) {
      const { kind, target, release } = this.toss;
      this.result = { kind, target, t: this.t, release };
    }
  }

  private fly(d: Drone, dt: number) {
    const P = this.g.r.protection;
    if (d.gone) return;
    if (d.phase === 'pre') {
      if (d.freeT === Infinity) { d.phase = 'drop'; this.events.push({ kind: 'drop', id: d.id }); }
      else if (this.t < d.delay) return; // a delayed blitzer waits a beat
      else if (d.blocker) d.phase = 'engage';
      else { d.phase = 'free'; this.release(d); }
    }
    if (d.phase === 'drop') {
      // a threat that drops out: back into coverage, up and away
      d.z += 4 * dt; d.h += 1.5 * dt;
      if (d.h > 4) d.gone = true;
      return;
    }
    if (d.phase === 'engage' || d.phase === 'held') {
      // to its blocker, then held in his beam (straining near the end) until it breaks free
      const p = this.blockerAt(d.blocker!), ex = p.x - d.x, ez = p.z + 0.7 - d.z, e = Math.hypot(ex, ez);
      if (e > 0.05) { const v = Math.min(e, 9 * dt); d.x += (ex / e) * v; d.z += (ez / e) * v; }
      else if (d.phase === 'engage') { d.phase = 'held'; if (d.blocker === 'RB') this.events.push({ kind: 'pickup', id: d.id }); }
      if (this.t + dt >= d.freeT - P.strain && this.t < d.freeT - P.strain) this.events.push({ kind: 'strain', id: d.id });
      if (this.t + dt >= d.freeT) { d.phase = 'free'; this.release(d); }
      return;
    }
    if (d.passed) { d.x += d.dx * d.speed * dt; d.z += d.dz * d.speed * dt; if (Math.hypot(this.x - d.x, this.z - d.z) > 25) d.gone = true; return; }
    // free: an edge goes around him, an inside drone darts at him
    if (d.edge) this.edgeFly(d, dt);
    else this.dart(d, dt);
    if (d.committed && !d.passed) this.track(d);
  }

  private release(d: Drone) {
    const D = this.g.r.drones, u = rampAt(this.g, this.round.level);
    this.events.push({ kind: 'free', id: d.id });
    if (d.edge) {
      d.speed = atLevel(D.edge.speed, u); d.z0 = this.z; d.leg = 0;
      // an edge locks on as it breaks free: the go-around is the warning
      d.committed = true; d.commitT = this.t; d.perp0 = 0; this.events.push({ kind: 'commit', id: d.id });
    } else {
      d.speed = atLevel(d.blocker ? D.inside.speed : D.inside.free_speed, u);
      const h = Math.hypot(this.x - d.x, this.z - d.z) || 1;
      d.dx = (this.x - d.x) / h; d.dz = (this.z - d.z) / h;
    }
  }

  /** An inside drone: steer for where he will be, then lock on and fly straight (the moment to step off its line). */
  private dart(d: Drone, dt: number) {
    const D = this.g.r.drones;
    const rx = this.x - d.x, rz = this.z - d.z, dist = Math.hypot(rx, rz);
    if (!d.committed) {
      const tti = dist / d.speed;
      const ax = this.x + this.vx * tti - d.x, az = this.z + this.vz * tti - d.z, ah = Math.hypot(ax, az) || 1;
      if (tti <= d.commitIn) {
        d.dx = ax / ah; d.dz = az / ah; d.committed = true; d.commitT = this.t;
        d.perp0 = Math.abs(rx * d.dz - rz * d.dx);
        this.events.push({ kind: 'commit', id: d.id });
      } else {
        const want = Math.atan2(az, ax), cur = Math.atan2(d.dz, d.dx);
        let diff = want - cur; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
        const turn = clamp(diff, -D.inside.turn * dt, D.inside.turn * dt);
        d.dx = Math.cos(cur + turn); d.dz = Math.sin(cur + turn);
      }
    }
    d.x += d.dx * d.speed * dt; d.z += d.dz * d.speed * dt;
    if (d.committed && rx * d.dx + rz * d.dz < 0) this.pass(d);
  }

  /**
   * An edge: it goes around him, out wide on its side, then in behind him to the depth he stood at when it broke free,
   * chasing him sideways and back. It cannot turn up into the pocket: if he has stepped up past that depth it runs on
   * behind him (overruns).
   */
  private edgeFly(d: Drone, dt: number) {
    const E = this.g.r.drones.edge, s = d.side;
    const target = d.leg === 0 ? { x: this.x + s * E.wide, z: d.z0 + 0.3 }
      : d.leg === 1 ? { x: this.x + s * E.wide * 0.6, z: d.z0 - E.behind }
      : { x: this.x, z: Math.min(this.z, d.z0) };
    const ex = target.x - d.x, ez = target.z - d.z, e = Math.hypot(ex, ez);
    if (e > 1e-6) { d.dx = ex / e; d.dz = ez / e; }
    const v = Math.min(e, d.speed * dt);
    d.x += d.dx * v; d.z += d.dz * v;
    if (d.leg < 2 && e < 0.35) d.leg++;
    else if (d.leg === 2 && e < 0.12) this.pass(d); // at its spot and not on him: it overruns behind him
  }

  /** Clear of a locked-on drone: off an inside drone's line, or up past an edge's depth. */
  private track(d: Drone) {
    const hit = this.g.r.drones.hit;
    const off = d.edge ? this.z - d.z0 : Math.abs((this.x - d.x) * d.dz - (this.z - d.z) * d.dx);
    if (d.clearT == null && off >= hit) d.clearT = this.t;
    if (off < hit) d.clearT = null;
  }

  private pass(d: Drone) {
    const r = this.g.r;
    d.passed = true;
    if (d.edge) { d.dx = d.side * -0.6; d.dz = -0.8; }
    if (this.result) return;
    if (d.minD < r.drones.near) { d.near = true; this.nearMisses++; this.events.push({ kind: 'near', id: d.id }); }
    if (d.perp0 < r.drones.hit && d.clearT != null && this.t - d.clearT <= r.scoring.clutch.window) {
      d.clutch = true; this.clutches++; this.events.push({ kind: 'clutch', id: d.id, margin: this.t - d.clearT });
    }
  }
}

const DIRS = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }] as const;
type Dir = (typeof DIRS)[number];
/** The drones that can still get him (free and not past him). */
export const live = (s: RoundSim) => s.drones.filter((d) => d.phase === 'free' && !d.passed && !d.gone);

/**
 * The right play. When a drone breaks free or locks on (after `react`, a person's reaction), it looks ahead: it tries
 * combos of up to three taps (a tap every `tap_gap` seconds) on a copy of the play and keeps the shortest that gets him
 * through, with the most room. `moves: 'lateral'` tries only sideways (to check an edge really needs a step up). It
 * tosses to the first friend whose lantern is lit at release.
 */
export function idealPolicy(g: Game, how: { react?: number; moves?: 'all' | 'lateral' } = {}): (s: RoundSim) => Input & { action?: Action } {
  const react = how.react ?? 0, r = g.r, gap = r.courier.tap_gap;
  const dirs: readonly Dir[] = how.moves === 'lateral' ? DIRS.slice(0, 2) : DIRS;
  let plan: { at: number; tap: Dir }[] = [], seen = new Set<string>(), t0 = Infinity;
  const trial = (s: RoundSim, combo: Dir[]) => {
    const c = s.clone(), end = c.t + 2.2;
    let k = 0, next = c.t, worst = Infinity;
    while (!c.result && c.t < end) {
      const tap = k < combo.length && c.t >= next - 1e-9 ? combo[k++] : undefined;
      if (tap) next = c.t + gap;
      c.step(tap ? { tap } : {});
      for (const d of live(c)) worst = Math.min(worst, Math.hypot(d.x - c.x, d.z - c.z));
      if (c.drones.every((d) => d.passed || d.gone || d.phase === 'drop' || (d.phase !== 'free' && d.freeT > end))) break;
    }
    return { ok: c.result?.kind !== 'hit', room: worst };
  };
  const replan = (s: RoundSim) => {
    let best: { combo: Dir[]; room: number } | null = null, fallback: { combo: Dir[]; room: number } | null = null;
    let level: Dir[][] = [[]];
    for (let n = 0; n <= 3 && !best; n++) {
      if (n > 0) level = level.flatMap((prev) => dirs.map((d) => [...prev, d]));
      for (const combo of level) {
        const res = trial(s, combo);
        if (res.ok && (!best || res.room > best.room)) best = { combo, room: res.room };
        if (!fallback || res.room > fallback.room) fallback = { combo, room: res.room };
      }
    }
    const pick = best ?? fallback!;
    plan = pick.combo.map((tap, k) => ({ at: s.t + k * gap, tap }));
  };
  return (s) => {
    if (s.t < t0) { plan = []; seen = new Set(); }
    t0 = s.t;
    // a drone he has seen break free or lock on (after his reaction): plan again with it in mind
    const fresh = s.drones.filter((d) => d.committed && !d.passed && !d.gone && !seen.has(d.id) && s.t - d.commitT! >= react - 1e-9);
    if (fresh.length) { for (const d of fresh) seen.add(d.id); replan(s); }
    let tap: Input['tap'];
    if (plan.length && plan[0]!.at <= s.t + 1e-9) tap = plan.shift()!.tap;
    let action: Action | undefined;
    if (s.holding) {
      const f = s.friends.find((ff) => isLit(g, ff, s.t + r.toss.release));
      if (f) action = { kind: 'toss', target: f.id };
    }
    return { ...(tap ? { tap } : {}), ...(action ? { action } : {}) };
  };
}
/** The right pre-snap call: keep the RB in on the threat showing a tell, else send him out. */
export const idealRb = (round: Round) => round.threats.find((t) => t.tell)?.id ?? null;

/** Play one round with a controller to its end (or a time limit). */
export function runRound(g: Game, round: Round, policy: (s: RoundSim) => Input & { action?: Action }, rb: string | null = null, limit = 20): RoundSim {
  const s = new RoundSim(g, round, rb);
  while (!s.result && s.t < limit) {
    const u = policy(s);
    if (u.action) s.act(u.action);
    s.step(u);
  }
  return s;
}

/** Why a drafted play fails the invariants (empty: it is fair): whatever he calls for the RB, a person who reacts a
 * beat late and taps a short combo gets through and gets the ball out. */
export function roundProblems(g: Game, round: Round): string[] {
  const p: string[] = [];
  for (const rb of [null, ...round.threats.map((t) => t.id)]) {
    const s = runRound(g, round, idealPolicy(g, { react: g.r.drones.react }), rb);
    if (s.result?.kind !== 'catch') p.push(`with the RB ${rb ? `on ${rb}` : 'out'}, reacting a beat late does not complete it (${s.result?.kind ?? 'no result'})`);
  }
  return p;
}
/** Deal a fair play: drafts until one passes the invariants (deterministic: the k-th draft uses seed + k). */
export function makeRound(g: Game, level: number, seed: number): Round {
  for (let k = 0; k < 60; k++) {
    const round = draftRound(g, level, (seed + k * 7919) >>> 0);
    if (!roundProblems(g, round).length) return round;
  }
  throw new Error(`no fair play at level ${level} from seed ${seed}`);
}

/** The glossary terms the game names plays with (checked by npm run validate). */
export const PLAY_TERMS = ['blitz-pickup', 'check-release'] as const;
/** What the play is: the box and how many of it rush. */
export function playKind(sim: RoundSim): { term: string | null; name: string } {
  const rushing = sim.drones.filter((d) => d.freeT !== Infinity).length, box = sim.round.box;
  return { term: null, name: `${box} box · ${rushing} rushing` };
}

// ------------------------------------------------------------------ a run: play after play until a hit or a snatch
export interface Log { round: Round; rb: string | null; result: Result; points: number; missed: number; near: number; drones: Drone[]; pressT: number | null }
export type RunPhase = 'pre' | 'live' | 'result' | 'jump' | 'over';
export class Run {
  phase: RunPhase = 'pre';
  phaseT = 0;
  clock = 0;
  score = 0;
  streak = 0;
  level: number;
  rounds = 0;
  deliveries = 0;
  nearMisses = 0;
  clutches = 0;
  missed = 0;
  pickups = 0;
  log: Log[] = [];
  /** score at each whole second of the run, for the best-run ghost */
  timeline: number[] = [0];
  round: Round;
  sim: RoundSim;
  /** the RB call for this play */
  rb: string | null = null;
  /** points from the last scoring moment, for the HUD pop */
  pop: { points: number; label: string; at: number } | null = null;
  constructor(readonly g: Game, readonly seed: number, readonly startLevel = 1) {
    this.level = startLevel;
    this.round = makeRound(g, this.level, this.seedFor(0));
    this.sim = new RoundSim(g, this.round, null);
  }
  private seedFor(i: number) { return (Math.imul(this.seed ^ 0x9e3779b9, 2654435761) + i * 104729) >>> 0; }
  get multiplier() { return Math.min(this.g.r.scoring.streak_cap, 1 + this.streak * this.g.r.scoring.streak_step); }
  /** Before the snap: keep the RB in on a threat (its id), or send him out (null). */
  callRb(id: string | null) { if (this.phase === 'pre') this.rb = id && this.round.threats.some((t) => t.id === id) ? id : null; }
  /** GO: the snap. */
  snap() { if (this.phase !== 'pre') return; this.sim = new RoundSim(this.g, this.round, this.rb); this.phase = 'live'; this.phaseT = 0; }
  act(a: Action) { if (this.phase === 'live') this.sim.act(a); }
  step(u: Input) {
    if (this.phase === 'over') return;
    const r = this.g.r, sc = r.scoring;
    this.clock += STEP;
    if (this.phase === 'pre') return;
    if (Math.floor(this.clock) > this.timeline.length - 1) this.timeline.push(this.score);
    if (this.phase === 'live') {
      const s = this.sim;
      s.step(u);
      for (const e of s.events) {
        if (e.kind === 'near') this.add(sc.near_miss * this.multiplier, 'NEAR MISS');
        if (e.kind === 'pickup') { this.pickups++; this.add(sc.pickup, 'PICKED UP!'); }
        // the later he got clear, the bigger the bonus
        if (e.kind === 'clutch') this.add(sc.clutch.points * (1 - 0.5 * (e.margin / sc.clutch.window)) * this.multiplier, e.margin <= sc.clutch.window / 2 ? 'LAST SECOND!' : 'CLOSE CALL');
        if (e.kind === 'missed') { this.missed++; this.add(-sc.missed, 'MISSED HIM'); }
      }
      if (!s.result) return;
      const res = s.result;
      let points = 0;
      if (res.kind === 'catch') {
        this.streak++;
        this.deliveries++;
        points = (sc.delivery + sc.quick * Math.max(0, sc.quick_until - res.release)) * this.multiplier;
        this.add(points, this.streak > 1 ? `STREAK ×${this.multiplier.toFixed(2).replace(/\.?0+$/, '')}` : 'DELIVERED');
      } else if (res.kind === 'drop') this.streak = 0;
      this.nearMisses += s.nearMisses;
      this.clutches += s.clutches;
      this.log.push({ round: this.round, rb: this.rb, result: res, points, missed: s.missed, near: s.nearMisses, drones: s.drones, pressT: s.toss?.press ?? null });
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
      this.round = makeRound(this.g, this.level, this.seedFor(this.rounds));
      this.rb = null;
      this.sim = new RoundSim(this.g, this.round, null);
      this.phase = 'pre'; this.phaseT = 0;
    }
  }
  private add(points: number, label: string) {
    this.score = Math.max(0, this.score + Math.round(points));
    this.pop = { points: Math.round(points), label, at: this.clock };
  }
}

/** The run report: what he did, and what to work on. */
export function report(run: Run) {
  const drones = run.log.flatMap((l) => l.drones.filter((d) => d.committed));
  const dodged = drones.filter((d) => d.passed).length;
  const edges = drones.filter((d) => d.edge && d.passed).length;
  const bySide = { throwing: { lit: 0, caught: 0 }, off: { lit: 0, caught: 0 } };
  let reads = 0, right = 0;
  for (const l of run.log) {
    for (const f of l.round.friends) if (f.windows.length) bySide[f.side].lit++;
    const res = l.result;
    if (res.kind === 'catch') { const f = l.round.friends.find((x) => x.id === res.target); if (f) bySide[f.side].caught++; }
    if (l.round.threats.length) {
      reads++;
      const blitzers = l.round.threats.filter((t) => t.blitz);
      if ((l.rb && blitzers.some((t) => t.id === l.rb)) || (!l.rb && !blitzers.length)) right++;
    }
  }
  const last = run.log.at(-1);
  const by = last?.result.kind === 'hit' ? last.drones.find((d) => d.id === (last.result as { by: string }).by) : undefined;
  return {
    score: run.score, rounds: run.rounds, deliveries: run.deliveries, nearMisses: run.nearMisses, clutches: run.clutches, missed: run.missed,
    pickups: run.pickups, level: run.level, dodged, edges, bySide, reads, readsRight: right,
    end: last?.result.kind ?? null, endBy: by ? (by.edge ? 'edge' : by.blocker ? 'inside' : 'free') : null,
  };
}

/** The looks he has earned with his best score. */
export function unlocked(g: Game, best: number) {
  return { jackets: g.r.unlocks.jackets.filter((u) => best >= u.at), trails: g.r.unlocks.trails.filter((u) => best >= u.at) };
}

/** Invariant sweep for validation: every play at every level is fair, whatever the RB call. */
export function sweepRooftop(g: Game, perLevel = 12): { rounds: number; byBox: Record<string, number>; failures: string[] } {
  const failures = checkRules(g.r), byRush: Record<string, number> = {};
  // plays by box
  let rounds = 0;
  for (let level = 1; level <= g.r.ramp.levels; level++) {
    for (let i = 0; i < perLevel; i++) {
      try {
        const round = makeRound(g, level, 1000 * level + i);
        byRush[round.box] = (byRush[round.box] ?? 0) + 1;
        rounds++;
      } catch (err) { failures.push(String((err as Error).message)); }
    }
  }
  return { rounds, byBox: byRush, failures };
}
