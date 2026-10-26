import type { BallSpot } from '../field/geometry';
import type { PlayContent } from '../play/content';
import { lineOf } from '../play/defense';
import { receiversOnSide, type Sign } from '../play/offense';
import { buildPlay, type Play, type PlayCall } from '../play';

/** Seeded random numbers (mulberry32): the same seed gives the same workout (CLAUDE.md engine rules). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Tier = 'youth' | 'jv';

/**
 * Review gate (CLAUDE.md): drills use only content the owner has signed off. With `playtest` on (a parent setting),
 * unreviewed content is allowed and every rep says so.
 */
export function callReviewed(c: PlayContent, call: PlayCall): boolean {
  const all = [
    c.formations.formations.find((f) => f.id === call.formation),
    c.motions.motions.find((m) => m.id === call.motion),
    c.concepts.concepts.find((x) => x.id === call.concept),
    c.protections.protections.find((p) => p.id === call.protection),
    c.fronts.fronts.find((f) => f.id === call.front),
    c.coverages.coverages.find((x) => x.id === call.coverage),
  ];
  const files = [
    c.formations.alignment, c.formations.drops, c.fronts.alignment, c.fronts.rush, c.coverages.shells, c.coverages.alignments, c.coverages.man,
    c.coverages.zone_reaction, c.speeds, c.drills, c.adjustments, c.quarterback,
  ];
  return [...all, ...files].every((e) => e?.reviewed === true);
}

const posAt = (play: Play, id: string, t: number) => {
  const tr = play.sim.tracks.find((x) => x.id === id)!;
  const f = Math.min(play.sim.steps, Math.max(0, (t - play.sim.tStart) / play.sim.dt));
  const k = Math.floor(f);
  const k2 = Math.min(play.sim.steps, k + 1);
  const u = f - k;
  return { x: tr.xs[k]! + (tr.xs[k2]! - tr.xs[k]!) * u, y: tr.ys[k]! + (tr.ys[k2]! - tr.ys[k]!) * u };
};
export { posAt };

// ------------------------------------------------------------------ the rep
export type CornerLook = 'press' | 'off-inside' | 'off-outside' | 'off-head-up';
export interface Fault { id: string; kind: 'off-the-line' | 'covered'; y: number }

/** What his pre-snap routine should find (content/tuning/drills.yaml routine). */
export interface RoutineKey {
  /** the receiver lined up wrong, or 'ok' */
  alignment: string;
  shell: string;
  box: number;
  /** corners from his left to his right */
  corners: { role: string; side: 'left' | 'right'; look: CornerLook }[];
  /** what the tells give away: none, blitz-tell or rotation-tell */
  tells: string;
  /** more rushers than blockers, and the receivers on quick (hot) routes */
  threats: { more: boolean; hot: string[] };
  /** his key defender (null: no defender has that job, as in man coverage) and his first look */
  key: string | null;
  firstLook: string;
  drop: string;
  escape: 'left' | 'right';
}

export interface Option { id: string; route: string; separation: number; catchT: number; open: boolean }
/** After the snap: the coverage he names and what he does with the ball at the freeze. */
export interface PostKey {
  coverage: string;
  /** a receiver letter, 'run' or 'throw-away' */
  decision: string;
  options: Option[];
}

export interface Rep {
  index: number;
  call: PlayCall;
  play: Play;
  reviewed: boolean;
  fault: Fault | null;
  routine: RoutineKey;
  post: PostKey;
  /** seconds he has at the line, and when the play freezes after the snap */
  clock: number;
  decision: number;
}

/** Pick the next legitimate play for a tier, deterministically from the seed. */
export function makeRep(c: PlayContent, tier: Tier, seed: number, index: number, playtest: boolean): Rep | null {
  const R = c.drills.routine;
  const t = R.tiers[tier];
  const r = rng(seed * 7919 + index * 104729 + 17);
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)]!;
  const spots: BallSpot[] = ['left_hash', 'middle', 'right_hash'];
  for (let attempt = 0; attempt < 400; attempt++) {
    const coverageId = pick(t.coverages);
    const coverage = c.coverages.coverages.find((x) => x.id === coverageId)!;
    const fronts = t.fronts.filter((f) => coverage.fronts[f]);
    if (!fronts.length) continue;
    const call: PlayCall = {
      formation: pick(c.formations.formations).id,
      strength: r() < 0.5 ? 'right' : 'left',
      motion: pick(t.motions),
      concept: pick(c.concepts.concepts).id,
      protection: pick(c.protections.protections).id,
      front: pick(fronts),
      coverage: coverage.id,
      spot: pick(spots),
    };
    const reviewed = callReviewed(c, call);
    if (!reviewed && !playtest) continue;
    const built = buildPlay(c, call);
    if (!built.ok || built.value.checks.some((ch) => !ch.ok)) continue;
    const play = built.value;
    const fault = r() < R.faults.rate ? makeFault(c, play, r) : null;
    return { index, call, play, reviewed, fault, routine: routineKey(c, play, fault), post: postKey(c, play, R.decision), clock: t.clock, decision: R.decision };
  }
  return null;
}

/** One receiver lines up wrong (content/tuning/drills.yaml faults); he must catch it in the Know step. */
function makeFault(c: PlayContent, play: Play, r: () => number): Fault | null {
  const lineY = -c.formations.alignment.line.depth;
  const step = c.drills.routine.faults.step;
  const kinds: Fault[] = [];
  for (const s of [-1, 1] as Sign[]) {
    const rec = receiversOnSide(play.offense.players, s);
    const end = rec.find((p) => p.onLine && p.align === 'wide');
    if (end) kinds.push({ id: end.id, kind: 'off-the-line', y: lineY - step });
    const slot = rec.find((p) => !p.onLine && (p.align === 'slot' || p.align === 'inside-slot'));
    if (end && slot) kinds.push({ id: slot.id, kind: 'covered', y: lineY });
  }
  return kinds.length ? kinds[Math.floor(r() * kinds.length)]! : null;
}

export function routineKey(c: PlayContent, play: Play, fault: Fault | null): RoutineKey {
  const R = c.drills.routine;
  const at = (id: string) => posAt(play, id, -play.sim.dt / 2);
  const view = play.offense.players.map((p) => ({ ...p, pos: at(p.id) }));
  // corners against #1 on their side
  const corners = play.defense.players
    .filter((d) => d.role.startsWith('cb'))
    .map((d) => {
      const q = at(d.role);
      const s = (Math.sign(q.x) || d.sign) as Sign;
      const n1 = receiversOnSide(view, s)[0];
      const dx = n1 ? (q.x - n1.pos.x) * s : 0;
      const depth = n1 ? q.y - n1.pos.y : q.y;
      const look: CornerLook = depth <= R.corners.press_within ? 'press' : dx > R.corners.head_up_within ? 'off-outside' : dx < -R.corners.head_up_within ? 'off-inside' : 'off-head-up';
      return { role: d.role, side: (s < 0 ? 'left' : 'right') as 'left' | 'right', look, x: q.x };
    })
    .sort((a, b) => a.x - b.x)
    .map(({ role, side, look }) => ({ role, side, look }));
  const tells = (play.defense.coverage.tells ?? []).find((tl) => tl.kind)?.kind ?? 'none';
  const concept = c.concepts.concepts.find((x) => x.id === play.call.concept)!;
  const firstLook = progression(c, play)[0] ?? play.sim.routes[0]!.id;
  // escape: toward his throwing hand, unless more edge threats show on that side
  const qb = c.quarterback;
  const hand: Sign = qb.throwing_hand === 'left' ? -1 : 1;
  const line = lineOf(c, view);
  const edge = (s: Sign) =>
    play.defense.players.filter((d) => {
      const q = at(d.role);
      return Math.sign(q.x) === s && Math.abs(q.x) > Math.abs(line.tackle(s)) + qb.escape.edge_threat.outside_tackle && q.y <= qb.escape.edge_threat.within_depth;
    }).length;
  const escapeSign: Sign = edge(hand) > edge(-hand as Sign) ? (-hand as Sign) : hand;
  return {
    alignment: fault ? fault.id : 'ok',
    shell: play.defense.coverage.shell.pre,
    box: play.analysis.boxCount,
    corners,
    tells,
    threats: { more: play.analysis.rushers > play.analysis.blockers, hot: play.sim.routes.filter((rt) => rt.quick).map((rt) => rt.id) },
    key: play.analysis.readDefenders[0] ?? null,
    firstLook,
    drop: qb.drops[concept.id]![play.offense.formation.qb],
    escape: escapeSign < 0 ? 'left' : 'right',
  };
}

/** His progression: the concept's read order (content/offense/concepts.yaml), then everyone else running a route. */
export function progression(c: PlayContent, play: Play): string[] {
  const concept = c.concepts.concepts.find((x) => x.id === play.call.concept)!;
  const out: string[] = [];
  for (const route of concept.read.progression) {
    const r = play.sim.routes.find((x) => x.route === route && !out.includes(x.id));
    if (r) out.push(r.id);
  }
  for (const r of play.sim.routes) if (!out.includes(r.id)) out.push(r.id);
  return out;
}

/** Ball flight from his release at time `release` to a moving receiver: when and where the catch happens. */
export function catchPoint(c: PlayContent, play: Play, id: string, release: number): { t: number; at: { x: number; y: number } } {
  const qb = posAt(play, 'QB', release);
  let t = release + 0.5;
  for (let i = 0; i < 6; i++) {
    const q = posAt(play, id, t);
    t = release + Math.hypot(q.x - qb.x, q.y - qb.y) / c.drills.ball.speed;
  }
  return { t, at: posAt(play, id, t) };
}

export function postKey(c: PlayContent, play: Play, decision: number): PostKey {
  const release = decision + c.drills.ball.release_delay;
  const defenders = play.defense.players.map((d) => d.role);
  const options: Option[] = progression(c, play).map((id) => {
    const cp = catchPoint(c, play, id, release);
    const separation = Math.min(...defenders.map((d) => { const q = posAt(play, d, cp.t); return Math.hypot(q.x - cp.at.x, q.y - cp.at.y); }));
    return { id, route: play.sim.routes.find((r) => r.id === id)!.route, separation, catchT: cp.t, open: separation >= c.drills.reads.open_separation };
  });
  const first = options.find((o) => o.open);
  let choice = first?.id;
  if (!choice) {
    // no one open: run if no free defender is within run_room yards in front of him, otherwise throw it away
    const qb = posAt(play, 'QB', decision);
    const blocked = new Set(play.sim.rushers.filter((r) => r.blocker).map((r) => r.role));
    const near = defenders.some((d) => { if (blocked.has(d)) return false; const q = posAt(play, d, decision); return q.y >= qb.y && Math.hypot(q.x - qb.x, q.y - qb.y) < c.drills.routine.decide.run_room; });
    choice = near ? 'throw-away' : 'run';
  }
  return { coverage: play.defense.coverage.answer, decision: choice, options };
}

/** Rebuild the play with his route changes; the post-snap answers follow the routes he actually called. */
export function withChanges(c: PlayContent, rep: Rep, overrides: Record<string, string>): Rep {
  if (!Object.keys(overrides).length) return rep;
  const call = { ...rep.call, overrides };
  const built = buildPlay(c, call);
  if (!built.ok) return rep;
  return { ...rep, call, play: built.value, post: postKey(c, built.value, rep.decision) };
}

/** Which menu of routes a receiver may change to (content/offense/adjustments.yaml). */
export function routeMenu(c: PlayContent, play: Play, id: string): string[] {
  const m = c.adjustments.menus;
  if (id === 'R' || id === 'F') return m.back;
  const spot = play.offense.formation.players[id as 'X'];
  if (spot?.align === 'attached') return m['tight-end'];
  if (spot?.align === 'wide') return m.wide;
  return m.slot;
}

// ------------------------------------------------------------------ grading and progress
export interface Answers {
  alignment: string | null;
  shell: string | null;
  box: number | null;
  corners: (CornerLook | null)[];
  tells: string | null;
  threats: { more: boolean | null; hot: string | null };
  changes: Record<string, string>;
  key: string | null;
  /** set once he answers the key step (his answer may be null: no one has that job) */
  keyAnswered?: boolean;
  firstLook: string | null;
  drop: string | null;
  escape: 'left' | 'right' | null;
  /** seconds he took at the line; null when the clock ran out */
  routineTime: number | null;
  coverage: string | null;
  decision: string | null;
}
export const emptyAnswers = (): Answers => ({
  alignment: null, shell: null, box: null, corners: [], tells: null, threats: { more: null, hot: null }, changes: {}, key: null, firstLook: null,
  drop: null, escape: null, routineTime: null, coverage: null, decision: null,
});

export interface Grade {
  steps: Record<string, boolean>;
  /** how much room his best option gained from his route changes (yards); 0 with no changes */
  adjustGain: number;
  decision: 'read' | 'open' | 'miss';
  xp: number;
}

export function grade(c: PlayContent, original: Rep, played: Rep, a: Answers): Grade {
  const p = c.drills.routine.points;
  const k = original.routine;
  const best = (r: Rep) => Math.max(...r.post.options.map((o) => o.separation));
  const changed = Object.keys(a.changes).length > 0;
  const adjustGain = changed ? best(played) - best(original) : 0;
  const steps: Record<string, boolean> = {
    alignment: a.alignment === k.alignment,
    shell: a.shell === k.shell,
    box: a.box === k.box,
    corners: k.corners.length > 0 && k.corners.every((cn, i) => a.corners[i] === cn.look),
    tells: a.tells === k.tells,
    threats: a.threats.more === k.threats.more && (!k.threats.more || (a.threats.hot !== null && k.threats.hot.includes(a.threats.hot))),
    adjust: !changed || adjustGain > 0.5,
    key: a.key === k.key && a.firstLook === k.firstLook,
    drop: a.drop === k.drop,
    escape: a.escape === k.escape,
    coverage: a.coverage === played.post.coverage,
  };
  const pick = played.post.options.find((o) => o.id === a.decision);
  const decision: Grade['decision'] = a.decision === played.post.decision ? 'read' : pick?.open ? 'open' : 'miss';
  let xp = 0;
  for (const [step, ok] of Object.entries(steps)) if (ok) xp += p[step as keyof typeof p];
  xp += decision === 'read' ? p.decision : decision === 'open' ? c.drills.scoring.open_not_read : 0;
  if (a.routineTime !== null) xp += p.beat_the_clock;
  return { steps, adjustGain, decision, xp };
}

export interface Progress {
  xp: number;
  streak: number;
  lastDay: string | null;
  reps: number;
  /** per routine step and per coverage: [correct, reps] */
  steps: Record<string, [number, number]>;
  coverages: Record<string, [number, number]>;
  tier: Tier;
  playtest: boolean;
}

export const newProgress = (): Progress => ({ xp: 0, streak: 0, lastDay: null, reps: 0, steps: {}, coverages: {}, tier: 'youth', playtest: false });

export function rank(c: PlayContent, xp: number): { name: string; next: number | null; floor: number } {
  const ladder = c.drills.ranks;
  let i = 0;
  while (i + 1 < ladder.length && xp >= ladder[i + 1]![0]) i++;
  return { name: ladder[i]![1], floor: ladder[i]![0], next: ladder[i + 1]?.[0] ?? null };
}

export function recordRep(p: Progress, call: PlayCall, g: Grade): Progress {
  const bump = (m: Record<string, [number, number]>, k: string, ok: boolean) => {
    const cur = m[k] ?? [0, 0];
    return { ...m, [k]: [cur[0] + (ok ? 1 : 0), cur[1] + 1] as [number, number] };
  };
  let steps = p.steps;
  for (const [k, ok] of Object.entries(g.steps)) steps = bump(steps, k, ok);
  steps = bump(steps, 'decision', g.decision === 'read');
  return { ...p, xp: p.xp + g.xp, reps: p.reps + 1, steps, coverages: bump(p.coverages, call.coverage, g.steps.coverage === true) };
}

export function finishWorkout(c: PlayContent, p: Progress, day: string): Progress {
  if (p.lastDay === day) return { ...p, xp: p.xp + c.drills.scoring.workout_bonus };
  const prev = new Date(day + 'T12:00:00');
  prev.setDate(prev.getDate() - 1);
  const y = prev.toISOString().slice(0, 10);
  return { ...p, xp: p.xp + c.drills.scoring.workout_bonus, streak: p.lastDay === y ? p.streak + 1 : 1, lastDay: day };
}
