import type { Profile } from '../content/playSchemas';
import type { PlayContent } from './content';
import { type DefPlayer, type DefenseSetup, type OffView, alignDefense, landmark, laneX, lineOf } from './defense';
import { type Leg, Path, type Vec, dist, legPosition, legSpeed, timeToCover, vec } from './movement';
import { LINEMEN, type MotionPlan, type Offense, type OffenseJobs, type Sign, checkPoint } from './offense';

export interface Track {
  id: string;
  team: 'O' | 'D';
  label: string;
  number: number;
  /** what he does after the snap, in content words */
  job: string;
  /** top speed he may reach before and after the snap (reachability check) */
  capPre: number;
  capPost: number;
  xs: Float64Array;
  ys: Float64Array;
}

export interface Rusher { role: string; blocker: string | null; laneX: number; side: Sign; dl: boolean }

export interface Simulation {
  dt: number;
  tStart: number;
  snapIndex: number;
  steps: number;
  tracks: Track[];
  /** route and motion polylines for drawing */
  routes: { id: string; route: string; quick: boolean; points: Vec[] }[];
  motionPath: Vec[] | null;
  landmarks: { role: string; zone: string; at: Vec; by: number }[];
  rushers: Rusher[];
  blockers: string[];
  /** man matchups: defender role -> offensive player */
  man: { role: string; target: string }[];
  greenDogs: string[];
  /** the back's final job */
  backJob: 'none' | 'route' | 'release' | 'block';
  qbLaunch: Vec;
}

const TACKLE = (c: PlayContent) => 2 * c.formations.alignment.line.split;

function profileFor(c: PlayContent, job: string): Profile {
  const name = c.speeds.jobs[job as keyof typeof c.speeds.jobs];
  const p = name ? c.speeds.profiles[name] : undefined;
  if (!p) throw new Error(`no speed profile for job ${job}`);
  return p;
}

/** Order-preserving blocker-rusher matching: the cheapest pairing that never crosses blocks (PRD §6.13 pass sets). */
function matchProtection(rushers: { key: string; x: number; dl: boolean; side: Sign }[], blockers: { id: string; x: number; back: boolean }[], slideSide: Sign | 0, strong: Sign): Map<string, string> {
  const R = [...rushers].sort((a, b) => a.x - b.x);
  const B = [...blockers].sort((a, b) => a.x - b.x);
  const INF = 1e9;
  // the widest rusher goes free first (on the slide side with a slide); exact ties go to the weak side, so a
  // mirrored formation gets the mirrored protection
  const skip = (r: (typeof R)[number]) => 40 - Math.abs(r.x) - (slideSide && r.side === slideSide ? 3 : 0) - (r.side !== strong ? 0.01 : 0);
  const pairCost = (r: (typeof R)[number], b: (typeof B)[number]) => Math.abs(r.x - b.x) + 1e-4 * strong * b.x;
  const n = R.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(INF));
  const how: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  dp[0]![0] = 0;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      const cur = dp[i]![j]!;
      if (cur >= INF) continue;
      if (i < n && cur + skip(R[i]!) < dp[i + 1]![j]!) { dp[i + 1]![j] = cur + skip(R[i]!); how[i + 1]![j] = 1; }
      if (j < m && cur < dp[i]![j + 1]!) { dp[i]![j + 1] = cur; how[i]![j + 1] = 2; }
      if (i < n && j < m && !(B[j]!.back && R[i]!.dl)) {
        const cost = cur + pairCost(R[i]!, B[j]!);
        if (cost < dp[i + 1]![j + 1]!) { dp[i + 1]![j + 1] = cost; how[i + 1]![j + 1] = 3; }
      }
    }
  const out = new Map<string, string>();
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const h = how[i]![j]!;
    if (h === 1) i--;
    else if (h === 2) j--;
    else { out.set(R[i - 1]!.key, B[j - 1]!.id); i--; j--; }
  }
  return out;
}

export function simulate(c: PlayContent, off: Offense, plan: MotionPlan | null, jobs: OffenseJobs, def: DefenseSetup, dt: number, post = 3.0): Simulation {
  const pre = c.speeds.presnap;
  const tells = def.coverage.tells ?? [];
  const lead = Math.max(3.0, plan ? -plan.start + 1.5 : 0, ...tells.map((t) => t.start + 1.0));
  const snapIndex = Math.ceil(lead / dt);
  const tStart = -snapIndex * dt;
  const steps = snapIndex + Math.round(post / dt);
  const time = (k: number) => tStart + k * dt;
  const tackle = TACKLE(c);

  // ---------------- offense before the snap (analytic)
  const offAt = (t: number): OffView[] =>
    off.players.map((p) => {
      let pos = p.pos;
      if (plan && plan.mover === p.id && t >= plan.leg.t0) pos = legPosition(plan.leg, Math.min(t, 0));
      const backfield = p.backfield && !(plan?.becomesReceiver && plan.mover === p.id && Math.abs(pos.x) > tackle + 1);
      return { id: p.id, align: p.align, side: p.side, backfield, pos };
    });
  const snapView = offAt(0);
  const line = lineOf(c, snapView);

  // ---------------- QB drop
  const drop = c.formations.drops[off.formation.qb];
  const qbAt = (t: number): Vec => {
    const pts = drop.path;
    if (t <= pts[0]![0]) return vec(0, -pts[0]![1]);
    for (let i = 1; i < pts.length; i++) {
      const [t1, d1] = pts[i]!;
      const [t0, d0] = pts[i - 1]!;
      if (t <= t1) return vec(0, -(d0 + ((d1 - d0) * (t - t0)) / (t1 - t0)));
    }
    return vec(0, -pts[pts.length - 1]![1]);
  };
  const qbLaunch = vec(0, -Math.max(...drop.path.map(([, d]) => d)));
  const qbCap = Math.max(...drop.path.slice(1).map(([t1, d1], i) => Math.abs(d1 - drop.path[i]![1]) / (t1 - drop.path[i]![0])));

  // ---------------- rushers and protection
  const rushRoles = def.players.filter((p) => p.job.kind === 'rush');
  const rusherLane = (p: DefPlayer) => {
    const own = snapPosOf(p.role);
    return laneX(c, line, p.job.kind === 'rush' ? p.job.lane : 'bull', p.sign, own.x);
  };
  // defense positions are integrated, so rush lanes are worked out at the snap (below)
  const offenseLegs = new Map<string, Leg[]>();
  const routeJobs = new Map(jobs.routes.map((r) => [r.id, r]));
  const offCaps = new Map<string, number>();

  // ---------------- tracks
  const tracks: Track[] = [];
  const offTracks = off.players.map((p) => {
    const tr: Track = { id: p.id, team: 'O', label: LINEMEN.includes(p.id as never) ? '' : p.id === 'QB' ? String(p.number) : p.id, number: p.number, job: '', capPre: 0, capPost: 0, xs: new Float64Array(steps + 1), ys: new Float64Array(steps + 1) };
    tracks.push(tr);
    return tr;
  });
  const defTracks = def.players.map((p) => {
    const tr: Track = { id: p.role, team: 'D', label: p.label, number: p.number, job: '', capPre: pre.walk, capPost: 0, xs: new Float64Array(steps + 1), ys: new Float64Array(steps + 1) };
    tracks.push(tr);
    return tr;
  });

  // offense before the snap
  for (let k = 0; k <= snapIndex; k++) {
    const view = offAt(time(k));
    view.forEach((v, i) => { offTracks[i]!.xs[k] = v.pos.x; offTracks[i]!.ys[k] = v.pos.y; });
  }
  if (plan) offTracks.find((t) => t.id === plan.mover)!.capPre = plan.motion.speed ?? 0;

  // defense before the snap: walk toward the alignment for the offense as it stood `lag` seconds ago
  const tellMap = (t: number) => {
    const m = new Map<string, { depth: number; end_man_plus?: number }>();
    for (const tl of tells) if (t >= -tl.start) m.set(tl.role, tl.to.end_man_plus !== undefined ? { depth: tl.to.depth, end_man_plus: tl.to.end_man_plus } : { depth: tl.to.depth });
    return m;
  };
  const travelKinds = new Set<string>(c.coverages.alignments['over-man'].travel_for);
  const travelingAt = (t: number) => {
    const m = new Set<string>();
    if (plan && plan.motion.path && travelKinds.has(plan.motion.path.kind) && t >= plan.leg.t0 && legSpeedAt(plan, t) > 0.1) m.add(plan.mover);
    return m;
  };
  const traveler = (p: DefPlayer) => Boolean(plan && p.job.kind === 'man' && p.job.target === plan.mover);
  let dpos = alignDefense(c, off, def, offAt(tStart), tellMap(tStart));
  const dvel = new Map<string, Vec>(def.players.map((p) => [p.role, vec(0, 0)]));
  const record = (k: number) => def.players.forEach((p, i) => { const v = dpos.get(p.role)!; defTracks[i]!.xs[k] = v.x; defTracks[i]!.ys[k] = v.y; });
  record(0);
  // targets only change while the motion man moves (as seen, lag later) or when a tell starts
  const changes = (t: number) => (plan && t >= plan.leg.t0 && t <= 0 ? `m${t}` : plan && t > 0 ? 'set' : 'still') + tells.filter((tl) => t >= -tl.start).length;
  let cacheKey = '';
  let targets = new Map<string, Vec>();
  for (let k = 1; k <= snapIndex; k++) {
    const t = time(k);
    const seen = Math.max(tStart, t - pre.lag);
    const key = changes(seen) + '/' + tells.filter((tl) => t >= -tl.start).length;
    if (key !== cacheKey) {
      targets = alignDefense(c, off, def, offAt(seen), tellMap(t), travelingAt(seen));
      cacheKey = key;
    }
    const next = new Map<string, Vec>();
    for (const p of def.players) {
      const cap = traveler(p) ? pre.travel : pre.walk;
      const here = dpos.get(p.role)!;
      let target = targets.get(p.role)!;
      for (const q of def.players) {
        if (q === p) continue;
        const o = dpos.get(q.role)!;
        const d = dist(here, o);
        if (d < pre.make_room && d > 1e-6) target = vec(target.x + ((here.x - o.x) / d) * (pre.make_room - d), target.y + ((here.y - o.y) / d) * (pre.make_room - d));
      }
      next.set(p.role, steer(here, dvel.get(p.role)!, target, vec(0, 0), cap, pre.accel, dt, 0.5, (v) => dvel.set(p.role, v)));
      if (traveler(p)) defTracks[def.players.indexOf(p)]!.capPre = pre.travel;
    }
    dpos = next;
    record(k);
  }
  function snapPosOf(role: string): Vec { const i = def.players.findIndex((p) => p.role === role); return vec(defTracks[i]!.xs[snapIndex]!, defTracks[i]!.ys[snapIndex]!); }

  // ---------------- protection at the snap
  const rushers = rushRoles.map((p) => ({ key: p.role, x: rusherLane(p), dl: p.group === 'dl', side: p.sign }));
  const blockerList: { id: string; x: number; back: boolean }[] = LINEMEN.map((id) => ({ id, x: snapView.find((v) => v.id === id)!.pos.x, back: false }));
  const backSpots = new Map<string, { pos: Vec; side: Sign }>();
  for (const id of [...(jobs.checker ? [jobs.checker] : []), ...jobs.blockers]) {
    const cp = checkPoint(c, off, id);
    backSpots.set(id, cp);
    blockerList.push({ id, x: cp.pos.x, back: true });
  }
  const rb = off.players.find((p) => p.id === 'R');
  const slideSide = (rb && jobs.checker ? (-(Math.sign(rb.pos.x) || rb.side || off.strongSign)) as Sign : 0);
  const matched = matchProtection(rushers, blockerList, slideSide, off.strongSign);
  const rusherInfo: Rusher[] = rushRoles.map((p) => ({ role: p.role, blocker: matched.get(p.role) ?? null, laneX: rusherLane(p), side: p.sign, dl: p.group === 'dl' }));

  const ps = c.protections.pass_set;
  const fr = c.fronts.rush;
  const stopPoint = (from: Vec) => {
    const d = dist(from, qbLaunch);
    return d <= fr.stop_short ? from : vec(qbLaunch.x + ((from.x - qbLaunch.x) * fr.stop_short) / d, qbLaunch.y + ((from.y - qbLaunch.y) * fr.stop_short) / d);
  };
  const rushPath = (p: DefPlayer, info: Rusher) => {
    const s0 = snapPosOf(p.role);
    const gap = vec(info.laneX, -fr.gap_depth);
    const full = new Path([s0, gap, stopPoint(gap)]);
    if (!info.blocker) return { path: full, meet: null as Vec | null };
    const meetDepth = backSpots.has(info.blocker) ? fr.meet_back : fr.meet_line;
    const meet = full.at(full.distanceToDepth(-meetDepth));
    return { path: new Path([s0, ...full.points.slice(1).filter((q) => q.y > meet.y), meet]), meet };
  };
  const towardQb = (m: Vec, d: number) => { const L = dist(m, qbLaunch) || 1; return vec(m.x + ((qbLaunch.x - m.x) * d) / L, m.y + ((qbLaunch.y - m.y) * d) / L); };

  const defLegs = new Map<string, Leg[]>();
  const meetPoints = new Map<string, Vec>();
  for (const p of rushRoles) {
    const info = rusherInfo.find((r) => r.role === p.role)!;
    const { path, meet } = rushPath(p, info);
    if (meet && info.blocker) meetPoints.set(info.blocker, towardQb(meet, ps.in_front_of_rusher));
    const job = p.group === 'dl' ? 'rush' : 'blitz';
    const prof = profileFor(c, job);
    defLegs.set(p.role, [{ t0: 0, path, profile: prof, v0: 0, delay: prof.delay, job }]);
  }

  // ---------------- offense after the snap
  for (const id of LINEMEN) {
    const s0 = snapView.find((v) => v.id === id)!.pos;
    const target = meetPoints.get(id) ?? vec(s0.x, -ps.help_depth);
    const prof = profileFor(c, 'pass-set');
    offenseLegs.set(id, [{ t0: 0, path: new Path([s0, target]), profile: prof, v0: 0, delay: prof.delay, job: 'pass-set' }]);
    offCaps.set(id, prof.top);
  }
  let backJob: Simulation['backJob'] = 'none';
  let backCommit = Infinity;
  for (const [id, cp] of backSpots) {
    const s0 = snapView.find((v) => v.id === id)!.pos;
    const prof = profileFor(c, 'back-check');
    const meet = meetPoints.get(id);
    if (meet || id !== jobs.checker) {
      offenseLegs.set(id, [{ t0: 0, path: new Path([s0, meet ?? cp.pos]), profile: prof, v0: 0, delay: prof.delay, job: 'back-check' }]);
      if (id === jobs.checker) { backJob = 'block'; backCommit = timeToCover(prof, dist(s0, cp.pos)); }
      offCaps.set(id, prof.top);
    } else {
      const release = c.routes.get('check-release')!;
      // he checks until check_seconds, or until he reaches his check point if that takes longer
      const wait = Math.max(release.check_seconds ?? 0.9, prof.delay + timeToCover(prof, dist(s0, cp.pos)));
      const rel = profileFor(c, 'route-back');
      const pts = [cp.pos, ...release.waypoints.map(([dx, dy]) => vec(cp.pos.x + cp.side * dx, cp.pos.y + dy))];
      offenseLegs.set(id, [
        { t0: 0, path: new Path([s0, cp.pos]), profile: prof, v0: 0, delay: prof.delay, job: 'back-check' },
        { t0: wait, path: new Path(pts), profile: rel, v0: 0, delay: 0, job: 'route-back' },
      ]);
      routeJobs.set(id, { id, route: 'check-release', quick: release.quick, points: pts, job: 'route-back', v0: 0 });
      offCaps.set(id, Math.max(prof.top, rel.top));
      backJob = 'release';
    }
  }
  for (const r of jobs.routes) {
    if (offenseLegs.has(r.id)) continue;
    const prof = profileFor(c, r.job);
    offenseLegs.set(r.id, [{ t0: 0, path: new Path(r.points), profile: prof, v0: r.v0, delay: r.v0 > 0 ? 0 : prof.delay, job: r.job }]);
    offCaps.set(r.id, Math.max(prof.top, r.v0));
    if (r.id === 'R') backJob = 'route';
  }
  const legAt = (legs: Leg[], t: number) => { let leg = legs[0]!; for (const l of legs) if (t >= l.t0) leg = l; return legPosition(leg, t); };
  for (let k = snapIndex + 1; k <= steps; k++) {
    const t = time(k);
    off.players.forEach((p, i) => {
      const legs = offenseLegs.get(p.id);
      const v = p.id === 'QB' ? qbAt(t) : legs ? legAt(legs, t) : snapView[i]!.pos;
      offTracks[i]!.xs[k] = v.x;
      offTracks[i]!.ys[k] = v.y;
    });
  }
  off.players.forEach((p, i) => {
    offTracks[i]!.capPost = p.id === 'QB' ? qbCap : offCaps.get(p.id) ?? 0;
    const r = routeJobs.get(p.id);
    offTracks[i]!.job = p.id === 'QB' ? `${off.formation.qb} drop` : r ? r.route : LINEMEN.includes(p.id as never) || backSpots.has(p.id) ? 'pass protection' : '';
  });

  // ---------------- defense after the snap
  const landmarks: Simulation['landmarks'] = [];
  const man: Simulation['man'] = [];
  const greenDogs: string[] = [];
  const pursuers = new Map<string, { target: string; prof: Profile; lev: number; c0: number }>();
  const offIndex = new Map(off.players.map((p, i) => [p.id, i]));
  for (const p of def.players) {
    const s0 = snapPosOf(p.role);
    const tr = defTracks[def.players.indexOf(p)]!;
    const j = p.job;
    if (j.kind === 'rush') {
      const prof = profileFor(c, p.group === 'dl' ? 'rush' : 'blitz');
      tr.capPost = prof.top;
      tr.job = p.group === 'dl' ? `rush (${p.tech ?? ''} technique)` : `blitz ${j.lane} gap`.replace('edge gap', 'edge');
    } else if (j.kind === 'zone' || j.kind === 'drop' || j.kind === 'hole') {
      const zoneId = j.kind === 'hole' ? 'hole' : j.zone;
      const at = j.kind === 'hole' ? landmark(c, off, snapView, 'hole', 'middle', 'middle', def.strengthSign) : landmark(c, off, snapView, j.zone, j.side, j.part, def.strengthSign);
      const deep = c.coverages.zones[zoneId]!.deep;
      const job = j.kind === 'drop' ? 'drop-lineman' : p.group === 'lb' ? 'zone-linebacker' : p.role.startsWith('cb') && deep ? 'zone-corner-deep' : 'zone-back';
      const prof = profileFor(c, job);
      defLegs.set(p.role, [{ t0: 0, path: new Path([s0, at]), profile: prof, v0: 0, delay: prof.delay, job }]);
      landmarks.push({ role: p.role, zone: zoneId, at, by: c.coverages.zones[zoneId]!.by });
      tr.capPost = prof.top;
      tr.job = j.kind === 'hole' ? 'robber (hole)' : `${zoneId}${j.side === 'middle' ? '' : ` ${j.side}`}`;
    } else {
      const ti = offIndex.get(j.target)!;
      const tpos = vec(offTracks[ti]!.xs[snapIndex]!, offTracks[ti]!.ys[snapIndex]!);
      const job = p.group === 'lb' ? 'man-linebacker' : dist(s0, tpos) <= pre.man_tight_within ? 'man-tight' : 'man-off';
      const prof = profileFor(c, job);
      pursuers.set(p.role, { target: j.target, prof, lev: c.coverages.man.leverage, c0: Math.max(c.coverages.man.min_cushion, s0.y - tpos.y) });
      man.push({ role: p.role, target: j.target });
      tr.capPost = Math.max(prof.top, profileFor(c, 'blitz').top);
      tr.job = `man on ${j.target}`;
    }
  }
  const mc = c.coverages.man;
  for (let k = snapIndex + 1; k <= steps; k++) {
    const t = time(k);
    def.players.forEach((p, i) => {
      const tr = defTracks[i]!;
      const legs = defLegs.get(p.role);
      let v: Vec;
      if (legs) v = legAt(legs, t);
      else {
        const m = pursuers.get(p.role)!;
        const prev = vec(tr.xs[k - 1]!, tr.ys[k - 1]!);
        const ti = offIndex.get(m.target)!;
        if (mc.green_dog && m.target === jobs.checker && backJob === 'block' && t >= backCommit) {
          // his man stayed in to block: he rushes from where he is (green dog)
          const prof = profileFor(c, 'blitz');
          const vel = vec((prev.x - tr.xs[k - 2]!) / dt, (prev.y - tr.ys[k - 2]!) / dt);
          const leg: Leg = { t0: t - dt, path: new Path([prev, stopPoint(prev)]), profile: prof, v0: Math.min(prof.top, Math.hypot(vel.x, vel.y)), delay: 0, job: 'blitz' };
          defLegs.set(p.role, [leg]);
          greenDogs.push(p.role);
          tr.job = `green dog (man on ${m.target})`;
          v = legPosition(leg, t);
        } else if (t - m.prof.delay <= 0) v = prev;
        else {
          const r = vec(offTracks[ti]!.xs[k]!, offTracks[ti]!.ys[k]!);
          const rPrev = vec(offTracks[ti]!.xs[k - 1]!, offTracks[ti]!.ys[k - 1]!);
          const inside = -(Math.sign(r.x) || p.sign);
          const cushion = Math.max(mc.min_cushion, m.c0 - mc.close_rate * t);
          const target = vec(r.x + inside * m.lev, r.y + cushion);
          const vel0 = vec((prev.x - tr.xs[k - 2]!) / dt, (prev.y - tr.ys[k - 2]!) / dt);
          const ff = vec((r.x - rPrev.x) / dt, (r.y - rPrev.y) / dt);
          v = steer(prev, vel0, target, ff, m.prof.top, m.prof.top / m.prof.tau, dt, 0.3, () => undefined);
        }
      }
      tr.xs[k] = v.x;
      tr.ys[k] = v.y;
    });
  }

  return {
    dt, tStart, snapIndex, steps, tracks,
    routes: [...routeJobs.values()].map((r) => ({ id: r.id, route: r.route, quick: r.quick, points: r.points })),
    motionPath: plan ? plan.leg.path.points : null,
    landmarks,
    rushers: rusherInfo,
    blockers: blockerList.map((b) => b.id),
    man,
    greenDogs,
    backJob,
    qbLaunch,
  };
}

const legSpeedAt = (plan: MotionPlan, t: number) => (t > 0 ? plan.snapSpeed : legSpeed(plan.leg, t));

/** Speed- and acceleration-limited move toward a target (deterministic, fixed step). */
function steer(pos: Vec, vel: Vec, target: Vec, feedForward: Vec, cap: number, accel: number, dt: number, close: number, setVel: (v: Vec) => void): Vec {
  let dx = (target.x - pos.x) / close + feedForward.x;
  let dy = (target.y - pos.y) / close + feedForward.y;
  const sp = Math.hypot(dx, dy);
  if (sp > cap) { dx *= cap / sp; dy *= cap / sp; }
  let ax = (dx - vel.x) / dt;
  let ay = (dy - vel.y) / dt;
  const a = Math.hypot(ax, ay);
  if (a > accel) { ax *= accel / a; ay *= accel / a; }
  let vx = vel.x + ax * dt;
  let vy = vel.y + ay * dt;
  const v = Math.hypot(vx, vy);
  if (v > cap) { vx *= cap / v; vy *= cap / v; }
  setVel(vec(vx, vy));
  return vec(pos.x + vx * dt, pos.y + vy * dt);
}
