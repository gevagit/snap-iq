import type { BallSpot } from '../field/geometry';
import { fieldFrame } from '../field/geometry';
import { type PlayContent, byId } from './content';
import { type DefenseSetup, setupDefense } from './defense';
import { type Fit, type MotionPlan, type Offense, type OffenseJobs, type Sign, alignOffense, assignRoutes, planMotion } from './offense';
import { type Simulation, simulate } from './simulate';
import { type Check, runChecks } from './checks';

export type { Check } from './checks';
export type { Simulation, Track } from './simulate';

/** One play: an offensive call against a defensive call, at a ball spot. Same call => same play. */
export interface PlayCall {
  formation: string;
  /** the side the formation's strength is set to */
  strength: 'left' | 'right';
  motion: string;
  concept: string;
  protection: string;
  front: string;
  coverage: string;
  spot: BallSpot;
}

export interface Play {
  call: PlayCall;
  offense: Offense;
  plan: MotionPlan | null;
  jobs: OffenseJobs;
  defense: DefenseSetup;
  sim: Simulation;
  checks: Check[];
  analysis: Analysis;
}

export interface Analysis {
  offenseStrength: 'left' | 'right';
  defenseStrength: 'left' | 'right';
  fieldSide: 'left' | 'right' | null;
  shellPre: string;
  shellPost: string;
  rotation: string | null;
  boxCount: number;
  rushers: number;
  blockers: number;
  freeRushers: string[];
  hot: string[];
  motionResponse: 'travel' | 'bump' | null;
  readKey: string;
  readDefenders: string[];
  tier: 'youth' | 'jv';
}

export const DEFAULT_DT = 1 / 30;

export function buildPlay(c: PlayContent, call: PlayCall, dt = DEFAULT_DT): Fit<Play> {
  const formation = byId(c.formations.formations, call.formation, 'formation');
  const motion = byId(c.motions.motions, call.motion, 'motion');
  const concept = byId(c.concepts.concepts, call.concept, 'concept');
  const protection = byId(c.protections.protections, call.protection, 'protection');
  const front = byId(c.fronts.fronts, call.front, 'front');
  const coverage = byId(c.coverages.coverages, call.coverage, 'coverage');
  const strongSign: Sign = call.strength === 'right' ? 1 : -1;
  const offense = alignOffense(c, formation, strongSign, fieldFrame(c.geometry, call.spot));
  const plan = planMotion(c, offense, motion, protection);
  if (!plan.ok) return plan;
  const jobs = assignRoutes(c, offense, plan.value, concept, protection);
  if (!jobs.ok) return jobs;
  const defense = setupDefense(c, offense, front, coverage);
  if (!defense.ok) return defense;
  // PRD §6.11: more rushers than blockers needs a hot answer, or the call is not a legitimate play
  const rushers = defense.value.players.filter((p) => p.job.kind === 'rush').length;
  const blockers = 5 + (jobs.value.checker ? 1 : 0) + jobs.value.blockers.length;
  const hot = jobs.value.routes.filter((r) => r.quick).map((r) => r.id);
  if (rushers > blockers && hot.length === 0)
    return { ok: false, reason: `${rushers} rushers against ${blockers} blockers and ${concept.name} has no hot route` };
  const sim = simulate(c, offense, plan.value, jobs.value, defense.value, dt);
  const play: Play = { call, offense, plan: plan.value, jobs: jobs.value, defense: defense.value, sim, checks: [], analysis: analyse(c, call, offense, plan.value, jobs.value, defense.value, sim) };
  play.checks = runChecks(c, play);
  return { ok: true, value: play };
}

function analyse(c: PlayContent, call: PlayCall, off: Offense, plan: MotionPlan | null, jobs: OffenseJobs, def: DefenseSetup, sim: Simulation): Analysis {
  const trackOf = new Map(sim.tracks.map((t) => [t.id, t]));
  const at = (id: string, k: number) => { const t = trackOf.get(id)!; return { x: t.xs[k]!, y: t.ys[k]! }; };
  const k0 = sim.snapIndex;
  const tackle = 2 * c.formations.alignment.line.split;
  const te = (s: number) => off.players.find((p) => p.align === 'attached' && p.side === s);
  const left = te(-1) ? te(-1)!.pos.x : -tackle;
  const right = te(1) ? te(1)!.pos.x : tackle;
  const boxLm = c.geometry.landmarks.find((l) => l.id === 'box')!;
  const out = boxLm.outside_end_man ?? 1;
  const depth = boxLm.depth ?? 6;
  const boxCount = def.players.filter((p) => { const v = at(p.role, k0); return v.x >= left - out && v.x <= right + out && v.y >= 0 && v.y <= depth; }).length;
  const read = byId(c.concepts.concepts, call.concept, 'concept').read;
  const readDefenders = def.players
    .filter((p) => {
      const j = p.job;
      const side = read.side === 'middle' ? null : read.side === 'strong' ? off.strongSign : -off.strongSign;
      const onSide = side === null || p.sign === side;
      switch (read.key) {
        case 'flat-defender': return (j.kind === 'zone' || j.kind === 'drop') && (j.zone === 'curl-flat' || j.zone === 'flat') && onSide;
        case 'cornerback': return p.role.startsWith('cb') && onSide;
        case 'free-safety': return (j.kind === 'zone' && c.coverages.zones[j.zone]?.deep === true && !p.role.startsWith('cb')) || p.role === 'fs';
        case 'linebacker': return p.group === 'lb' && j.kind !== 'rush';
        default: return false;
      }
    })
    .map((p) => p.role);
  const mover = plan?.mover;
  const responds = mover && def.players.some((p) => p.job.kind === 'man' && p.job.target === mover);
  return {
    offenseStrength: call.strength,
    defenseStrength: def.strengthSign > 0 ? 'right' : 'left',
    fieldSide: off.frame.fieldSide,
    shellPre: def.coverage.shell.pre,
    shellPost: def.coverage.shell.post,
    rotation: def.coverage.rotation ?? null,
    boxCount,
    rushers: sim.rushers.length,
    blockers: sim.blockers.length,
    freeRushers: sim.rushers.filter((r) => !r.blocker).map((r) => r.role),
    hot: sim.routes.filter((r) => r.quick).map((r) => r.id),
    motionResponse: plan ? (responds ? 'travel' : 'bump') : null,
    readKey: read.key,
    readDefenders,
    tier: def.front.tier === 'jv' || def.coverage.tier === 'jv' ? 'jv' : 'youth',
  };
}

/** Every call the content allows, strength right (left is the mirror; tests check the symmetry). */
export function allCalls(c: PlayContent, spots: BallSpot[] = ['left_hash', 'middle', 'right_hash'], strengths: ('left' | 'right')[] = ['right']): PlayCall[] {
  const calls: PlayCall[] = [];
  const defenses = c.coverages.coverages.flatMap((cv) => Object.keys(cv.fronts).map((front) => ({ front, coverage: cv.id })));
  for (const f of c.formations.formations)
    for (const strength of strengths)
      for (const m of c.motions.motions)
        for (const cn of c.concepts.concepts)
          for (const pr of c.protections.protections)
            for (const d of defenses)
              for (const spot of spots) calls.push({ formation: f.id, strength, motion: m.id, concept: cn.id, protection: pr.id, ...d, spot });
  return calls;
}
