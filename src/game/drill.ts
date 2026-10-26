import type { BallSpot } from '../field/geometry';
import type { PlayContent } from '../play/content';
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
 * unreviewed plays are allowed and every rep says so.
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
  const files = [c.formations.alignment, c.formations.drops, c.fronts.alignment, c.fronts.rush, c.coverages.shells, c.coverages.alignments, c.coverages.man, c.coverages.zone_reaction, c.speeds, c.drills];
  return [...all, ...files].every((e) => e?.reviewed === true);
}

export interface Rep {
  index: number;
  call: PlayCall;
  play: Play;
  key: AnswerKey;
  /** seconds: where the rep starts (before the snap) and where it freezes for his answers */
  start: number;
  decision: number;
  reviewed: boolean;
}

/** Pick the next legitimate play for a tier, deterministically from the seed. */
export function makeRep(c: PlayContent, tier: Tier, seed: number, index: number, playtest: boolean): Rep | null {
  const t = c.drills.shell_game.tiers[tier];
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
    const decision = t.decision;
    const motionLead = play.plan ? -play.plan.start + 0.6 : 0;
    const tells = (coverage.tells ?? []).map((tl) => tl.start + 0.4);
    const start = -Math.min(-play.sim.tStart, Math.max(t.look, motionLead, ...tells));
    return { index, call, play, key: answerKey(c, play, decision), start, decision, reviewed };
  }
  return null;
}

// ------------------------------------------------------------------ the answer key
export interface Option { id: string; route: string; separation: number; catchT: number; open: boolean }
export interface AnswerKey {
  shell: string;
  coverage: string;
  /** where the ball goes: the first open receiver in his progression, or the one with the most room */
  throwTo: string;
  /** every receiver he could throw to, in progression order */
  options: Option[];
  /** the defender he reads (the concept's key) */
  readDefender: string | null;
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

export function answerKey(c: PlayContent, play: Play, decision: number): AnswerKey {
  const coverage = play.defense.coverage;
  const concept = c.concepts.concepts.find((x) => x.id === play.call.concept)!;
  const release = decision + c.drills.ball.release_delay;
  const defenders = play.defense.players.map((d) => d.role);
  const runners = play.sim.routes.map((r) => r.id);
  // his progression first (content/offense/concepts.yaml read.progression), then everyone else
  const ordered: string[] = [];
  for (const route of concept.read.progression) {
    const r = play.sim.routes.find((x) => x.route === route && !ordered.includes(x.id));
    if (r) ordered.push(r.id);
  }
  for (const id of runners) if (!ordered.includes(id)) ordered.push(id);
  const options: Option[] = ordered.map((id) => {
    const cp = catchPoint(c, play, id, release);
    const separation = Math.min(...defenders.map((d) => { const q = posAt(play, d, cp.t); return Math.hypot(q.x - cp.at.x, q.y - cp.at.y); }));
    return { id, route: play.sim.routes.find((r) => r.id === id)!.route, separation, catchT: cp.t, open: separation >= c.drills.reads.open_separation };
  });
  const first = options.find((o) => o.open) ?? [...options].sort((a, b) => b.separation - a.separation)[0]!;
  return {
    shell: coverage.shell.pre,
    coverage: coverage.answer,
    throwTo: first.id,
    options,
    readDefender: play.analysis.readDefenders[0] ?? null,
  };
}

// ------------------------------------------------------------------ grading and progress
export interface Answers { shell: string | null; coverage: string | null; throwTo: string | null }
export interface Grade { shell: boolean; coverage: boolean; throw: 'read' | 'open' | 'miss'; xp: number }

export function grade(c: PlayContent, key: AnswerKey, a: Answers): Grade {
  const s = c.drills.scoring;
  const shell = a.shell === key.shell;
  const coverage = a.coverage === key.coverage;
  const thrown = key.options.find((o) => o.id === a.throwTo);
  const th: Grade['throw'] = a.throwTo === key.throwTo ? 'read' : thrown?.open ? 'open' : 'miss';
  const xp = (shell ? s.shell : 0) + (coverage ? s.coverage : 0) + (th === 'read' ? s.throw : th === 'open' ? s.open_not_read : 0);
  return { shell, coverage, throw: th, xp };
}

export interface Progress {
  xp: number;
  streak: number;
  lastDay: string | null;
  reps: number;
  /** per concept and per coverage: [correct reads, reps] */
  concepts: Record<string, [number, number]>;
  coverages: Record<string, [number, number]>;
  tier: Tier;
  playtest: boolean;
}

export const newProgress = (): Progress => ({ xp: 0, streak: 0, lastDay: null, reps: 0, concepts: {}, coverages: {}, tier: 'youth', playtest: false });

export function rank(c: PlayContent, xp: number): { name: string; next: number | null; floor: number } {
  const ladder = c.drills.ranks;
  let i = 0;
  while (i + 1 < ladder.length && xp >= ladder[i + 1]![0]) i++;
  return { name: ladder[i]![1], floor: ladder[i]![0], next: ladder[i + 1]?.[0] ?? null };
}

/** Record a rep. `day` is the local date (YYYY-MM-DD); the streak counts days with a finished workout. */
export function recordRep(p: Progress, call: PlayCall, g: Grade): Progress {
  const bump = (m: Record<string, [number, number]>, k: string, ok: boolean) => {
    const cur = m[k] ?? [0, 0];
    return { ...m, [k]: [cur[0] + (ok ? 1 : 0), cur[1] + 1] as [number, number] };
  };
  return { ...p, xp: p.xp + g.xp, reps: p.reps + 1, concepts: bump(p.concepts, call.concept, g.throw === 'read'), coverages: bump(p.coverages, call.coverage, g.coverage) };
}

export function finishWorkout(c: PlayContent, p: Progress, day: string): Progress {
  if (p.lastDay === day) return { ...p, xp: p.xp + c.drills.scoring.workout_bonus };
  const prev = new Date(day + 'T12:00:00');
  prev.setDate(prev.getDate() - 1);
  const y = prev.toISOString().slice(0, 10);
  return { ...p, xp: p.xp + c.drills.scoring.workout_bonus, streak: p.lastDay === y ? p.streak + 1 : 1, lastDay: day };
}
