import type { AlignName, Coverage, Front, FrontPlayer, Job, Lane, LbAlign, ManKey, Tech, Zone, ZonePlace } from '../content/playSchemas';
import { apex } from '../field/geometry';
import type { PlayContent } from './content';
import { type Vec, vec } from './movement';
import { type Fit, type Offense, type Sign, endManX, receiversOnSide } from './offense';

/** Offense positions at one moment, as the defense sees them. */
export interface OffView { id: string; align: string; side: number; backfield: boolean; pos: Vec }

export type DefJob =
  | { kind: 'zone'; zone: string; side: 'strong' | 'weak' | 'middle'; part: 'outside' | 'inside' | 'middle' }
  | { kind: 'man'; target: string }
  | { kind: 'hole' }
  | { kind: 'rush'; lane: Lane; tech?: Tech }
  | { kind: 'drop'; zone: string; side: 'strong' | 'weak' | 'middle'; part: 'outside' | 'inside' | 'middle' };

export interface DefPlayer {
  role: string;
  label: string;
  number: number;
  group: 'dl' | 'lb' | 'db';
  /** physical side (+ = offense's right) */
  sign: Sign;
  tech?: Tech;
  lbAlign?: LbAlign;
  align?: AlignName;
  job: DefJob;
}

export interface DefenseSetup {
  front: Front;
  coverage: Coverage;
  strengthSign: Sign;
  players: DefPlayer[];
}

const tight = (o: OffView[], s: Sign) => o.some((p) => p.align === 'attached' && p.side === s);

/** Defense strength call (content/defense/fronts.yaml), from the formation before any motion. */
export function strengthCall(c: PlayContent, off: Offense): Sign {
  const view = off.players;
  for (const rule of c.fronts.strength_call) {
    if (rule === 'tight-end') {
      const r = tight(view, 1);
      const l = tight(view, -1);
      if (r !== l) return r ? 1 : -1;
    } else if (rule === 'more-receivers') {
      const r = receiversOnSide(view, 1).length;
      const l = receiversOnSide(view, -1).length;
      if (r !== l) return r > l ? 1 : -1;
    } else if (rule === 'field') {
      if (off.frame.fieldSide) return off.frame.fieldSide === 'right' ? 1 : -1;
    } else if (rule === 'away-from-back') {
      const back = view.find((p) => p.backfield && p.id === 'R');
      if (back && Math.abs(back.pos.x) > 0.01) return back.pos.x > 0 ? -1 : 1;
    } else return 1;
  }
  return 1;
}

function pick<T>(spec: T | { 'tight-end': T; none: T }, hasTe: boolean): T {
  if (spec && typeof spec === 'object' && 'tight-end' in (spec as object)) {
    const s = spec as { 'tight-end': T; none: T };
    return hasTe ? s['tight-end'] : s.none;
  }
  return spec as T;
}

/** Defensive numbering (strong-1 ...) and the back, from the offense before the snap. */
export function manKeys(off: OffView[], strength: Sign): Map<ManKey, string> {
  const m = new Map<ManKey, string>();
  for (const [name, s] of [['strong', strength], ['weak', -strength as Sign]] as const)
    receiversOnSide(off, s).forEach((r, i) => i < 3 && m.set(`${name}-${i + 1}` as ManKey, r.id));
  const te = off.find((p) => p.align === 'attached' && p.side === strength) ?? off.find((p) => p.align === 'attached');
  if (te) m.set('tight-end', te.id);
  const back = off.find((p) => p.backfield && p.id === 'R');
  if (back) m.set('back', back.id);
  return m;
}

export function setupDefense(c: PlayContent, off: Offense, front: Front, coverage: Coverage): Fit<DefenseSetup> {
  const table = coverage.fronts[front.id];
  if (!table) return { ok: false, reason: `${coverage.name} is not set up for the ${front.name}` };
  const strength = strengthCall(c, off);
  const keys = manKeys(off.players, strength);
  const fieldSide = (off.frame.fieldSide ? (off.frame.fieldSide === 'right' ? 1 : -1) : strength) as Sign;
  /** the table entry for a role, looking through the field/boundary safety names */
  const alignFor = (role: string) => {
    if (table[role]) return table[role];
    if (role === 'ss' || role === 'fs') {
      const s = role === 'ss' ? strength : (-strength as Sign);
      return table[s === fieldSide ? 'safety-field' : 'safety-boundary'];
    }
    return undefined;
  };
  const taken = new Set<string>();
  let holeTaken = false;
  const players: DefPlayer[] = [];
  for (const fp of front.players) {
    const sign = (fp.side === 'strong' ? strength : -strength) as Sign;
    const hasTe = tight(off.players, sign);
    const entry = alignFor(fp.role);
    const base: Omit<DefPlayer, 'job'> = {
      role: fp.role, label: fp.label, number: fp.number, group: fp.group, sign,
      ...(fp.tech ? { tech: pick(fp.tech, hasTe) } : {}),
      ...(fp.align ? { lbAlign: pick(fp.align, hasTe) } : {}),
      ...(alignFor(fp.role)?.align ? { align: alignFor(fp.role)!.align! } : {}),
    };
    players.push({ ...base, job: entry ? { kind: 'rush', lane: 'bull' } : defaultJob(c, fp, base.tech) });
  }
  // jobs in the coverage table's order, so the first defender listed gets the first free key
  const fieldSign = (off.frame.fieldSide ? (off.frame.fieldSide === 'right' ? 1 : -1) : strength) as Sign;
  const safetyFor = (s: Sign) => (s === strength ? 'ss' : 'fs');
  for (const [key, entry] of Object.entries(table)) {
    const role = key === 'safety-field' ? safetyFor(fieldSign) : key === 'safety-boundary' ? safetyFor(-fieldSign as Sign) : key;
    const p = players.find((q) => q.role === role);
    if (!p) return { ok: false, reason: `${coverage.name}: ${role} is not in the ${front.name}` };
    const job = resolveJob(entry.job, keys, taken, () => {
      if (holeTaken) return false;
      holeTaken = true;
      return true;
    });
    if (!job) return { ok: false, reason: `${coverage.name}: ${role} has no man and no spare job` };
    p.job = job.kind === 'zone' && p.group === 'dl' ? { ...job, kind: 'drop' } : job;
  }
  return { ok: true, value: { front, coverage, strengthSign: strength, players } };
}

function defaultJob(c: PlayContent, fp: FrontPlayer, tech: Tech | undefined): DefJob {
  if (fp.group === 'dl' && tech) return { kind: 'rush', lane: c.fronts.rush_lanes[tech] ?? 'bull', tech };
  return { kind: 'rush', lane: 'a' };
}

function resolveJob(job: Job, keys: Map<ManKey, string>, taken: Set<string>, takeHole: () => boolean): DefJob | null {
  if ('zone' in job) return { kind: 'zone', zone: job.zone, side: job.side, part: job.part ?? (job.side === 'middle' ? 'middle' : 'outside') };
  if ('rush' in job) return { kind: 'rush', lane: job.rush };
  for (const k of job.man) {
    const id = keys.get(k);
    if (id && !taken.has(id)) {
      taken.add(id);
      return { kind: 'man', target: id };
    }
  }
  for (const s of job.spare ?? []) {
    if (s === 'hole' && takeHole()) return { kind: 'hole' };
    if (s === 'rush') return { kind: 'rush', lane: 'a' };
  }
  return null;
}

// ------------------------------------------------------------------ geometry helpers
export interface Line { center: number; guard: (s: Sign) => number; tackle: (s: Sign) => number; te: (s: Sign) => number | null; endMan: (s: Sign) => number }

export function lineOf(c: PlayContent, off: OffView[]): Line {
  const split = c.formations.alignment.line.split;
  const x = (id: string) => off.find((p) => p.id === id)!.pos.x;
  return {
    center: x('C'),
    guard: (s) => (s > 0 ? x('RG') : x('LG')),
    tackle: (s) => (s > 0 ? x('RT') : x('LT')),
    te: (s) => off.find((p) => p.align === 'attached' && p.side === s)?.pos.x ?? null,
    endMan: (s) => endManX(off, s, 2 * split),
  };
}

export function techX(c: PlayContent, line: Line, tech: Tech, s: Sign): number {
  const t = c.fronts.techniques[tech]!;
  const base = t.of === 'center' ? line.center : t.of === 'guard' ? line.guard(s) : t.of === 'tackle' ? line.tackle(s) : (line.te(s) ?? line.tackle(s));
  const off = c.fronts.alignment.shoulder;
  return base + (t.shoulder === 'head-up' ? 0 : t.shoulder === 'outside' ? s * off : -s * off);
}

/** Where a rush lane crosses the line on side s. */
export function laneX(c: PlayContent, line: Line, lane: Lane, s: Sign, ownX: number): number {
  const a = c.fronts.alignment;
  switch (lane) {
    case 'a': return (line.center + line.guard(s)) / 2;
    case 'b': return (line.guard(s) + line.tackle(s)) / 2;
    case 'c': { const te = line.te(s); return te !== null ? (line.tackle(s) + te) / 2 : line.tackle(s) + s * a.c_gap_without_te; }
    case 'edge': return line.endMan(s) + s * c.fronts.rush.edge_outside_end_man;
    default: return ownX;
  }
}

const middleOfField = (off: Offense) => (off.frame.leftSideline + off.frame.rightSideline) / 2;

/** A zone landmark for side s, from the offense at the snap. */
export function landmark(c: PlayContent, off: Offense, view: OffView[], zoneId: string, side: 'strong' | 'weak' | 'middle', part: 'outside' | 'inside' | 'middle', strength: Sign): Vec {
  const zone: Zone | undefined = c.coverages.zones[zoneId];
  if (!zone) throw new Error(`unknown zone ${zoneId}`);
  const place: ZonePlace | undefined = zone[part];
  if (!place) throw new Error(`zone ${zoneId} has no ${part} landmark`);
  const s = (side === 'weak' ? -strength : strength) as Sign;
  const line = lineOf(c, view);
  let x: number;
  if ('from_sideline' in place) {
    x = (s > 0 ? off.frame.rightSideline : off.frame.leftSideline) - s * place.from_sideline;
    const n1 = receiversOnSide(view, s)[0];
    if (n1 && place.max_outside_1 !== undefined && s * (x - n1.pos.x) > place.max_outside_1) x = n1.pos.x + s * place.max_outside_1;
  }
  else if ('at' in place) x = place.at === 'ball' ? 0 : middleOfField(off);
  else if ('end_man_to_1' in place) {
    const em = line.endMan(s);
    const n1 = receiversOnSide(view, s)[0];
    x = em + ((n1 ? n1.pos.x : em) - em) * place.end_man_to_1;
  } else x = line.endMan(s) + s * place.end_man_plus;
  const depth = 'at' in place && place.depth !== undefined ? place.depth : zone.depth;
  return vec(x, depth);
}

/** Pre-snap alignment of every defender against the offense as it stands at one moment. */
export function alignDefense(
  c: PlayContent,
  off: Offense,
  setup: DefenseSetup,
  view: OffView[],
  tells: Map<string, { depth: number; end_man_plus?: number }>,
  /** offensive players running a motion the defense follows behind the linebackers */
  traveling: Set<string> = new Set(),
): Map<string, Vec> {
  const fa = c.fronts.alignment;
  const ca = c.coverages.alignments;
  const line = lineOf(c, view);
  const out = new Map<string, Vec>();
  const byId = (id: string) => view.find((p) => p.id === id)!;
  const n1 = (s: Sign) => receiversOnSide(view, s)[0];
  const strength = setup.strengthSign;
  const jobX = (p: DefPlayer): number => {
    const j = p.job;
    if (j.kind === 'zone' || j.kind === 'drop') return landmark(c, off, view, j.zone, j.side, j.part, strength).x;
    if (j.kind === 'man') return byId(j.target).pos.x;
    if (j.kind === 'rush') return laneX(c, line, j.lane, p.sign, 0);
    return 0;
  };
  const frontSpot = (p: Pick<DefPlayer, 'tech' | 'lbAlign' | 'sign' | 'role'>): Vec | null => {
    if (p.tech) return vec(techX(c, line, p.tech, p.sign), fa.dl_depth);
    const a = p.lbAlign;
    if (!a) return null;
    if ('gap' in a) return vec(laneX(c, line, a.gap, p.sign, 0), fa.lb_depth);
    if ('stack' in a) {
      const dl = setup.players.find((q) => q.role === a.stack);
      if (!dl?.tech) throw new Error(`${setup.front.id}: ${p.role} stacks on ${a.stack}, which is not a lineman`);
      return vec(techX(c, line, dl.tech, dl.sign), fa.lb_depth);
    }
    const s = p.sign;
    const em = line.endMan(s);
    // only receivers outside the end man count (a motion man passing behind the line does not)
    const rec = receiversOnSide(view, s).filter((r) => r.align !== 'attached' && Math.abs(r.pos.x) > Math.abs(em) + 0.5);
    const two = rec.length >= 2 ? rec[1] : undefined;
    if (!two) return vec(em + s * fa.apex_without_slot.outside_end_man, fa.lb_depth);
    return apex(c.geometry, em, two.pos.x);
  };
  const overMan = (p: DefPlayer, spec: { depth: number; leverage: 'inside' | 'outside'; offset: number }, r: Vec): Vec => {
    const dir = spec.leverage === 'outside' ? Math.sign(r.x) || p.sign : -(Math.sign(r.x) || p.sign);
    return vec(r.x + dir * spec.offset, spec.depth);
  };
  for (const p of setup.players) {
    let pos: Vec | null = null;
    const name = p.align;
    if (name === 'one-high') pos = vec(middleOfField(off), ca['one-high'].depth);
    else if (name === 'two-high' || name === 'two-high-low') pos = vec(p.sign > 0 ? off.frame.rightHash : off.frame.leftHash, ca[name].depth);
    else if (name === 'down') pos = vec(jobX(p), ca.down.depth);
    else if (name === 'apex') pos = frontSpot({ ...p, lbAlign: { at: 'apex' } });
    else if (name === 'blitz') pos = vec(jobX(p), ca.blitz.depth);
    else if (name && name !== 'over-man') {
      const r = n1(p.sign);
      pos = r ? overMan(p, ca[name], r.pos) : null;
    }
    if (!pos && p.job.kind === 'man' && (name === 'over-man' || !p.lbAlign || !byId(p.job.target).backfield)) {
      const target = byId(p.job.target);
      if (!target.backfield || traveling.has(target.id)) {
        pos = overMan(p, ca['over-man'], target.pos);
        if (traveling.has(target.id)) pos = vec(pos.x, ca['over-man'].travel_depth);
      }
      else if (!p.lbAlign) pos = vec(target.pos.x, ca['over-man'].depth);
    }
    pos ??= frontSpot(p);
    if (!pos && p.job.kind === 'rush') pos = vec(jobX(p), ca.blitz.depth);
    if (!pos) throw new Error(`${setup.coverage.id}/${setup.front.id}: no alignment for ${p.role}`);
    const tell = tells.get(p.role);
    if (tell) pos = vec(tell.end_man_plus !== undefined ? line.endMan(p.sign) + p.sign * tell.end_man_plus : pos.x, tell.depth);
    out.set(p.role, pos);
  }
  return out;
}
