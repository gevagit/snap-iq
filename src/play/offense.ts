import type { FieldFrame } from '../field/geometry';
import type { Align, Concept, Formation, Motion, Protection, RouteRef } from '../content/playSchemas';
import type { PlayContent } from './content';
import { Path, type Leg, type Vec, profileSpeed, timeToCover, vec } from './movement';

export type Sign = 1 | -1;
export const LINEMEN = ['LT', 'LG', 'C', 'RG', 'RT'] as const;
const BACK_SPOTS = new Set<string>(['gun-offset', 'pistol-back', 'i-back', 'fullback']);

export interface OffPlayer {
  id: string;
  number: number;
  align: Align | 'line' | 'qb';
  onLine: boolean;
  /** a running back or fullback in a backfield spot */
  backfield: boolean;
  /** side the formation puts him on (strong or weak, after mirroring); 0 for linemen and the quarterback */
  side: Sign | 0;
  pos: Vec;
}

export interface Offense {
  formation: Formation;
  strongSign: Sign;
  frame: FieldFrame;
  players: OffPlayer[];
}

export const isEligibleNumber = (n: number) => (n >= 1 && n <= 49) || (n >= 80 && n <= 99);

/** Place the formation for a ball spot, mirrored so its strong side is strongSign. */
export function alignOffense(c: PlayContent, formation: Formation, strongSign: Sign, frame: FieldFrame): Offense {
  const a = c.formations.alignment;
  const numbers = c.personnel.jersey_numbers;
  const lineY = -a.line.depth;
  const offY = -a.back_min_depth;
  const players: OffPlayer[] = LINEMEN.map((id, i) => ({
    id, number: numbers[id] ?? 0, align: 'line' as const, onLine: true, backfield: false, side: 0 as const, pos: vec((i - 2) * a.line.split, lineY),
  }));
  players.push({ id: 'QB', number: numbers.QB ?? 0, align: 'qb', onLine: false, backfield: false, side: 0, pos: vec(0, -a.qb[formation.qb]) });

  const entries = Object.entries(formation.players) as [string, { side: 'strong' | 'weak'; align: Align; on_line?: boolean | undefined }][];
  const sideSign = (side: 'strong' | 'weak'): Sign => (side === 'strong' ? strongSign : (-strongSign as Sign));
  const tackle = 2 * a.line.split;
  const placed = new Map<string, OffPlayer>();
  const put = (id: string, side: Sign, align: Align, x: number, y: number, onLine: boolean) => {
    const p: OffPlayer = { id, number: numbers[id] ?? 0, align, onLine, backfield: BACK_SPOTS.has(align), side, pos: vec(x, y) };
    placed.set(id, p);
  };
  const order: Align[] = ['attached', 'wide', 'slot', 'inside-slot', 'bunch-point', 'bunch-inside', 'bunch-outside', 'gun-offset', 'pistol-back', 'i-back', 'fullback'];
  const endMan = (s: Sign) => {
    const te = [...placed.values()].find((p) => p.align === 'attached' && p.side === s);
    return te ? Math.abs(te.pos.x) : tackle;
  };
  const onSide = (s: Sign, align: Align) => [...placed.values()].find((p) => p.side === s && p.align === align);
  for (const kind of order) {
    for (const [id, spec] of entries) {
      if (spec.align !== kind) continue;
      const s = sideSign(spec.side);
      const sideline = s > 0 ? frame.rightSideline : -frame.leftSideline;
      const y = spec.on_line ? lineY : offY;
      const em = endMan(s);
      switch (kind) {
        case 'attached':
          put(id, s, kind, s * (tackle + a.attached.outside_tackle), lineY, true);
          break;
        case 'wide': {
          const d = Math.min(a.wide.max_from_ball, Math.max(a.wide.min_from_ball, sideline - a.wide.from_sideline));
          put(id, s, kind, s * d, y, Boolean(spec.on_line));
          break;
        }
        case 'slot': {
          const wide = onSide(s, 'wide');
          if (!wide) throw new Error(`${formation.id}: ${id} is a slot with no wide receiver on his side`);
          const d = Math.max(em + (Math.abs(wide.pos.x) - em) * a.slot.fraction, em + a.slot.min_outside_end_man);
          put(id, s, kind, s * d, y, Boolean(spec.on_line));
          break;
        }
        case 'inside-slot': {
          const slot = onSide(s, 'slot');
          if (!slot) throw new Error(`${formation.id}: ${id} is an inside slot with no slot on his side`);
          put(id, s, kind, s * (em + (Math.abs(slot.pos.x) - em) * a.inside_slot.fraction), y, Boolean(spec.on_line));
          break;
        }
        case 'bunch-point':
          put(id, s, kind, s * (em + a.bunch.point_outside_end_man), lineY, true);
          break;
        case 'bunch-inside':
        case 'bunch-outside': {
          const point = onSide(s, 'bunch-point');
          if (!point) throw new Error(`${formation.id}: ${id} is in a bunch with no point man`);
          const dir = kind === 'bunch-outside' ? 1 : -1;
          put(id, s, kind, point.pos.x + s * dir * a.bunch.spread, lineY - a.bunch.depth_behind_point, false);
          break;
        }
        default: {
          const spot = a.backs[kind as 'gun-offset'];
          put(id, s, kind, s * spot.x, -spot.depth, false);
        }
      }
    }
  }
  players.push(...placed.values());
  return { formation, strongSign, frame, players };
}

export const player = (o: { players: OffPlayer[] }, id: string) => {
  const p = o.players.find((q) => q.id === id);
  if (!p) throw new Error(`no offensive player ${id}`);
  return p;
};

/** x of the end man on the line (tackle or attached tight end) on side s, given current positions. */
export function endManX(players: { id: string; align: string; side: number; pos: Vec }[], s: Sign, tackle: number): number {
  const te = players.find((p) => p.align === 'attached' && p.side === s);
  return te ? te.pos.x : s * tackle;
}

/** Detached receivers on side s (not backs, not linemen), widest first. */
export function receiversOnSide<T extends { id: string; pos: Vec; backfield: boolean }>(players: T[], s: Sign, exclude: Set<string> = new Set()): T[] {
  return players
    .filter((p) => !LINEMEN.includes(p.id as never) && p.id !== 'QB' && !p.backfield && !exclude.has(p.id) && Math.sign(p.pos.x) === s)
    .sort((a, b) => Math.abs(b.pos.x) - Math.abs(a.pos.x));
}

// ------------------------------------------------------------------ motion
export interface MotionPlan {
  motion: Motion;
  mover: string;
  /** the motion leg (negative start time); the mover is set before it starts */
  leg: Leg;
  start: number;
  snapPos: Vec;
  snapSpeed: number;
  /** the side his post-snap job is on */
  destination: Sign;
  /** post-snap path points for a jet or orbit man */
  after?: Vec[];
  /** for back motion: he is a receiver from now on */
  becomesReceiver: boolean;
}

export type Fit<T> = { ok: true; value: T } | { ok: false; reason: string };

export function planMotion(c: PlayContent, off: Offense, motion: Motion, protection: Protection): Fit<MotionPlan | null> {
  if (motion.id === 'none' || !motion.mover || !motion.path || !motion.speed) return { ok: true, value: null };
  const a = c.formations.alignment;
  const needs = motion.needs ?? {};
  const strong = off.strongSign;
  const weak = -strong as Sign;
  const tackle = 2 * a.line.split;
  if (needs.qb && !needs.qb.includes(off.formation.qb)) return { ok: false, reason: `${motion.name} needs the quarterback in ${needs.qb.join(' or ')}` };
  if (needs.protection_without_back && protection.needs_back) return { ok: false, reason: `${motion.name} takes the back out, but ${protection.name} needs him` };

  let mover: OffPlayer | undefined;
  let side: Sign;
  if (motion.mover.side === 'backfield') {
    mover = off.players.find((p) => p.id === 'R' && p.backfield);
    side = mover ? ((mover.side || strong) as Sign) : strong;
    if (!mover) return { ok: false, reason: `${motion.name} needs a running back in the backfield` };
  } else {
    side = motion.mover.side === 'strong' ? strong : weak;
    const rec = receiversOnSide(off.players, side);
    if (needs.side_receivers_min && rec.length < needs.side_receivers_min)
      return { ok: false, reason: `${motion.name} needs ${needs.side_receivers_min} receivers on the ${motion.mover.side} side` };
    const offLine = rec.filter((p) => !p.onLine);
    mover = motion.mover.pick === 'widest-off-line' ? offLine[0] : offLine[offLine.length - 1];
    if (!mover) return { ok: false, reason: `${motion.name} needs a receiver off the line on the ${motion.mover.side} side` };
    if (needs.mover_is_number && rec.indexOf(mover) + 1 !== needs.mover_is_number)
      return { ok: false, reason: `${motion.name} needs #${needs.mover_is_number} on the ${motion.mover.side} side off the line` };
  }
  if (needs.max_from_ball && Math.abs(mover.pos.x) > needs.max_from_ball)
    return { ok: false, reason: `${motion.name} needs the mover within ${needs.max_from_ball} yd of the ball` };

  const p = motion.path;
  const s0 = mover.pos;
  const profile = { top: motion.speed, tau: c.speeds.presnap.motion_tau, delay: 0 };
  let points: Vec[];
  let destination: Sign = side;
  let setEarly = 0;
  let becomesReceiver = false;
  switch (p.kind) {
    case 'jet':
    case 'orbit':
      points = [s0, vec(s0.x - side * p.turn.inward, -p.turn.depth), ...(p.via ?? []).map(([x, d]) => vec(side * x, -d)), vec(side * p.snap.x, -p.snap.depth)];
      destination = -side as Sign;
      break;
    case 'lateral':
      points = [s0, vec(s0.x - side * p.inward, s0.y)];
      break;
    case 'return': {
      const xi = s0.x - side * p.inward;
      const r = p.turn_radius;
      points = [s0, vec(xi, s0.y), vec(xi - side * r, s0.y - r), vec(xi, s0.y - 2 * r), vec(xi + side * p.back, s0.y - 2 * r)];
      break;
    }
    case 'out-to-slot': {
      destination = p.destination === 'strong' ? strong : weak;
      const rec = receiversOnSide(off.players, destination).filter((q) => q.align !== 'attached');
      if (needs.destination_receivers_max !== undefined && receiversOnSide(off.players, destination).length > needs.destination_receivers_max)
        return { ok: false, reason: `${motion.name} has no room: the ${p.destination} side already has 3 receivers` };
      const em = Math.abs(endManX(off.players, destination, tackle));
      const inner = rec[rec.length - 1];
      if (!inner) return { ok: false, reason: `${motion.name} needs a receiver to set outside of` };
      const frac = rec.length >= 2 ? a.inside_slot.fraction : a.slot.fraction;
      let d = em + (Math.abs(inner.pos.x) - em) * frac;
      if (rec.length < 2) d = Math.max(d, em + a.slot.min_outside_end_man);
      points = [s0, vec(destination * d, -a.back_min_depth)];
      setEarly = p.set_before_snap;
      becomesReceiver = true;
      break;
    }
  }
  const path = new Path(points);
  if (needs.clear_of_teammates !== undefined) {
    const others = off.players.filter((q) => q.id !== mover!.id);
    for (let d = 0; d <= path.length; d += 0.25) {
      const at = path.at(d);
      const near = others.find((q) => Math.hypot(q.pos.x - at.x, q.pos.y - at.y) < needs.clear_of_teammates!);
      if (near) return { ok: false, reason: `${motion.name} has no room: ${mover.id} would pass within ${needs.clear_of_teammates} yd of ${near.id}` };
    }
  }
  const travel = timeToCover(profile, path.length);
  const start = -(travel + setEarly);
  const leg: Leg = { t0: start, path, profile, v0: 0, delay: 0, job: 'motion' };
  const moving = setEarly === 0;
  const after = motion.after?.map(([x, y]) => vec(destination * x, y));
  return {
    ok: true,
    value: { motion, mover: mover.id, leg, start, snapPos: path.end, snapSpeed: moving ? profileSpeed(profile, travel) : 0, destination, ...(after ? { after } : {}), becomesReceiver },
  };
}

// ------------------------------------------------------------------ routes
export interface RouteJob {
  id: string;
  route: string;
  quick: boolean;
  points: Vec[];
  /** profile job */
  job: 'route-wide-receiver' | 'route-tight-end' | 'route-back';
  v0: number;
}

export interface OffenseJobs {
  routes: RouteJob[];
  /** back who checks for a blitzer (check-release or pick-up) */
  checker?: string;
  /** backs who block for the whole play */
  blockers: string[];
  /** route runners at the snap, by side and number, for the progression and checks */
  numbers: Map<string, { side: Sign; number: number }>;
}

const refRoute = (r: RouteRef) => (typeof r === 'string' ? { route: r, deeper: 0 } : r);

/** Positions at the snap for everyone but linemen, given the motion plan. */
export function snapPositions(off: Offense, plan: MotionPlan | null): Map<string, Vec> {
  const m = new Map<string, Vec>();
  for (const p of off.players) m.set(p.id, plan && plan.mover === p.id ? plan.snapPos : p.pos);
  return m;
}

/** overrides: route changes he made at the line (receiver letter -> route id), at most adjustments.max_changes */
export function assignRoutes(c: PlayContent, off: Offense, plan: MotionPlan | null, concept: Concept, protection: Protection, overrides: Partial<Record<string, string>> = {}): Fit<OffenseJobs> {
  const snap = snapPositions(off, plan);
  const room = c.routeFile.sideline_room;
  const clampX = (x: number) => Math.min(off.frame.rightSideline - room, Math.max(off.frame.leftSideline + room, x));
  const atSnap = off.players.map((p) => ({ ...p, pos: snap.get(p.id)!, backfield: p.backfield && !(plan?.mover === p.id && plan.becomesReceiver) }));
  const destinationMover = plan?.motion.counts_to === 'destination' ? plan.mover : undefined;
  const exclude = new Set(destinationMover ? [destinationMover] : []);
  const strong = off.strongSign;
  const strongRec = receiversOnSide(atSnap, strong, exclude);
  const weakRec = receiversOnSide(atSnap, -strong as Sign, exclude);
  const strongRoutes = concept.by_count[String(strongRec.length) as '1'];
  if (!strongRoutes) return { ok: false, reason: `${concept.name} does not fit ${strongRec.length} receivers to the strong side` };
  const backs = atSnap.filter((p) => p.backfield);
  if (protection.needs_back && !backs.some((b) => b.id === 'R')) return { ok: false, reason: `${protection.name} needs a back in the backfield` };

  const routes: RouteJob[] = [];
  const numbers = new Map<string, { side: Sign; number: number }>();
  const build = (pid: string, ref: RouteRef, from: Vec, side: Sign, v0: number) => {
    const changed = overrides[pid];
    const { route: rid, deeper } = changed ? { route: changed, deeper: 0 } : refRoute(ref);
    const route = c.routes.get(rid);
    if (!route) throw new Error(`${concept.id}: unknown route ${rid}`);
    const pts = [from, ...route.waypoints.map(([dx, dy]) => vec(clampX(from.x + side * dx), from.y + dy + deeper))];
    const formationSpot = off.formation.players[pid as 'X'];
    const job = pid === 'R' || pid === 'F' ? 'route-back' : pid === 'Y' && formationSpot?.align === 'attached' ? 'route-tight-end' : 'route-wide-receiver';
    routes.push({ id: pid, route: rid, quick: route.quick, points: pts, job, v0 });
  };
  const speedAtSnap = (pid: string) => (plan && plan.mover === pid ? plan.snapSpeed : 0);
  for (const [i, r] of strongRec.entries()) {
    const ref = strongRoutes[String(i + 1) as '1'];
    if (!ref) return { ok: false, reason: `${concept.name} has no route for #${i + 1} strong` };
    numbers.set(r.id, { side: strong, number: i + 1 });
    build(r.id, ref, r.pos, strong, speedAtSnap(r.id));
  }
  for (const [i, r] of weakRec.entries()) {
    const ref = concept.weak[String(i + 1) as '1'];
    if (!ref) return { ok: false, reason: `${concept.name} has no backside route for #${i + 1}` };
    numbers.set(r.id, { side: -strong as Sign, number: i + 1 });
    build(r.id, ref, r.pos, -strong as Sign, speedAtSnap(r.id));
  }
  if (destinationMover && plan?.after) {
    const from = plan.snapPos;
    const pts = [from, ...plan.after.map((p) => vec(clampX(p.x), p.y))];
    const mid = destinationMover;
    const job = mid === 'R' || mid === 'F' ? 'route-back' : 'route-wide-receiver';
    routes.push({ id: mid, route: plan.motion.id, quick: Boolean(plan.motion.quick), points: pts, job, v0: plan.snapSpeed });
  }
  const blockers: string[] = [];
  let checker: string | undefined;
  for (const b of backs) {
    if (b.id === 'R' && protection.back === 'free') {
      const side = (Math.sign(b.pos.x) || b.side || strong) as Sign;
      build(b.id, concept.back, b.pos, side, 0);
    } else if (b.id === 'R') checker = 'R';
    else blockers.push(b.id);
  }
  return { ok: true, value: { routes, ...(checker ? { checker } : {}), blockers, numbers } };
}

/** The back's check point: just outside the tackle on his side, about 2 yd behind the line. */
export function checkPoint(c: PlayContent, off: Offense, backId: string): { pos: Vec; side: Sign } {
  const b = player(off, backId);
  const side = (Math.sign(b.pos.x) || b.side || off.strongSign) as Sign;
  const cp = c.protections.back_check_point;
  return { pos: vec(side * (2 * c.formations.alignment.line.split + cp.outside_tackle), -cp.depth), side };
}
