// His-eyes renderer (PRD §7.5, §14.3, §15.1 Look B): natural lens from the quarterback's eyes, puppet players,
// his own players see-through, a look strip that always shows where he is looking. Ported from the Phase 0 style
// frame; positions now come from the play engine (no hand-placed players).

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angTo = (x, y, tx, ty) => Math.atan2(tx - x, ty - y);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const ease = (a, b, t, t0, t1) => { const u = clamp((t - t0) / (t1 - t0), 0, 1); return a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * u)); };

// receiver shapes on the field and on his throw buttons (PRD §7.4)
export const SHAPES = { X: '◆', Y: '●', Z: '▲', H: '■', R: '★', F: '✚' };

const STYLE = {
  sky: ['#E3E7EB', '#E3E7EB'], oob: '#BAC3BA', turf: ['#CAD4C7', '#C2CDBF'], endzone: '#BFC9BB', line: '#FFFFFF', num: 'rgba(255,255,255,0.95)',
  los: '#1F5FD1', goal: '#5B6573', shadow: 'rgba(28,36,48,0.17)', edgeW: 1.5, ownAlpha: 0.6,
  D: { jersey: '#FFFFFF', edge: '#C94A16', num: '#C94A16', pants: '#F3E7E0', socks: '#C94A16', shoe: '#1C2430', under: '#F0DDD3', glove: '#C94A16', helmet: '#C94A16', helmetHi: 'rgba(255,255,255,0.22)', mask: '#1C2430', stripe: '#FFFFFF' },
  O: { jersey: '#E3ECFB', edge: '#1F5FD1', num: '#1F5FD1', pants: '#EEF3FC', socks: '#1F5FD1', shoe: '#1C2430', under: '#D6E2F7', glove: '#1F5FD1', helmet: '#1F5FD1', helmetHi: 'rgba(255,255,255,0.22)', mask: '#1C2430', stripe: '#FFFFFF' },
  tag: { bg: '#FFFFFF', fg: '#8A2E0A', ofg: '#173F8F', obg: '#FFFFFF', border: '#C94A16', oborder: '#1F5FD1' },
  hands: { glove: '#FFFFFF', sleeve: 'rgba(31,95,209,0.30)', edge: '#1F5FD1' }, ball: '#8A5A3C', lace: '#FFFFFF'
};
const SIZE = { OL: 1.92, C: 1.9, DL: 1.92, BLZ: 1.86, LB: 1.88, CB: 1.82, CBpress: 1.82, S: 1.84, WR: 1.84, TE: 1.9, RB: 1.8 };
const FONT = 'Archivo, "Helvetica Neue", Arial, sans-serif';

// ---------------------------------------------------------------- scene from a rep
const LINE = new Set(['LT', 'LG', 'C', 'RG', 'RT']);
function poseRole(play, t) {
  if (t.team === 'O') {
    if (LINE.has(t.id)) return t.id === 'C' ? 'C' : 'OL';
    if (t.id === 'R' || t.id === 'F') return 'RB';
    const spot = play.offense.formation.players[t.id];
    return t.id === 'Y' && spot && spot.align === 'attached' ? 'TE' : 'WR';
  }
  const d = play.defense.players.find((p) => p.role === t.id);
  if (d.group === 'dl') return 'DL';
  if (d.job.kind === 'rush') return 'BLZ';
  if (d.role.startsWith('cb')) return d.align === 'press' ? 'CBpress' : 'CB';
  if (d.role === 'ss' || d.role === 'fs') return 'S';
  return 'LB';
}

/**
 * Build the renderer's scene for a rep. opts.fault: a receiver lined up wrong until the snap (shown where he stands,
 * then he resets); opts.readId: his first read, where his eyes go after the first stop; opts.turnAt: when they
 * start to turn (the first stop); opts.aimAt: the moment they are aimed to keep his read in the middle of his view
 * (the second stop).
 */
export function sceneFor(rep, opts = {}) {
  const play = rep.play, sim = play.sim, fr = play.offense.frame;
  const track = (id) => sim.tracks.find((t) => t.id === id);
  const posFn = (tr) => (t) => {
    const f = clamp((t - sim.tStart) / sim.dt, 0, sim.steps), k = Math.floor(f), k2 = Math.min(sim.steps, k + 1), u = f - k;
    return [tr.xs[k] + (tr.xs[k2] - tr.xs[k]) * u, tr.ys[k] + (tr.ys[k2] - tr.ys[k]) * u];
  };
  const qb = posFn(track('QB'));
  const fault = opts.fault || null;
  const withFault = (t, f) => (fault && t.id === fault.id ? (tt) => { const q = f(tt); return tt < 0 ? [q[0], fault.y] : q; } : f);
  const players = sim.tracks.filter((t) => t.id !== 'QB').map((t) => ({
    id: t.id, side: t.team, role: poseRole(play, t), num: t.number, label: t.team === 'O' ? (SHAPES[t.id] ? SHAPES[t.id] + ' ' + t.id : '') : String(t.number),
    pos: withFault(t, posFn(t)),
    lookT: 0.9, engT: null, mate: null,
  }));
  const byId = {}; players.forEach((p) => { byId[p.id] = p; });
  // blocks: a rusher and his blocker lock up when the rusher stops at the meeting point
  for (const r of sim.rushers) {
    if (!r.blocker || !byId[r.blocker] || !byId[r.role]) continue;
    const p = byId[r.role];
    let te = 0.7;
    for (let t = 0.2; t < 2.5; t += 0.05) { const a = p.pos(t), b = p.pos(t + 0.05); if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.02) { te = t; break; } }
    p.engT = te; p.mate = r.blocker; byId[r.blocker].engT = te; byId[r.blocker].mate = r.role;
  }
  const S = {
    rep, players, byId,
    field: { xl: fr.leftSideline, xr: fr.rightSideline, hashes: [fr.leftHash, fr.rightHash], los: 35 },
    // the frozen look at the line is the moment before the snap; the play runs from the cadence to the freeze
    T0: -1.2, T1: Math.min(sim.steps * sim.dt + sim.tStart, rep.freeze2 + 1.9),
    cam: (t) => {
      if (S.runFrom != null && t > S.runFrom) { const q = qb(S.runFrom), d = Math.min(9, 6 * (t - S.runFrom)); return { x: q[0], y: q[1] + d, eye: 1.64 }; }
      const q = qb(t); return { x: q[0], y: q[1], eye: 1.64 };
    },
    Tt: Infinity, Tc: Infinity, target: null, catchPt: null, release: null, runFrom: null, yawOverride: null,
  };
  // his first read sets his eyes after the first stop (PRD §7.5): aimed so the read is in the middle of his view at
  // the second stop; until then he looks where he looked at the line
  S.readId = opts.readId && byId[opts.readId] ? opts.readId : null;
  const rd = byId[S.readId];
  S.readText = rd ? 'Eyes → ' + rd.label + ', your first read' : '';
  S.turnAt = opts.turnAt ?? 0.2;
  const aimAt = opts.aimAt ?? S.turnAt + 1;
  if (rd) { const rp = rd.pos(aimAt), rc = S.cam(aimAt); S.yawRead = clamp(Math.atan2(rp[0] - rc.x, rp[1] - rc.y), -1.25, 1.25); }
  S.yaw = (t) => {
    const read = S.yawRead ?? (S.yawPre || 0);
    if (S.runFrom != null && t > S.runFrom) return ease(read, 0, t, S.runFrom, S.runFrom + 0.4);
    if (t < S.turnAt) return S.yawPre || 0;
    if (t < S.Tt) return ease(S.yawHold ?? (S.yawPre || 0), read, t, S.turnAt, S.turnAt + 0.45);
    return ease(read, S.yawThrow, t, S.Tt, S.Tt + 0.45);
  };
  precompute(S);
  return S;
}

/**
 * A live scene for Pocket Instinct (src/instinct): his line, the rushers, the allies and their shadows, with their
 * positions from the snap simulation as it runs (frames are filled in by extendInstinct). His eyes look straight
 * downfield unless he turns his head.
 */
export function instinctScene(sim) {
  const c = sim.c, snap = sim.snap, fr = snap.frame;
  const at = (id) => (t) => { const q = sim.pos(id, t); return [q.x, q.y]; };
  const players = [];
  for (const id of ['LT', 'LG', 'C', 'RG', 'RT']) players.push({ id, side: 'O', role: id === 'C' ? 'C' : 'OL', num: { LT: 77, LG: 64, C: 55, RG: 66, RT: 75 }[id], label: '', pos: at(id), lookT: 0.9 });
  for (const a of snap.allies) {
    players.push({ id: a.id, side: 'O', role: 'WR', num: { X: 1, Y: 88, Z: 11, H: 2, R: 22 }[a.id], label: SHAPES[a.id] + ' ' + a.id, pos: at(a.id), lookT: 0.4 });
    players.push({ id: 'S-' + a.id, side: 'D', role: 'CB', num: 20 + snap.allies.indexOf(a), label: '', pos: at('S-' + a.id), lookT: 0 });
  }
  for (const h of snap.hitters) {
    const p = { id: h.id, side: 'D', role: h.kind === 'free' ? 'BLZ' : h.kind === 'drop' ? 'LB' : 'DL', num: h.number, label: String(h.number), pos: at(h.id), lookT: 0 };
    if (h.blocker) { p.engT = c.instinct.rush.meet; p.mate = h.blocker; }
    players.push(p);
  }
  const byId = {}; players.forEach((p) => { byId[p.id] = p; });
  for (const h of snap.hitters) if (h.blocker && byId[h.blocker]) { byId[h.blocker].engT = c.instinct.rush.meet; byId[h.blocker].mate = h.id; }
  const S = {
    players, byId, live: true, isim: sim,
    field: { xl: fr.leftSideline, xr: fr.rightSideline, hashes: [fr.leftHash, fr.rightHash], los: 35 },
    T0: -0.6, T1: c.instinct.snap.max_time + 2,
    cam: (t) => { const q = sim.pos('QB', t); return { x: q.x, y: q.y, eye: 1.64 }; },
    Tt: Infinity, Tc: Infinity, target: null, catchPt: null, release: null, runFrom: null, yawOverride: null,
    readId: null, readText: '', turnAt: Infinity, yawPre: 0, yaw: () => 0,
  };
  initFrames(S);
  return S;
}
export function extendInstinct(S, t) {
  for (const l of S.isim.hitters) {
    if (l.relT == null) continue;
    const p = S.byId[l.h.id]; if (p) p.relT = l.relT;
    if (l.h.blocker && S.byId[l.h.blocker]) S.byId[l.h.blocker].relT = l.relT;
  }
  extendFrames(S, t);
}

/** He keeps it and runs from time t. */
export function setRun(S, t) {
  S.runFrom = t;
  S.T1 = Math.min(t + 1.6, S.rep.play.sim.steps * S.rep.play.sim.dt + S.rep.play.sim.tStart);
  precompute(S);
}

/** He rolls out from time t toward `side` (-1 left, +1 right): out of the pocket toward his escape lane. */
export function setRollOut(S, t, side) {
  const base = S.cam;
  S.cam = (tt) => { const c = base(tt); if (tt <= t) return c; const u = Math.min(1, (tt - t) / 1.2); return { x: c.x + side * 5 * u, y: c.y - 0.5 * u, eye: c.eye }; };
  S.T1 = Math.min(t + 1.4, S.rep.play.sim.steps * S.rep.play.sim.dt + S.rep.play.sim.tStart);
  precompute(S);
}

/** He throws: to `id` (null for a throwaway), the ball leaving his hand at `release` and arriving at `catchT` at `catchAt`. */
export function setThrow(S, id, release, catchT, catchAt) {
  const c = S.cam(release);
  S.Tt = release; S.Tc = catchT; S.target = id; S.catchPt = [catchAt.x, catchAt.y];
  S.release = [c.x - 0.3, c.y + 0.3, 1.95];
  S.yawThrow = Math.atan2(S.catchPt[0] - S.release[0], S.catchPt[1] - S.release[1]) * 0.85;
  if (S.live) return; // live frames pick the throw up as they are filled in
  S.T1 = Math.max(S.T1, Math.min(catchT + 0.7, S.rep.play.sim.steps * S.rep.play.sim.dt + S.rep.play.sim.tStart));
  precompute(S);
}

function ballAt(S, t) {
  if (t < 0) return { mode: 'ground', p: [0.05, 0.05, 0.12] };
  if (t < 0.3) {
    const c = S.cam(t), u = t / 0.3, a = [0, -0.35, 0.3], b = [c.x, c.y + 0.5, 1.1];
    return { mode: 'air', p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u + 0.25 * Math.sin(Math.PI * u)] };
  }
  if (t < S.Tt) return { mode: 'hands' };
  if (t < S.Tc) {
    const u = (t - S.Tt) / (S.Tc - S.Tt), a = S.release, cp = S.catchPt, D = Math.hypot(cp[0] - a[0], cp[1] - a[1]);
    return { mode: 'air', p: [a[0] + (cp[0] - a[0]) * u, a[1] + (cp[1] - a[1]) * u, a[2] + (1.3 - a[2]) * u + 4 * 0.07 * D * u * (1 - u)] };
  }
  return S.target ? { mode: 'caught' } : { mode: 'ground', p: [S.catchPt[0], S.catchPt[1], 0.12] };
}

// ---------------------------------------------------------------- pose model (fixed step, deterministic)
const DT = 1 / 120;
const HANDS = {
  ready: [['c', -0.2, 0.3, -0.45], ['c', 0.2, 0.3, -0.45]], punch: [['c', -0.17, 0.42, -0.38], ['c', 0.17, 0.42, -0.38]],
  engaged: [['c', -0.16, 0.6, -0.33], ['c', 0.16, 0.6, -0.33]], threept: [['p', -0.24, 0.45, -0.15], ['g', 0.16, 0.72, 0.03]],
  kneesWR: [['c', -0.22, 0.25, -0.62], ['c', 0.24, -0.25, -0.55]], knees: [['p', -0.19, 0.3, -0.3], ['p', 0.19, 0.3, -0.3]],
  waist: [['p', -0.24, 0.12, -0.1], ['p', 0.24, 0.12, -0.1]], target: [['c', -0.14, 0.36, -0.2], ['c', 0.14, 0.36, -0.2]],
  swat: [['c', -0.18, 0.25, 0.7], ['c', 0.2, 0.3, 0.6]], carry: [['c', -0.02, 0.2, -0.5], ['c', 0.12, 0.22, -0.55]],
  run: [['c', -0.22, 0.05, -0.6], ['c', 0.22, 0.05, -0.6]]
};
function bodyRefs(cr, le, sit) { const pz = 0.98 - 0.36 * cr, pb = -0.1 * sit; return { pz, pb, cb: pb + Math.sin(le) * 0.56, cz: pz + Math.cos(le) * 0.56 }; }
function resolveHands(mode, cr, le, sit) {
  const R = bodyRefs(cr, le, sit), out = [];
  for (const [ref, a, b, z] of (HANDS[mode] || HANDS.ready)) {
    if (ref === 'c') out.push(a, R.cb + b, R.cz + z); else if (ref === 'p') out.push(a, R.pb + b, R.pz + z); else out.push(a, b, z);
  }
  return out;
}

function rules(S, p, t, q, v, cam, posNow, ball) {
  const sp = Math.hypot(v[0], v[1]);
  const toQB = angTo(q[0], q[1], cam.x, cam.y);
  const mv = sp > 0.3 ? Math.atan2(v[0], v[1]) : null;
  const look = (e) => {
    if (!e || e === 'QB') return toQB;
    if (e === 'ball') return ball.mode === 'air' ? angTo(q[0], q[1], ball.p[0], ball.p[1]) : toQB;
    const o = posNow[e]; return o ? angTo(q[0], q[1], o[0], o[1]) : toQB;
  };
  const thrown = t > S.Tt + 0.12, caught = t > S.Tc;
  const engaged = p.engT != null && t >= p.engT && (p.relT == null || t < p.relT);
  const o = { face: 0, eye: null, crouch: 0.3, lean: 0.3, sit: 0, stagger: 0, hands: 'ready', run: 0 };
  const runArms = () => clamp((sp - 0.5) / 1.5, 0, 1);
  const pre = t < 0;
  switch (p.role) {
    case 'OL': case 'C':
      o.face = 0;
      if (pre) Object.assign(o, { crouch: 1.0, lean: 1.25, stagger: 0.25, hands: 'threept' });
      else { Object.assign(o, { crouch: 0.5, lean: 0.32, hands: engaged ? 'engaged' : 'punch', stagger: 0.12 }); if (p.engT == null && t > 0.8) o.hands = 'ready'; }
      break;
    case 'DL':
      o.face = pre ? Math.PI : (mv != null && !engaged ? mv : toQB); o.eye = look('QB');
      if (pre) Object.assign(o, { crouch: 1.0, lean: 1.25, stagger: 0.25, hands: 'threept' });
      else Object.assign(o, { crouch: 0.38, lean: 0.55, hands: engaged ? 'engaged' : 'ready', run: engaged ? 0 : runArms() });
      if (engaged && thrown && t < S.Tt + 0.55) o.hands = 'swat';
      break;
    case 'BLZ':
      o.face = pre ? toQB : (mv != null && !engaged ? mv : toQB); o.eye = look('QB');
      if (pre) Object.assign(o, { crouch: 0.42, lean: 0.42, hands: 'ready', run: runArms() * 0.4 });
      else Object.assign(o, { crouch: 0.3, lean: 0.5, hands: engaged ? 'engaged' : 'run', run: engaged ? 0 : runArms() });
      break;
    case 'LB':
      o.face = pre || mv == null || sp < 2.5 ? toQB : mv; o.eye = look(thrown ? 'ball' : 'QB');
      Object.assign(o, pre ? { crouch: 0.36, lean: 0.18, sit: 1, hands: 'ready' } : { crouch: 0.3, lean: 0.22, hands: 'ready', run: runArms() });
      break;
    case 'CB': case 'CBpress':
      if (!pre && sp > 2.5 && mv != null) { o.face = mv; o.eye = look(thrown ? 'ball' : 'QB'); Object.assign(o, { crouch: 0.2, lean: 0.35, run: runArms() }); }
      else { o.face = toQB; o.eye = look(thrown ? 'ball' : 'QB'); Object.assign(o, pre ? { crouch: p.role === 'CBpress' ? 0.42 : 0.32, lean: 0.35, stagger: 0.2, hands: 'waist' } : { crouch: 0.32, lean: 0.32, hands: 'waist', run: runArms() * 0.8 }); }
      break;
    case 'S':
      o.eye = look(thrown ? 'ball' : 'QB');
      if (!pre && mv != null && sp > 2.5) { o.face = mv; Object.assign(o, { crouch: 0.15, lean: 0.35, run: runArms() }); }
      else { o.face = toQB; Object.assign(o, { crouch: pre ? 0.16 : 0.3, lean: pre ? 0.14 : 0.3, hands: 'waist', run: runArms() * 0.8 }); }
      break;
    case 'WR': case 'TE': {
      if (pre && sp < 0.5) {
        o.face = 0;
        if (p.role === 'TE') Object.assign(o, { crouch: 1.0, lean: 1.2, stagger: 0.25, hands: 'threept' });
        else Object.assign(o, { crouch: 0.38, lean: 0.55, stagger: 0.32, hands: 'kneesWR' });
        break;
      }
      const looking = t > p.lookT;
      if (caught && p.id === S.target) { o.face = mv != null ? mv : toQB; Object.assign(o, { crouch: 0.2, lean: 0.4, hands: 'carry' }); break; }
      if (mv != null && sp > 1.0) { o.face = mv; o.eye = looking ? look('QB') : null; Object.assign(o, { crouch: 0.12, lean: 0.32, hands: 'run', run: runArms() }); }
      else { o.face = toQB; o.eye = look('QB'); Object.assign(o, { crouch: 0.22, lean: 0.12, hands: looking ? 'target' : 'ready', run: runArms() }); }
      if (p.id === S.target && t > S.Tt && !caught) { o.hands = 'target'; o.run = Math.min(o.run, 0.3); }
      break;
    }
    case 'RB':
      if (pre && sp < 0.5) { o.face = 0; Object.assign(o, { crouch: 0.45, lean: 0.55, hands: 'knees' }); break; }
      if (engaged) { o.face = angTo(q[0], q[1], posNow[p.mate][0], posNow[p.mate][1]); Object.assign(o, { crouch: 0.45, lean: 0.5, hands: 'engaged' }); break; }
      if (caught && p.id === S.target) { o.face = mv != null ? mv : toQB; Object.assign(o, { crouch: 0.2, lean: 0.4, hands: 'carry' }); break; }
      o.face = mv != null && sp > 1 ? mv : toQB; o.eye = look('QB');
      Object.assign(o, { crouch: 0.2, lean: 0.3, hands: sp > 1 ? 'run' : 'ready', run: runArms() });
      break;
  }
  return o;
}

const F_X = 0, F_Y = 1, F_PSI = 2, F_HEAD = 3, F_PH = 4, F_VX = 5, F_VY = 6, F_CR = 7, F_LE = 8, F_SIT = 9, F_ST = 10, F_RUN = 11, F_H = 12, NF = 18;
function precompute(S) {
  initFrames(S);
  extendFrames(S, S.T1);
}
/** Frames are filled in order; a live scene (Pocket Instinct) fills them as its simulation advances. */
function initFrames(S) {
  const N = Math.round((S.T1 - S.T0) / DT) + 1;
  S.data = S.players.map(() => new Float32Array(N * NF));
  S.st = S.players.map(() => null);
  S.cap = N; S.N = 0;
}
function extendFrames(S, upTo) {
  const ps = S.players, n = ps.length, data = S.data, st = S.st;
  const h = 1 / 240;
  const last = Math.min(S.cap - 1, Math.floor((upTo - S.T0) / DT + 1e-6));
  for (let k = S.N; k <= last; k++) {
    const t = S.T0 + k * DT, cam = S.cam(t), ball = ballAt(S, t);
    const posNow = {}; ps.forEach((p) => { posNow[p.id] = p.pos(t); });
    for (let i = 0; i < n; i++) {
      const p = ps[i], q = posNow[p.id];
      // live: the future is not known yet, so the velocity looks back
      const a = p.pos(S.live ? t - 2 * h : t - h), b = S.live ? q : p.pos(t + h), v = [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)];
      const r = rules(S, p, t, q, v, cam, posNow, ball);
      let s = st[i];
      if (!s) s = st[i] = { psi: r.face, head: r.eye == null ? r.face : r.eye, ph: (i * 0.37) % 1, cr: r.crouch, le: r.lean, sit: r.sit, stg: r.stagger, run: r.run, hd: resolveHands(r.hands, r.crouch, r.lean, r.sit) };
      else {
        const hand = resolveHands(r.hands, s.cr, s.le, s.sit);
        const turn = (cur, tgt, rate) => cur + clamp(angDiff(tgt, cur), -rate * DT, rate * DT);
        s.psi = turn(s.psi, r.face, 9);
        let eyeT = r.eye == null ? s.psi : r.eye;
        eyeT = s.psi + clamp(angDiff(eyeT, s.psi), -1.7, 1.7);
        s.head = turn(s.head, eyeT, 13);
        const ex = (rate) => 1 - Math.exp(-rate * DT);
        s.cr += (r.crouch - s.cr) * ex(9); s.le += (r.lean - s.le) * ex(9); s.sit += (r.sit - s.sit) * ex(9); s.stg += (r.stagger - s.stg) * ex(9);
        s.run += (r.run - s.run) * ex(10);
        for (let j = 0; j < 6; j++) s.hd[j] += (hand[j] - s.hd[j]) * ex(12);
        const spd = Math.hypot(v[0], v[1]), step = clamp(0.35 + 0.2 * spd, 0.35, 1.9);
        s.ph += spd / (2 * step) * DT;
      }
      const o = k * NF, d = data[i];
      d[o + F_X] = q[0]; d[o + F_Y] = q[1]; d[o + F_PSI] = s.psi; d[o + F_HEAD] = s.head; d[o + F_PH] = s.ph;
      d[o + F_VX] = v[0]; d[o + F_VY] = v[1]; d[o + F_CR] = s.cr; d[o + F_LE] = s.le; d[o + F_SIT] = s.sit; d[o + F_ST] = s.stg; d[o + F_RUN] = s.run;
      for (let j = 0; j < 6; j++) d[o + F_H + j] = s.hd[j];
    }
  }
  S.N = Math.max(S.N, last + 1);
}
function stateAt(S, i, t) {
  const kf = clamp((t - S.T0) / DT, 0, S.N - 1), k0 = Math.floor(kf), k1 = Math.min(S.N - 1, k0 + 1), u = kf - k0, d = S.data[i];
  const out = new Array(NF);
  for (let j = 0; j < NF; j++) { const a = d[k0 * NF + j], b = d[k1 * NF + j]; out[j] = (j === F_PSI || j === F_HEAD) ? a + angDiff(b, a) * u : a + (b - a) * u; }
  return out;
}

// ---------------------------------------------------------------- skeleton
function ik(A, B, L1, L2, bend) {
  let dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
  let d = Math.hypot(dx, dy, dz);
  const maxd = (L1 + L2) * 0.999;
  if (d > maxd) { const s = maxd / d; dx *= s; dy *= s; dz *= s; B = [A[0] + dx, A[1] + dy, A[2] + dz]; d = maxd; }
  if (d < 1e-4) return [A, A];
  const ux = dx / d, uy = dy / d, uz = dz / d;
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const dot = bend[0] * ux + bend[1] * uy + bend[2] * uz;
  let nx = bend[0] - dot * ux, ny = bend[1] - dot * uy, nz = bend[2] - dot * uz; const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  return [[A[0] + ux * a + nx * hh, A[1] + uy * a + ny * hh, A[2] + uz * a + nz * hh], B];
}
function skeleton(s, size) {
  const k = size / 1.86, x = s[F_X], y = s[F_Y], psi = s[F_PSI];
  const fx = Math.sin(psi), fy = Math.cos(psi), rx = Math.cos(psi), ry = -Math.sin(psi);
  const W = (a, b, z) => [x + (a * rx + b * fx) * k, y + (a * ry + b * fy) * k, z * k];
  const spd = Math.hypot(s[F_VX], s[F_VY]);
  const va = s[F_VX] * rx + s[F_VY] * ry, vb = s[F_VX] * fx + s[F_VY] * fy;
  const gait = clamp(spd / 1.2, 0, 1), ph = s[F_PH] * 2 * Math.PI;
  const step = clamp(0.35 + 0.2 * spd, 0.35, 1.9), exc = Math.min(step / 2, 0.55) * gait, lift = Math.min(0.32, 0.05 + 0.035 * spd) * gait;
  const mA = spd > 0.05 ? va / spd : 0, mB = spd > 0.05 ? vb / spd : 0;
  const cr = s[F_CR], le = s[F_LE], sit = s[F_SIT], stg = s[F_ST];
  const pz = 0.98 - 0.36 * cr - 0.03 * gait * Math.abs(Math.sin(ph)), pb = -0.1 * sit;
  const torso = 0.56, hl = le * 0.55;
  const pel = [0, pb, pz];
  const chest = [0, pb + Math.sin(le) * torso, pz + Math.cos(le) * torso];
  const head = [0, chest[1] + Math.sin(hl) * 0.21, chest[2] + Math.cos(hl) * 0.21];
  const shL = [-0.26, chest[1] - 0.02, chest[2] - 0.05], shR = [0.26, chest[1] - 0.02, chest[2] - 0.05];
  const hiL = [-0.15, pb, pz], hiR = [0.15, pb, pz];
  const footBase = (side, lead) => [side * 0.19, (lead ? 0.06 : -stg) + pb * 0.5, 0.05];
  const legPh = [ph, ph + Math.PI];
  const feet = [footBase(-1, true), footBase(1, false)].map((f, i) => {
    const sn = Math.sin(legPh[i]), cs = Math.cos(legPh[i]);
    return [f[0] + mA * exc * sn, f[1] + mB * exc * sn, f[2] + lift * Math.max(0, cs)];
  });
  const kneeBend = [0, 1, 0.25];
  const [knL, ftL] = ik(hiL, feet[0], 0.46, 0.5, kneeBend);
  const [knR, ftR] = ik(hiR, feet[1], 0.46, 0.5, kneeBend);
  const run = s[F_RUN];
  const tgtL = [s[F_H], s[F_H + 1], s[F_H + 2]], tgtR = [s[F_H + 3], s[F_H + 4], s[F_H + 5]];
  const amp = 0.32 * gait;
  const swL = [-0.22, chest[1] + 0.05 + amp * Math.sin(legPh[1]), chest[2] - 0.6 + 0.12 * Math.max(0, Math.sin(legPh[1]))];
  const swR = [0.22, chest[1] + 0.05 + amp * Math.sin(legPh[0]), chest[2] - 0.6 + 0.12 * Math.max(0, Math.sin(legPh[0]))];
  const mix = (a, b) => [a[0] + (b[0] - a[0]) * run, a[1] + (b[1] - a[1]) * run, a[2] + (b[2] - a[2]) * run];
  const [elL, haL] = ik(shL, mix(tgtL, swL), 0.35, 0.38, [-0.6, -0.25, -1]);
  const [elR, haR] = ik(shR, mix(tgtR, swR), 0.35, 0.38, [0.6, -0.25, -1]);
  const J = { pel, chest, head, shL, shR, hiL, hiR, knL, knR, ftL, ftR, elL, elR, haL, haR };
  const out = {};
  for (const key in J) out[key] = W(J[key][0], J[key][1], J[key][2]);
  out.torso = [[-0.27, 0.12, 0.02], [0.27, 0.12, 0.02], [-0.27, -0.12, 0.02], [0.27, -0.12, 0.02]].map((o) => W(o[0], chest[1] - 0.02 + o[1], chest[2] - 0.05 + o[2]))
    .concat([[-0.17, 0.11], [0.17, 0.11], [-0.17, -0.11], [0.17, -0.11]].map((o) => W(o[0], pb + o[1], pz + 0.02)));
  const hx = Math.sin(s[F_HEAD]), hy = Math.cos(s[F_HEAD]);
  out.facePt = [out.head[0] + hx * 0.13 * k, out.head[1] + hy * 0.13 * k, out.head[2] - 0.03 * k];
  out.faceDir = [hx, hy];
  out.fwd = [fx, fy];
  return out;
}

function hull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}

// ---------------------------------------------------------------- the view
export function createEyes(canvas) {
  const ctx = canvas.getContext('2d');
  const layer = document.createElement('canvas'), lctx = layer.getContext('2d');
  const FOVN = 100 * Math.PI / 180;
  let W = 1024, H = 700, DPR = 1, F = 1, HY = 190, CX = 512;
  let cam = { x: 0, y: -5, eye: 1.64, yaw: 0, sv: 0, cv: 1 };
  let S = null;
  const view = { labels: true, freeze: false };

  function proj(X, Y, Z) {
    const dx = X - cam.x, dy = Y - cam.y, xc = dx * cam.cv - dy * cam.sv, D = dx * cam.sv + dy * cam.cv, r = Math.hypot(dx, dy);
    const d = Math.max(D, 0.05); return { x: CX + F * xc / d, y: HY + F * (cam.eye - Z) / d, r, dy: D, sc: F / d };
  }
  function clipNear(pts, near) {
    const out = [], f = (q) => (q[0] - cam.x) * cam.sv + (q[1] - cam.y) * cam.cv - near;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const u = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
    }
    return out;
  }
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width)); H = Math.max(240, Math.round(r.height));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [canvas, layer]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    F = (W / 2) / Math.tan(FOVN / 2); HY = Math.round(H * 0.3); CX = W / 2;
  }
  function groundPoly(c, xa, xb, ya, yb) {
    const cl = clipNear([[xa, ya], [xb, ya], [xb, yb], [xa, yb]], 0.35); if (cl.length < 3) return false;
    c.beginPath(); cl.forEach((q, i) => { const p = proj(q[0], q[1], 0), x = clamp(p.x, -20000, 20000), y = Math.min(p.y, H * 20); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath();
    return true;
  }
  function strip(c, xa, xb, ya, yb, fill) { if (groundPoly(c, xa, xb, ya, yb)) { c.fillStyle = fill; c.fill(); } }
  function quad(c, xa, xb, ya, yb) {
    const a = proj(xa, ya, 0), b = proj(xb, ya, 0), d = proj(xb, yb, 0), e = proj(xa, yb, 0);
    if (Math.min(a.dy, b.dy, d.dy, e.dy) < 0.8) return;
    if (Math.max(a.x, b.x) < -20 || Math.min(a.x, b.x) > W + 20) return;
    c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath();
  }
  function groundText(c, txt, X, Y, ux, uy, vx, vy, sizeYd, color) {
    const p0 = proj(X, Y, 0); if (p0.r < 3.5 || p0.dy < 1) return;
    const pu = proj(X + ux, Y + uy, 0), pv = proj(X + vx, Y + vy, 0);
    c.save(); c.setTransform(DPR * (pu.x - p0.x), DPR * (pu.y - p0.y), DPR * (pv.x - p0.x), DPR * (pv.y - p0.y), DPR * p0.x, DPR * p0.y);
    c.scale(sizeYd / 100, sizeYd / 100); c.fillStyle = color; c.font = '700 100px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 0, 0); c.restore();
  }
  function drawField(st) {
    const f = S.field, yEnd = 110 - f.los, xc = (f.xl + f.xr) / 2;
    const farY = proj(xc, yEnd + 14, 0).y;
    ctx.fillStyle = st.sky[0]; ctx.fillRect(0, 0, W, farY + 1);
    ctx.fillStyle = '#D2D7DC'; ctx.fillRect(0, HY - 4, W, farY - HY + 5);
    ctx.fillStyle = st.oob; ctx.fillRect(0, farY, W, H - farY);
    for (let A = -10; A < 110; A += 5) {
      const ya = A - f.los, yb = ya + 5; if (yb < cam.y + 0.35) continue;
      strip(ctx, f.xl, f.xr, ya, yb, (A < 0 || A >= 100) ? st.endzone : st.turf[((A / 5) % 2 + 2) % 2]);
    }
    for (let A = 0; A <= 100; A += 5) { const Y = A - f.los; strip(ctx, f.xl, f.xr, Y - 0.12, Y + 0.12, st.line); }
    strip(ctx, f.xl - 0.4, f.xl, -50, yEnd + 0.12, st.line); strip(ctx, f.xr, f.xr + 0.4, -50, yEnd + 0.12, st.line);
    ctx.fillStyle = st.line; ctx.beginPath();
    for (let A = 1; A < 100; A++) {
      if (A % 5 === 0) continue; const Y = A - f.los; if (Y < cam.y + 1.2 || Y > 40) continue;
      for (const hx of f.hashes) quad(ctx, hx - 0.33, hx + 0.33, Y - 0.07, Y + 0.07);
      quad(ctx, f.xl, f.xl + 0.33, Y - 0.07, Y + 0.07); quad(ctx, f.xr - 0.33, f.xr, Y - 0.07, Y + 0.07);
    }
    ctx.fill();
    for (let A = 10; A <= 90; A += 10) {
      const Y = A - f.los, lab = String(A <= 50 ? A : 100 - A);
      groundText(ctx, lab, f.xl + 8, Y, 0, -1, -1, 0, 2.0, st.num); groundText(ctx, lab, f.xr - 8, Y, 0, 1, 1, 0, 2.0, st.num);
    }
    strip(ctx, f.xl, f.xr, -0.14, 0.14, st.los);
  }
  function drawFigure(c, p, s, st) {
    const team = st[p.side], size = SIZE[p.role] || 1.86, J = skeleton(s, size);
    const rx0 = s[F_X], ry0 = s[F_Y];
    const base = proj(rx0, ry0, 0); if (base.dy < 0.6) return null;
    const sc = base.sc, dx = rx0 - cam.x, dy = ry0 - cam.y, rr = Math.hypot(dx, dy) || 1, ux = dx / rr, uy = dy / rr;
    const pp = (q) => { const ox = q[0] - rx0, oy = q[1] - ry0, lat = ox * uy - oy * ux, dep = ox * ux + oy * uy; return { x: base.x + sc * lat, y: base.y - sc * q[2], r: rr + dep, dy: base.dy + dep, sc }; };
    const Pj = {};
    for (const key of ['pel', 'chest', 'head', 'shL', 'shR', 'hiL', 'hiR', 'knL', 'knR', 'ftL', 'ftR', 'elL', 'elR', 'haL', 'haR', 'facePt']) { Pj[key] = pp(J[key]); if (Pj[key].dy < 0.15) return null; }
    const ew = st.edgeW, k = size / 1.86;
    const limb = (a, b, w, col, edge) => {
      const px = w * (a.sc + b.sc) / 2; c.lineCap = 'round';
      if (edge) { c.strokeStyle = edge; c.lineWidth = px + ew * 2; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
      c.strokeStyle = col; c.lineWidth = px; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    };
    const dot = (a, rYd, col, edge) => { c.beginPath(); c.arc(a.x, a.y, rYd * a.sc, 0, Math.PI * 2); c.fillStyle = col; c.fill(); if (edge) { c.lineWidth = ew; c.strokeStyle = edge; c.stroke(); } };
    const toCam = [cam.x - rx0, cam.y - ry0], tl = Math.hypot(toCam[0], toCam[1]) || 1;
    const facing = (J.fwd[0] * toCam[0] + J.fwd[1] * toCam[1]) / tl;
    const parts = [
      { r: (Pj.hiL.r + Pj.knL.r + Pj.ftL.r) / 3, d: () => { limb(Pj.hiL, Pj.knL, 0.21 * k, team.pants, team.edge); limb(Pj.knL, Pj.ftL, 0.15 * k, team.socks, team.edge); dot(Pj.ftL, 0.09 * k, team.shoe); } },
      { r: (Pj.hiR.r + Pj.knR.r + Pj.ftR.r) / 3, d: () => { limb(Pj.hiR, Pj.knR, 0.21 * k, team.pants, team.edge); limb(Pj.knR, Pj.ftR, 0.15 * k, team.socks, team.edge); dot(Pj.ftR, 0.09 * k, team.shoe); } },
      { r: (Pj.shL.r + Pj.shR.r + Pj.hiL.r + Pj.hiR.r) / 4 + 0.001, d: () => {
        const hp = hull(J.torso.map(pp));
        c.beginPath(); hp.forEach((q, i) => { if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }); c.closePath();
        c.fillStyle = team.jersey; c.fill(); c.lineJoin = 'round'; c.lineWidth = ew; c.strokeStyle = team.edge; c.stroke();
        // shoulder pads (a cap over each shoulder) and the belt
        for (const sh of [Pj.shL, Pj.shR]) { c.beginPath(); c.arc(sh.x, sh.y, Math.max(2, 0.12 * k * sh.sc), Math.PI, 0); c.closePath(); c.fillStyle = team.jersey; c.fill(); c.lineWidth = ew; c.strokeStyle = team.edge; c.stroke(); }
        c.strokeStyle = team.edge; c.lineWidth = Math.max(1, 0.035 * k * Pj.chest.sc); c.beginPath();
        c.moveTo(Pj.hiL.x + (Pj.shL.x - Pj.hiL.x) * 0.12, Pj.hiL.y + (Pj.shL.y - Pj.hiL.y) * 0.12); c.lineTo(Pj.hiR.x + (Pj.shR.x - Pj.hiR.x) * 0.12, Pj.hiR.y + (Pj.shR.y - Pj.hiR.y) * 0.12); c.stroke();
        const cxp = (Pj.shL.x + Pj.shR.x + Pj.hiL.x + Pj.hiR.x) / 4, cyp = (Pj.shL.y + Pj.shR.y) / 2 * 0.55 + (Pj.hiL.y + Pj.hiR.y) / 2 * 0.45;
        const fs = Math.abs((Pj.hiL.y + Pj.hiR.y) / 2 - (Pj.shL.y + Pj.shR.y) / 2) * 0.55;
        if (fs > 5 && p.num != null) {
          c.save(); c.translate(cxp, cyp); c.scale(Math.max(0.18, Math.abs(facing)), 1);
          c.font = '800 ' + fs.toFixed(1) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = team.num; c.fillText(String(p.num), 0, 0); c.restore();
        }
      } },
      { r: (Pj.shL.r + Pj.elL.r + Pj.haL.r) / 3, d: () => { limb(Pj.shL, Pj.elL, 0.15 * k, team.jersey, team.edge); limb(Pj.elL, Pj.haL, 0.12 * k, team.under, team.edge); dot(Pj.haL, 0.07 * k, team.glove, team.edge); } },
      { r: (Pj.shR.r + Pj.elR.r + Pj.haR.r) / 3, d: () => { limb(Pj.shR, Pj.elR, 0.15 * k, team.jersey, team.edge); limb(Pj.elR, Pj.haR, 0.12 * k, team.under, team.edge); dot(Pj.haR, 0.07 * k, team.glove, team.edge); } },
      { r: Pj.head.r, d: () => {
        const hr = 0.165 * k * Pj.head.sc, hx = Pj.head.x, hy = Pj.head.y;
        const fdot = (J.faceDir[0] * toCam[0] + J.faceDir[1] * toCam[1]) / tl;
        const mask = () => {
          const mx = Pj.facePt.x, my = Pj.facePt.y, mw = hr * (0.55 + 0.45 * Math.abs(fdot)); c.strokeStyle = team.mask; c.lineCap = 'round'; c.lineWidth = Math.max(1.2, hr * 0.2); c.beginPath();
          c.moveTo(mx - mw * 0.5, my - hr * 0.05); c.lineTo(mx + mw * 0.5, my - hr * 0.05); c.moveTo(mx - mw * 0.42, my + hr * 0.3); c.lineTo(mx + mw * 0.42, my + hr * 0.3);
          c.moveTo(mx, my - hr * 0.05); c.lineTo(mx, my + hr * 0.42); c.stroke();
        };
        if (fdot < -0.15) mask();
        c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI * 2); c.fillStyle = team.helmet; c.fill(); c.lineWidth = ew; c.strokeStyle = team.edge; c.stroke();
        c.beginPath(); c.arc(hx - hr * 0.3, hy - hr * 0.35, hr * 0.38, 0, Math.PI * 2); c.fillStyle = team.helmetHi; c.fill();
        // the helmet stripe, seen from the front or the back
        if (Math.abs(fdot) > 0.35) { c.strokeStyle = team.stripe; c.lineCap = 'butt'; c.lineWidth = Math.max(1, hr * 0.2); c.beginPath(); c.moveTo(hx, hy - hr * 0.97); c.lineTo(hx, hy + hr * (fdot < 0 ? -0.1 : 0.6)); c.stroke(); }
        if (fdot >= -0.15) mask();
      } }
    ];
    parts.sort((a, b) => b.r - a.r).forEach((q) => q.d());
    return { head: Pj.head, hr: 0.165 * k * Pj.head.sc };
  }
  function drawBall(c, p3, st) {
    const p = proj(p3[0], p3[1], p3[2]); if (p.dy < 0.9) return;
    const len = 0.31 * p.sc, wid = len * 0.62;
    c.save(); c.translate(p.x, p.y); c.rotate(-0.35); c.beginPath(); c.ellipse(0, 0, len / 2, wid / 2, 0, 0, Math.PI * 2); c.fillStyle = st.ball; c.fill(); c.restore();
  }
  function chip(text, x, y, bg, fg, border, align, size) {
    const fsz = size || 13;
    ctx.font = '700 ' + fsz + 'px ' + FONT;
    const w = Math.ceil(ctx.measureText(text).width) + 14, h = fsz + 7;
    let x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2; x0 = clamp(x0, 2, W - w - 2);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y - h, w, h, h / 2); else ctx.rect(x0, y - h, w, h);
    ctx.fillStyle = bg; ctx.fill(); if (border) { ctx.lineWidth = 1.5; ctx.strokeStyle = border; ctx.stroke(); }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + w / 2, y - h / 2 + 0.5);
  }
  function drawHands(t, st) {
    const sc = W / 1080, cx = W / 2, by = H - 34 * sc;
    let lift = 0, lx = 0, alpha = 1, ball = t >= 0.3 && t < S.Tt;
    if (t >= S.Tt - 0.22 && t < S.Tt + 0.25) { const u = clamp((t - (S.Tt - 0.22)) / 0.47, 0, 1); lift = 140 * sc * Math.sin(Math.PI * u * 0.5); lx = -150 * sc * u; alpha = 1 - u; ball = t < S.Tt; }
    if (t >= S.Tt + 0.25) return;
    ctx.save(); ctx.globalAlpha = alpha;
    const hand = (x, y, flip) => {
      ctx.beginPath(); ctx.moveTo(x + flip * 60 * sc, H + 10); ctx.quadraticCurveTo(x + flip * 40 * sc, y + 20 * sc, x, y + 6 * sc);
      ctx.lineWidth = 30 * sc; ctx.strokeStyle = st.hands.sleeve; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, y, 20 * sc, 16 * sc, 0, 0, Math.PI * 2); ctx.fillStyle = st.hands.glove; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = st.hands.edge; ctx.stroke();
    };
    const gap = ball ? 34 * sc : 46 * sc;
    hand(cx - gap + lx, by - lift, -1); hand(cx + gap + lx * 0.6, by - lift * 0.8, 1);
    if (ball) { ctx.save(); ctx.translate(cx + lx * 0.8, by - 4 * sc - lift * 0.9); ctx.rotate(-0.12); ctx.beginPath(); ctx.ellipse(0, 0, 40 * sc, 25 * sc, 0, 0, Math.PI * 2); ctx.fillStyle = st.ball; ctx.fill(); ctx.strokeStyle = st.lace; ctx.lineWidth = 3 * sc; ctx.beginPath(); ctx.moveTo(-13 * sc, -9 * sc); ctx.lineTo(13 * sc, -9 * sc); ctx.stroke(); ctx.restore(); }
    ctx.restore();
  }
  function drawLookStrip(t, states) {
    const w = Math.min(220, W * 0.3), h = 10, x0 = W / 2 - w / 2, y0 = 16;
    const toX = (a) => x0 + (clamp(a, -Math.PI / 2, Math.PI / 2) + Math.PI / 2) / Math.PI * w;
    const half = FOVN / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(16,20,26,0.72)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0 - 52, y0 - 8, w + 64, h + 16, 13); else ctx.rect(x0 - 52, y0 - 8, w + 64, h + 16); ctx.fill();
    ctx.font = '700 11px ' + FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillStyle = '#FFFFFF'; ctx.fillText('EYES', x0 - 10, y0 + h / 2 + 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0, y0, w, h);
    const a = toX(cam.yaw - half), b = toX(cam.yaw + half);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(a, y0, b - a, h);
    ctx.fillStyle = '#1C2430'; ctx.beginPath(); ctx.arc(toX(cam.yaw), y0 + h / 2, 3, 0, Math.PI * 2); ctx.fill();
    const i = S.readId ? S.players.indexOf(S.byId[S.readId]) : -1;
    if (i >= 0 && t > S.turnAt) {
      const s = states[i], rx = toX(Math.atan2(s[F_X] - cam.x, s[F_Y] - cam.y));
      ctx.fillStyle = '#E2602A'; ctx.beginPath(); ctx.moveTo(rx, y0 + h + 1); ctx.lineTo(rx - 5, y0 + h + 8); ctx.lineTo(rx + 5, y0 + h + 8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    let msg = null;
    if (t > S.turnAt && t < S.turnAt + 1.2 && S.readText) msg = S.readText;
    if (msg) chip(msg, W / 2, y0 + h + 36, 'rgba(16,20,26,0.82)', '#FFFFFF', null);
  }

  function draw(t) {
    if (!S) return;
    const st = STYLE;
    cam = S.cam(t); cam.yaw = S.yawOverride != null ? S.yawOverride : S.yaw(t); cam.sv = Math.sin(cam.yaw); cam.cv = Math.cos(cam.yaw);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawField(st);
    if (S.overlay) S.overlay({ ctx, proj, cam, t, W, H });
    const states = S.players.map((p, i) => stateAt(S, i, t));
    ctx.fillStyle = st.shadow;
    states.forEach((s) => { const c = proj(s[F_X], s[F_Y], 0); if (c.dy < 0.3) return; const a = proj(s[F_X], s[F_Y] - 0.45, 0), b = proj(s[F_X], s[F_Y] + 0.45, 0); ctx.beginPath(); ctx.ellipse(c.x, c.y, 0.48 * c.sc, Math.max(1.5, Math.abs(a.y - b.y) / 2), 0, 0, Math.PI * 2); ctx.fill(); });
    const ball = ballAt(S, t);
    const order = S.players.map((p, i) => ({ p, s: states[i], r: Math.hypot(states[i][F_X] - cam.x, states[i][F_Y] - cam.y) })).sort((a, b) => b.r - a.r);
    const info = {};
    order.filter((o) => o.p.side === 'D').forEach((o) => { info[o.p.id] = drawFigure(ctx, o.p, o.s, st); });
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height); lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    order.filter((o) => o.p.side === 'O' && o.r >= 2.2).forEach((o) => { info[o.p.id] = drawFigure(lctx, o.p, o.s, st); });
    S.screen = {};
    for (const [id, inf] of Object.entries(info)) if (inf && inf.head) S.screen[id] = { x: inf.head.x, y: inf.head.y + inf.hr * 4, r: Math.max(28, inf.hr * 6) };
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = st.ownAlpha; ctx.drawImage(layer, 0, 0); ctx.restore();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (ball.mode === 'ground' || ball.mode === 'air') drawBall(ctx, ball.p, st);
    else if (ball.mode === 'caught') { const i = S.players.indexOf(S.byId[S.target]), s = states[i]; drawBall(ctx, [s[F_X] + Math.sin(s[F_PSI]) * 0.15, s[F_Y] + Math.cos(s[F_PSI]) * 0.15, 1.05], st); }
    // labels and edge markers
    const edge = { left: [], right: [] };
    order.forEach((o) => {
      const p = o.p, s = o.s, inf = info[p.id], lab = p.label; if (!lab) return;
      const g = proj(s[F_X], s[F_Y], 0), xc = (s[F_X] - cam.x) * cam.cv - (s[F_Y] - cam.y) * cam.sv;
      const off = g.dy < 0.6 || g.x < -4 || g.x > W + 4 || (p.side === 'O' && o.r < 2.2);
      const def = p.side === 'D', look = p.glow ? ['#2F7D4F', '#FFFFFF', '#2F7D4F'] : [def ? st.tag.bg : st.tag.obg, def ? st.tag.fg : st.tag.ofg, def ? st.tag.border : st.tag.oborder];
      if (off) (xc > 0 ? edge.right : edge.left).push({ lab, y: clamp(g.dy > 0.6 ? Math.min(g.y, H * 0.8) : H * 0.6, HY + 40, H - 110), look });
      else if (view.labels && inf && inf.head) chip(lab, inf.head.x, inf.head.y - inf.hr - 6, look[0], look[1], look[2], null, def ? 12 : 13);
    });
    for (const side of ['left', 'right']) {
      const list = edge[side].sort((a, b) => a.y - b.y); let last = -1e9;
      for (const m of list) { m.y = Math.max(m.y, last + 24); last = m.y; const R = side === 'right'; chip(R ? m.lab + ' ›' : '‹ ' + m.lab, R ? W - 6 : 6, m.y, m.look[0], m.look[1], m.look[2], R ? 'right' : 'left'); }
    }
    drawHands(t, st);
    drawLookStrip(t, states);
    if (S.hud) S.hud({ ctx, proj, cam, t, W, H, FOV: FOVN });
  }

  return {
    resize,
    get width() { return W; },
    setScene(scene) { S = scene; },
    draw,
    view,
  };
}
