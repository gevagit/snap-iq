/**
 * The pre-snap routine v2 (docs/plans/routine-v2.md): one rep = one of our plays (content/playbook/plays.yaml)
 * against a defensive look built for its formation (content/playbook/looks.yaml), in a down & distance. This module
 * deals the rep, places all 22 players and computes the right answer for every step of his routine. Deterministic:
 * the same seed gives the same rep (CLAUDE.md engine rules). No football numbers here: they come from content.
 */
import { active, place, resolve, routePath, routeStart, type Formations, type Placed, type Playbook, type TeamPlay } from '../playbook';

// ------------------------------------------------------------------ content shapes
export interface Looks {
  groups: Record<string, { name: string; plays: number[] }>;
  placement: {
    safety_depth: Record<'deep' | 'middle' | 'low', number>; safety_x: Record<string, number>;
    corner: { press: number; off: [number, number]; leverage: number; cloud: number };
    nickel: { depth: number; inside_of_2: number }; creep: number; line_depth: number;
  };
  fronts: { id: string; name: string; dl: number[]; edges?: [number, number][]; lbs: [number, number][]; dbs: number }[];
  looks: Look[];
}
export interface Look {
  id: string; name: string; groups: string[]; front: string; coverage: string;
  safeties: { depth: 'deep' | 'middle' | 'low'; position: string; stance: string }[];
  corners: { depth: 'off' | 'press'; leverage: 'inside' | 'head-up' | 'outside'; stance: string };
  blitzers: string[]; last_scan: { kind: string; text: string }[]; attack: string; reviewed: boolean;
}
export interface RoutineRules {
  clock: number;
  steps: { id: string; name: string; only?: 'pass' | 'run'; when?: string }[];
  down_distance: { yardage: Record<'short' | 'medium' | 'long', [number, number]>; must_convert: number[]; downs: Record<string, number>; first_down_distance: number; distance: [number, number] };
  look_off: { deep_routes: string[] };
  run_check: { can_when_box_exceeds_blockers_by: number };
  defensive_backs: { off_depth: [number, number]; one_presses: number; all_press_man: number };
  faults: { rate: number };
  last_scan: { rate: number };
  situation_from_tags: Record<string, { downs: number[]; distance: [number, number] }>;
  counting: { box_width: number; box_depth: number; blocking_routes: string[] };
  run_lane: { edge_outside_tackle: number; within_depth: number };
}
export interface Content {
  book: Playbook; looks: Looks; rules: RoutineRules; formations: Formations;
  routes: { id: string; waypoints: [number, number][] }[]; halfWidth: number; hashX: number; throwingHand: 'left' | 'right';
}

/** Seeded random numbers (mulberry32). */
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

// ------------------------------------------------------------------ the rep
export type DefRole = 'DL' | 'EDGE' | 'LB' | 'CB' | 'S' | 'N';
export interface Def {
  id: string; role: DefRole; x: number; y: number; num: number; blitz: boolean;
  /** safeties: what he should read (depth and position words); corners: depth word and leverage */
  depth?: string; position?: string; leverage?: string;
}
export interface Situation { down: number; distance: number; yardage: 'short' | 'medium' | 'long'; mustConvert: boolean }
export interface Fault { id: string; kind: 'off-the-line' | 'covered'; y: number }
export interface Change { kind: string; text: string; options: string[] }
export interface Rep {
  index: number; seed: number;
  play: TeamPlay; look: Look; situation: Situation;
  offense: Placed[]; defense: Def[]; after: Def[] | null; change: Change | null; fault: Fault | null;
  coverageMan: boolean; press: 'none' | 'one' | 'all';
  isRun: boolean; reviewed: boolean;
  keys: Keys;
}

const MAN = new Set(['cover-0', 'cover-1', 'cover-1-robber', 'two-man']);
const RUN_KINDS = new Set(['run']);
const sgn = (x: number) => (x < 0 ? -1 : 1);

/** The receivers on one side, outside in (#1, #2, #3): everyone not a lineman, the QB or a back behind him. */
export function receivers(offense: Placed[], side: -1 | 1): Placed[] {
  return offense
    .filter((q) => !q.lineman && !q.ghost && q.id !== 'QB' && Math.sign(q.x) === side && Math.abs(q.x) > 3)
    .sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
}

/** Deal one rep: a play from the playbook, a look for its group, a situation, maybe an alignment fault and a change. */
export function dealRep(C: Content, seed: number, index: number, opts: { playtest: boolean; only?: string } = { playtest: false }): Rep | null {
  const r = rng(seed * 7919 + index * 104729 + 31);
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)]!;
  const plays = C.book.plays.filter((p) => active(p) && (!opts.only || p.id === opts.only));
  for (let attempt = 0; attempt < 50; attempt++) {
    const play = resolve(C.book, pick(plays).id);
    const group = Object.entries(C.looks.groups).find(([, g]) => g.plays.includes(play.number))?.[0];
    const looks = C.looks.looks.filter((l) => group && l.groups.includes(group));
    if (!looks.length) continue;
    const look = pick(looks);
    const reviewed = play.reviewed === true && look.reviewed === true;
    if (!reviewed && !opts.playtest) continue;
    return build(C, play, look, r, seed, index, reviewed);
  }
  return null;
}

/** A rep for a given play and look (the answer editor, tests). */
export function repFor(C: Content, playId: string, lookId: string, seed = 1): Rep {
  const play = resolve(C.book, playId), look = C.looks.looks.find((l) => l.id === lookId)!;
  return build(C, play, look, rng(seed), seed, 0, play.reviewed === true && look.reviewed === true);
}

function build(C: Content, play: TeamPlay, look: Look, r: () => number, seed: number, index: number, reviewed: boolean): Rep {
  const R = C.rules;
  const situation = situationFor(R, play, r);
  const offense = place(C.book, C.formations, play, C.halfWidth);
  // the defensive backs (owner: usually 5-7 off; about every 4th-5th play one presses; 5% all press man)
  const u = r();
  const press: Rep['press'] = look.corners.depth === 'press' ? 'all' : u < R.defensive_backs.all_press_man ? 'all' : u < R.defensive_backs.all_press_man + R.defensive_backs.one_presses ? 'one' : 'none';
  const coverageMan = MAN.has(look.coverage) || (press === 'all' && look.corners.depth !== 'press');
  const defense = placeDefense(C, look, offense, press, r);
  // an alignment fault on 30% of reps (owner): one receiver steps off or onto the line
  let fault: Fault | null = null;
  if (r() < R.faults.rate) {
    const opts: Fault[] = [];
    for (const q of offense) {
      if (q.lineman || q.ghost || q.id === 'QB') continue;
      const spot = play.players[q.id];
      if (!spot) continue;
      if (q.onLine && spot.align === 'wide') opts.push({ id: q.id, kind: 'off-the-line', y: q.y - 1 });
      else if (!q.onLine && ['slot', 'inside-slot', 'wide'].includes(spot.align)) opts.push({ id: q.id, kind: 'covered', y: -0.7 });
    }
    if (opts.length) fault = opts[Math.floor(r() * opts.length)]!;
  }
  // the last scan: on some reps the look changes while he works
  let change: Change | null = null, after: Def[] | null = null;
  if (look.last_scan.length && r() < R.last_scan.rate) {
    const c = look.last_scan[Math.floor(r() * look.last_scan.length)]!;
    after = applyChange(C, c.kind, defense, offense);
    if (after) {
      const pool = [...new Set(C.looks.looks.flatMap((l) => l.last_scan.map((x) => x.text)))].filter((t) => t !== c.text);
      const others: string[] = [];
      while (others.length < 2 && pool.length) others.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!);
      const options = [c.text, ...others].sort(() => r() - 0.5);
      change = { kind: c.kind, text: c.text, options };
    }
  }
  const rep: Rep = { index, seed, play, look, situation, offense, defense, after, change, fault, coverageMan, press, isRun: RUN_KINDS.has(play.kind), reviewed, keys: {} as Keys };
  rep.keys = answerKeys(C, rep, r);
  return rep;
}

function situationFor(R: RoutineRules, play: TeamPlay, r: () => number): Situation {
  const tagged = (play.tags ?? []).map((t) => R.situation_from_tags[t]).filter(Boolean);
  let down: number, distance: number;
  if (tagged.length) {
    const t = tagged[Math.floor(r() * tagged.length)]!;
    down = t.downs[Math.floor(r() * t.downs.length)]!;
    distance = t.distance[0] + Math.floor(r() * (t.distance[1] - t.distance[0] + 1));
  } else {
    const w = Object.entries(R.down_distance.downs);
    let x = r() * w.reduce((a, [, v]) => a + v, 0);
    down = Number((w.find(([, v]) => (x -= v) <= 0) ?? w[0]!)[0]);
    const [lo, hi] = R.down_distance.distance;
    distance = down === 1 ? R.down_distance.first_down_distance : lo + Math.floor(r() * (hi - lo + 1));
  }
  const Y = R.down_distance.yardage;
  const yardage = distance <= Y.short[1] ? 'short' : distance <= Y.medium[1] ? 'medium' : 'long';
  return { down, distance, yardage, mustConvert: R.down_distance.must_convert.includes(down) };
}

// ------------------------------------------------------------------ the defense
function placeDefense(C: Content, look: Look, offense: Placed[], press: Rep['press'], r: () => number): Def[] {
  const P = C.looks.placement, front = C.looks.fronts.find((f) => f.id === look.front)!;
  const recR = receivers(offense, 1), recL = receivers(offense, -1);
  const strong: -1 | 1 = recL.length > recR.length ? -1 : 1;
  const out: Def[] = [];
  const nums = new Set<number>();
  const num = () => { let n: number; do n = 2 + Math.floor(r() * 97); while (nums.has(n)); nums.add(n); return n; };
  front.dl.forEach((x, k) => out.push({ id: `DL${k + 1}`, role: 'DL', x: x * strong, y: P.line_depth, num: num(), blitz: false }));
  (front.edges ?? []).forEach(([x, y], k) => out.push({ id: `E${k + 1}`, role: 'EDGE', x: x * strong, y, num: num(), blitz: false }));
  front.lbs.forEach(([x, y], k) => out.push({ id: `LB${k + 1}`, role: 'LB', x: x * strong, y, num: num(), blitz: false }));
  // safeties
  const two = (s: -1 | 1) => (s === 1 ? recR : recL)[1];
  look.safeties.forEach((sp, k) => {
    const side: -1 | 1 = look.safeties.length === 1 ? strong : k === 0 ? (-strong as -1 | 1) : strong;
    let x = 0;
    if (sp.position === 'hash') x = side * C.hashX;
    else if (sp.position === 'middle') x = 0;
    else if (sp.position === 'box') x = side * P.safety_x.box!;
    else if (sp.position === 'shaded') x = strong * P.safety_x.shaded!;
    else if (sp.position === 'over-2') { const q = two(side); x = q ? q.x : side * 6; }   // no #2 on his side: the apex
    out.push({ id: `S${k + 1}`, role: 'S', x, y: P.safety_depth[sp.depth], num: num(), blitz: false, depth: sp.depth, position: sp.position === 'shaded' ? 'middle' : sp.position });
  });
  // a nickel (5 defensive backs): over #2 on the side without an over-2 safety
  if (front.dbs === 5) {
    const taken = out.filter((d) => d.position === 'over-2').map((d) => Math.sign(d.x));
    const side: -1 | 1 = taken.includes(strong) ? (-strong as -1 | 1) : strong;
    const q = two(side);
    out.push({ id: 'N', role: 'N', x: q ? q.x - side * P.nickel.inside_of_2 : side * 6, y: P.nickel.depth, num: num(), blitz: false });
  }
  // corners over #1 on each side
  const onePress = press === 'one' ? (r() < 0.5 ? -1 : 1) : 0;
  for (const side of [-1, 1] as const) {
    const n1 = (side === 1 ? recR : recL)[0];
    const pressed = press === 'all' || onePress === side;
    const lev = pressed && press === 'all' && look.corners.depth !== 'press' ? 'inside' : look.corners.leverage;
    const bx = n1 ? n1.x : side * 12;
    const dx = lev === 'inside' ? -side * P.corner.leverage : lev === 'outside' ? side * P.corner.leverage : 0;
    const off = C.rules.defensive_backs.off_depth;
    const y = pressed ? P.corner.press : off[0] + Math.round(r() * (off[1] - off[0]));
    out.push({ id: side < 0 ? 'CBL' : 'CBR', role: 'CB', x: bx + dx, y, num: num(), blitz: false, depth: pressed ? 'press' : 'off', leverage: lev });
  }
  // blitzers creep (the tell)
  const blind: -1 | 1 = C.throwingHand === 'left' ? 1 : -1;
  const lbs = out.filter((d) => d.role === 'LB');
  const mark = (d?: Def) => { if (d) { d.blitz = true; if (d.role !== 'EDGE') d.y = Math.min(d.y, P.creep); } };
  for (const b of look.blitzers) {
    if (b === 'lb-all') lbs.forEach(mark);
    else if (b === 'lb-middle') mark([...lbs].sort((a, c) => Math.abs(a.x) - Math.abs(c.x))[0]);
    else if (b === 'lb-strong') mark([...lbs].sort((a, c) => c.x * strong - a.x * strong)[0]);
    else if (b === 'lb-outside') mark([...lbs].sort((a, c) => c.x * blind - a.x * blind)[0]);
    else if (b === 'safety-1') mark(out.find((d) => d.role === 'S'));
    else if (b === 'nickel') mark(out.find((d) => d.role === 'N'));
    else if (b === 'edge-blind') mark(out.find((d) => d.role === 'EDGE' && Math.sign(d.x) === blind));
  }
  return out;
}

/** The look after a last-scan change (null if it cannot happen against this formation). */
function applyChange(C: Content, kind: string, def: Def[], offense: Placed[]): Def[] | null {
  const P = C.looks.placement;
  const d = def.map((x) => ({ ...x }));
  const S = d.filter((x) => x.role === 'S');
  const recOf = (s: number) => receivers(offense, s < 0 ? -1 : 1);
  switch (kind) {
    case 'rotate-down': { const s = S.find((x) => x.depth === 'deep'); if (!s || S.filter((x) => x.depth === 'deep').length < 2) return null; const q = recOf(s.x)[1]; s.depth = 'low'; s.position = 'over-2'; s.y = P.safety_depth.low; s.x = q ? q.x : sgn(s.x) * 6; const o = S.find((x) => x !== s); if (o) { o.x = 0; o.position = 'middle'; } return d; }
    case 'rotate-up': { const s = S.find((x) => x.depth !== 'deep'); if (!s) return null; s.depth = 'deep'; s.y = P.safety_depth.deep; s.x = sgn(s.x) * C.hashX; s.position = 'hash'; for (const o of S) if (o !== s && o.depth === 'deep') { o.x = -sgn(s.x) * C.hashX; o.position = 'hash'; } return d; }
    case 'corners-press': { const cs = d.filter((x) => x.role === 'CB' && x.depth !== 'press'); if (!cs.length) return null; for (const c of cs) { c.y = P.corner.press; c.depth = 'press'; } return d; }
    case 'corners-off': { const cs = d.filter((x) => x.role === 'CB' && x.depth === 'press'); if (!cs.length) return null; for (const c of cs) { c.y = C.rules.defensive_backs.off_depth[1]; c.depth = 'off'; } return d; }
    case 'corner-cloud': { const c = d.find((x) => x.role === 'CB' && x.depth !== 'press'); if (!c) return null; c.y = P.corner.cloud; c.depth = 'cloud'; c.x += sgn(c.x) * P.corner.leverage; c.leverage = 'outside'; return d; }
    case 'lb-creep': { const l = d.find((x) => x.role === 'LB' && !x.blitz); if (!l) return null; l.blitz = true; l.y = P.creep; return d; }
    case 'nickel-creep': { const n = d.find((x) => x.role === 'N' && !x.blitz); if (!n) return null; n.blitz = true; n.y = P.creep; n.x = sgn(n.x) * Math.max(3.5, Math.abs(n.x) - 3); return d; }
    case 'blitzers-back': { const b = d.filter((x) => x.blitz); if (!b.length) return null; for (const x of b) { x.blitz = false; x.y = x.role === 'S' ? P.safety_depth.middle : 4.5; } return d; }
    case 'safety-down': { const s = S.find((x) => x.depth !== 'low'); if (!s) return null; s.depth = 'low'; s.position = 'box'; s.y = P.safety_depth.low - 1; s.x = sgn(s.x || 1) * P.safety_x.box!; return d; }
    default: return null;
  }
}

// ------------------------------------------------------------------ the answer keys
export interface Keys {
  yardage: Situation['yardage']; mustConvert: boolean;
  alignment: string;                                   // the player out of place, or 'ok'
  safeties: { id: string; depth: string; position: string }[];
  corners: { id: string; depth: string; leverage: string }[];
  down: number; edges: string[]; linebackers: number; blitzers: string[];
  protection: 'enough' | 'free';                       // can we block every rusher?
  runCheck: 'yes' | 'can-to-pass' | null;              // run plays only
  reads: string[] | null; readsGraded: boolean;        // pass plays: his reads in order (null: not a read play)
  side: 'left' | 'right' | null;                       // pick-a-side plays graded by number advantage
  lookOff: { safety: string | null; first: 'left' | 'right'; target: string } | null;
  footwork: string | null;
  key: string | null; keyChoices: string[];
  runLane: 'left' | 'right';
  lastScan: 'same' | string;                           // 'same', or the change's text
}

const PREC = ['must_convert_long', 'must_convert', 'short', 'medium', 'long', 'deep', 'press_man', 'press', 'blitz', 'loaded_box', 'man', 'zone', 'default'];
/** A value that depends on the situation (owner's answers): the first key that applies, in PREC order. */
export function bySituation(v: unknown, ctx: Set<string>): unknown {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  for (const k of PREC) if (k in o && (ctx.has(k) || k === 'default')) return bySituation(o[k], ctx);
  return undefined;
}

function answerKeys(C: Content, rep: Rep, r: () => number): Keys {
  const { play, defense: D, offense: O, situation: sit } = rep;
  const R = C.rules;
  const ctx = new Set<string>([sit.yardage]);
  if (sit.yardage === 'long') ctx.add('deep');
  if (sit.mustConvert) { ctx.add('must_convert'); if (sit.yardage === 'long') ctx.add('must_convert_long'); }
  if (rep.press !== 'none') { ctx.add('press'); if (rep.coverageMan) ctx.add('press_man'); }
  if (D.some((d) => d.blitz)) ctx.add('blitz');
  ctx.add(rep.coverageMan ? 'man' : 'zone');
  const inBox = (d: Def) => Math.abs(d.x) <= R.counting.box_width && d.y <= R.counting.box_depth;
  const box = D.filter((d) => d.role !== 'CB' && inBox(d));
  if (box.length >= 8) ctx.add('loaded_box');
  // edges: the outermost rusher on each side (a down lineman, or a stand-up edge)
  const front = D.filter((d) => d.role === 'DL' || d.role === 'EDGE');
  const edges = [-1, 1].map((s) => front.filter((d) => Math.sign(d.x) === s).sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0]?.id).filter(Boolean) as string[];
  // blockers: the line plus everyone whose job is to block (content: counting.blocking_routes), a back or a tight end with no route
  const blockers = 5 + O.filter((q) => !q.lineman && !q.ghost && q.id !== 'QB').filter((q) => {
    const rt = play.routes[q.id]?.route;
    if (rt) return R.counting.blocking_routes.includes(rt);
    const a = play.players[q.id]?.align ?? '';
    return ['attached', 'wing', 'beside-qb', 'i-back', 'fullback', 'pistol-back', 'up-back', 'spot'].includes(a) && play.ball !== q.id;
  }).length;
  const rushers = front.length + D.filter((d) => d.blitz && d.role !== 'EDGE' && d.role !== 'DL').length;
  // reads
  const readsRaw = bySituation(play.reads, ctx);
  const pickSide = play.reads && typeof play.reads === 'object' && !Array.isArray(play.reads) && 'pick_side' in (play.reads as object) ? (play.reads as { pick_side: unknown }).pick_side : null;
  let side: Keys['side'] = null;
  if (pickSide === 'number-advantage') {
    const adv = (s: -1 | 1) => receivers(O, s).length - D.filter((d) => (d.role === 'CB' || d.role === 'S' || d.role === 'N') && Math.sign(d.x) === s && Math.abs(d.x) > 3).length;
    side = adv(-1) > adv(1) ? 'left' : 'right';
  }
  const reads = Array.isArray(readsRaw) ? (readsRaw as string[]) : null;
  const passy = !rep.isRun;
  // the look-off: his first deep read, and the deep safety on that side
  let lookOff: Keys['lookOff'] = null;
  if (passy && reads) {
    const deep = reads.find((id) => R.look_off.deep_routes.includes(play.routes[id]?.route ?? ''));
    if (deep) {
      const from = routeStart(O, deep);
      const path = from ? routePath(C.book, C.routes, play, from, play.routes[deep]!) : null;
      const end = path ? path[path.length - 1]![0] : (from?.x ?? 0);
      const deepS = D.filter((d) => d.role === 'S' && d.depth === 'deep');
      const safety = deepS.length === 1 ? deepS[0]!.id : deepS.length ? [...deepS].sort((a, b) => Math.abs(a.x - end) - Math.abs(b.x - end))[0]!.id : null;
      lookOff = { safety, first: end < 0 ? 'right' : 'left', target: deep };
    }
  }
  const footRaw = bySituation(play.footwork, ctx);
  const keyRaw = bySituation(play.key, ctx);
  const key = typeof keyRaw === 'string' ? keyRaw : null;
  const keyPool = [...new Set(C.book.plays.filter(active).map((p) => resolve(C.book, p.id).key).flatMap((k) => (typeof k === 'string' ? [k] : k && typeof k === 'object' ? Object.values(k as Record<string, string>) : [])))].filter((k) => k !== key);
  const keyChoices = key ? [key, ...pickN(keyPool, 2, r)].sort(() => r() - 0.5) : [];
  // run lane: toward his throwing hand unless more edge defenders show there
  const hand = C.throwingHand === 'left' ? -1 : 1;
  const edgeOn = (s: number) => D.filter((d) => Math.sign(d.x) === s && Math.abs(d.x) > 2 * 1.4 + R.run_lane.edge_outside_tackle && d.y <= R.run_lane.within_depth).length;
  const lane = edgeOn(hand) > edgeOn(-hand) ? -hand : hand;
  return {
    yardage: sit.yardage, mustConvert: sit.mustConvert,
    alignment: rep.fault ? rep.fault.id : 'ok',
    safeties: D.filter((d) => d.role === 'S').sort((a, b) => a.x - b.x).map((d) => ({ id: d.id, depth: d.depth!, position: d.position! })),
    corners: D.filter((d) => d.role === 'CB').sort((a, b) => a.x - b.x).map((d) => ({ id: d.id, depth: d.depth!, leverage: d.leverage! })),
    down: D.filter((d) => d.role === 'DL').length, edges, linebackers: D.filter((d) => d.role === 'LB').length,
    blitzers: D.filter((d) => d.blitz).map((d) => d.id).sort(),
    protection: rushers > blockers ? 'free' : 'enough',
    runCheck: rep.isRun ? (box.length > blockers + R.run_check.can_when_box_exceeds_blockers_by ? 'can-to-pass' : 'yes') : null,
    reads: passy ? reads : null, readsGraded: passy && !!reads, side,
    lookOff, footwork: passy && typeof footRaw === 'string' ? footRaw : null,
    key, keyChoices, runLane: lane < 0 ? 'left' : 'right',
    lastScan: rep.change ? rep.change.text : 'same',
  };
}
function pickN<T>(list: T[], n: number, r: () => number): T[] {
  const pool = [...list], out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!);
  return out;
}

// ------------------------------------------------------------------ the steps of this rep, and grading
export function stepsFor(C: Content, rep: Rep): string[] {
  return C.rules.steps.filter((s) => {
    if (s.only === 'pass' && rep.isRun) return false;
    if (s.only === 'run' && !rep.isRun) return false;
    if (s.id === 'look-off' && !rep.keys.lookOff) return false;
    if (s.id === 'reads' && !rep.keys.reads && !rep.keys.side && !rep.isRun) return true;
    if (s.id === 'footwork' && !rep.keys.footwork) return false;
    if (s.id === 'key' && !rep.keys.key) return false;
    return true;
  }).map((s) => s.id);
}

/** Owner overrides from the answer editor: per play, per look (or '*' for every look), per answer. */
export type Overrides = Record<string, Record<string, Partial<Pick<Keys, 'reads' | 'footwork' | 'runCheck' | 'key' | 'runLane' | 'protection'>>>>;
export function withOverrides(rep: Rep, ov: Overrides | null | undefined): Rep {
  const o = { ...(ov?.[rep.play.id]?.['*'] ?? {}), ...(ov?.[rep.play.id]?.[rep.look.id] ?? {}) };
  if (!Object.keys(o).length) return rep;
  const keys = { ...rep.keys, ...o } as Keys;
  if (o.reads) keys.readsGraded = true;
  if (o.key && !keys.keyChoices.includes(o.key)) keys.keyChoices = [o.key, ...keys.keyChoices.filter((k) => k !== rep.keys.key)].slice(0, 3);
  return { ...rep, keys };
}

/** The routine content from the raw content files (src/content/load.ts keys). */
export function contentFrom(raw: Record<string, unknown>): Content {
  const geo = raw.geometry as { field: { width: number; hash_from_sideline: number } };
  return {
    book: raw.playbook as Playbook, looks: raw.looks as Looks, rules: raw.routine2 as RoutineRules,
    formations: raw.formations as Formations, routes: (raw.routes as { routes: Content['routes'] }).routes,
    halfWidth: geo.field.width / 2, hashX: geo.field.width / 2 - geo.field.hash_from_sideline,
    throwingHand: (raw.quarterback as { throwing_hand: 'left' | 'right' }).throwing_hand,
  };
}
