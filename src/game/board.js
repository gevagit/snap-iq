// Top-down Breakdown board (PRD §7.5: top-down only in Learn and Breakdown), Look B coaching board.
const B = {
  oob: '#BAC3BA', turf: ['#CAD4C7', '#C2CDBF'], line: '#FFFFFF', los: '#1F5FD1',
  oFill: 'rgba(227,236,251,0.85)', oEdge: '#1F5FD1', oText: '#173F8F', dFill: '#FFFFFF', dEdge: '#C94A16', dText: '#8A2E0A',
  route: 'rgba(31,95,209,0.75)', read: 'rgba(201,74,22,0.85)', man: 'rgba(201,74,22,0.6)', trailO: 'rgba(31,95,209,0.3)', trailD: 'rgba(201,74,22,0.3)',
  best: '#2F7D4F', mine: '#1C2430', ball: '#8A5A3C'
};
const FONT = 'Archivo, "Helvetica Neue", Arial, sans-serif';

/** Size the canvas to its width for a window of the field, and draw the turf, yard lines, hashes and the line of scrimmage. */
function field(canvas, fr, lo, hi, Y0, Y1) {
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth || 600, dpr = Math.min(2, window.devicePixelRatio || 1);
  const s = w / (hi - lo), h = Math.round((Y1 - Y0) * s);
  canvas.style.height = h + 'px'; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const X = (x) => (x - lo) * s, Y = (y) => (Y1 - y) * s;
  ctx.fillStyle = B.oob; ctx.fillRect(0, 0, w, h);
  for (let y = Math.floor(Y0 / 5) * 5; y < Y1; y += 5) { ctx.fillStyle = B.turf[((y / 5) % 2 + 2) % 2]; ctx.fillRect(X(fr.leftSideline), Y(y + 5), (fr.rightSideline - fr.leftSideline) * s, 5 * s); }
  ctx.strokeStyle = B.line; ctx.lineWidth = Math.max(1, s * 0.12);
  for (let y = Math.ceil(Y0 / 5) * 5; y <= Y1; y += 5) { ctx.beginPath(); ctx.moveTo(X(fr.leftSideline), Y(y)); ctx.lineTo(X(fr.rightSideline), Y(y)); ctx.stroke(); }
  for (let y = Math.ceil(Y0); y <= Y1; y++) if (y % 5) for (const hx of [fr.leftHash, fr.rightHash]) { ctx.beginPath(); ctx.moveTo(X(hx) - s * 0.35, Y(y)); ctx.lineTo(X(hx) + s * 0.35, Y(y)); ctx.stroke(); }
  ctx.strokeStyle = B.los; ctx.lineWidth = Math.max(1.5, s * 0.18); ctx.beginPath(); ctx.moveTo(X(fr.leftSideline), Y(0)); ctx.lineTo(X(fr.rightSideline), Y(0)); ctx.stroke();
  return { ctx, s, X, Y };
}

/**
 * The play call as a coach draws it (top-down, PRD §7.5 Learn): his offense where the formation puts it, every route
 * with an arrow and its read number, a block mark for everyone who stays in. No defense: this is the huddle.
 */
export function drawCall(canvas, rep, sheet, focus) {
  // focus: a player id or a list of ids to pick out; everyone else is dimmed
  const play = rep.play, fr = play.offense.frame, jobs = play.jobs;
  const pts = [...play.offense.players.map((p) => p.pos), ...jobs.routes.flatMap((r) => r.points)];
  const lo = Math.max(fr.leftSideline - 1, Math.min(...pts.map((q) => q.x)) - 3), hi = Math.min(fr.rightSideline + 1, Math.max(...pts.map((q) => q.x)) + 3);
  const top = Math.max(10, Math.max(...pts.map((q) => q.y)) + 3.5);
  const { ctx, s, X, Y } = field(canvas, fr, lo, hi, -9, top);
  const row = (id) => sheet.rows.find((r) => r.id === id);
  const F = focus ? new Set([].concat(focus)) : null;
  const dim = (id) => F && !F.has(id);
  // routes, with an arrowhead at the end and his read number
  for (const r of jobs.routes) {
    const p = r.points; if (p.length < 2) continue;
    ctx.globalAlpha = dim(r.id) ? 0.25 : 1;
    ctx.strokeStyle = B.oEdge; ctx.lineWidth = Math.max(1.5, s * (F && F.has(r.id) ? 0.3 : 0.18)); ctx.lineJoin = 'round';
    ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(X(q.x), Y(q.y)) : ctx.moveTo(X(q.x), Y(q.y)))); ctx.stroke();
    const a = p[p.length - 2], b = p[p.length - 1], ang = Math.atan2(-(b.y - a.y), b.x - a.x), L = s * 0.9;
    ctx.fillStyle = B.oEdge; ctx.beginPath(); ctx.moveTo(X(b.x), Y(b.y));
    ctx.lineTo(X(b.x) - L * Math.cos(ang - 0.45), Y(b.y) - L * Math.sin(ang - 0.45)); ctx.lineTo(X(b.x) - L * Math.cos(ang + 0.45), Y(b.y) - L * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
    const n = row(r.id) && row(r.id).read;
    if (n) {
      const cx = X(b.x) + s * 1.1, cy = Y(b.y) - s * 0.6;
      ctx.fillStyle = B.dEdge; ctx.beginPath(); ctx.arc(cx, cy, s * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.max(9, Math.round(s * 0.8)) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), cx, cy + 0.5);
    }
  }
  // block marks: a short T in front of each player who stays in (dashed for a back who checks first)
  for (const r of sheet.rows) {
    if (r.job !== 'block' && r.job !== 'check') continue;
    const p = play.offense.players.find((q) => q.id === r.id).pos;
    ctx.globalAlpha = dim(r.id) ? 0.25 : 1;
    ctx.strokeStyle = B.oEdge; ctx.lineWidth = Math.max(1.5, s * 0.18); ctx.setLineDash(r.job === 'check' ? [s * 0.25, s * 0.2] : []);
    ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y + 0.6)); ctx.lineTo(X(p.x), Y(p.y + 1.3)); ctx.moveTo(X(p.x - 0.5), Y(p.y + 1.3)); ctx.lineTo(X(p.x + 0.5), Y(p.y + 1.3)); ctx.stroke(); ctx.setLineDash([]);
  }
  // players: his letter in the circle; the one he tapped ringed
  const rad = s * 0.62;
  for (const p of play.offense.players) {
    ctx.globalAlpha = dim(p.id) ? 0.35 : 1;
    ctx.fillStyle = p.id === 'QB' ? B.oEdge : B.oFill; ctx.strokeStyle = B.oEdge; ctx.lineWidth = Math.max(1.2, s * 0.14);
    ctx.beginPath(); ctx.arc(X(p.pos.x), Y(p.pos.y), rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (F && F.has(p.id)) { ctx.strokeStyle = B.mine; ctx.lineWidth = Math.max(2, s * 0.16); ctx.beginPath(); ctx.arc(X(p.pos.x), Y(p.pos.y), rad * 1.6, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = p.id === 'QB' ? '#fff' : B.oText; ctx.font = '800 ' + Math.max(8, Math.round(s * (p.id.length > 1 ? 0.55 : 0.8))) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.id, X(p.pos.x), Y(p.pos.y) + 0.5);
  }
  ctx.globalAlpha = 1;
  return (px, py) => { let best = null, d0 = rad * 2.2; for (const p of play.offense.players) { const d = Math.hypot(X(p.pos.x) - px, Y(p.pos.y) - py); if (d < d0) { d0 = d; best = p.id; } } return best; };
}

export function drawBoard(canvas, rep, t, opts) {
  const play = rep.play, sim = play.sim, fr = play.offense.frame;
  let lo = Infinity, hi = -Infinity;
  sim.tracks.forEach((p) => { for (let k = 0; k <= sim.steps; k += 3) { lo = Math.min(lo, p.xs[k]); hi = Math.max(hi, p.xs[k]); } });
  lo = Math.max(fr.leftSideline - 1, lo - 4); hi = Math.min(fr.rightSideline + 1, hi + 4);
  const { ctx, s, X, Y } = field(canvas, fr, lo, hi, -9, 19);
  const at = (id, tt) => {
    const tr = sim.tracks.find((q) => q.id === id), f = Math.max(0, Math.min(sim.steps, (tt - sim.tStart) / sim.dt)), k = Math.floor(f), k2 = Math.min(sim.steps, k + 1), u = f - k;
    return { x: tr.xs[k] + (tr.xs[k2] - tr.xs[k]) * u, y: tr.ys[k] + (tr.ys[k2] - tr.ys[k]) * u };
  };
  // routes
  sim.routes.forEach((r) => {
    ctx.strokeStyle = B.route; ctx.lineWidth = Math.max(1, s * 0.12); ctx.beginPath();
    r.points.forEach((q, i) => { if (i) ctx.lineTo(X(q.x), Y(q.y)); else ctx.moveTo(X(q.x), Y(q.y)); }); ctx.stroke();
  });
  // trails
  sim.tracks.forEach((p) => {
    const k1 = Math.min(sim.steps, Math.floor((t - sim.tStart) / sim.dt)); if (k1 < 1) return;
    ctx.strokeStyle = p.team === 'O' ? B.trailO : B.trailD; ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.beginPath(); ctx.moveTo(X(p.xs[0]), Y(p.ys[0])); for (let k = 1; k <= k1; k++) ctx.lineTo(X(p.xs[k]), Y(p.ys[k])); ctx.stroke();
  });
  // whom each defender is playing
  if (t > 0) {
    const j = Math.max(0, Math.round(t / sim.dt));
    sim.zoneReads.forEach((z) => { const th = z.threat[Math.min(z.threat.length - 1, j)]; if (!th) return; const d = at(z.role, t), o = at(th, t); ctx.strokeStyle = B.read; ctx.lineWidth = Math.max(1, s * 0.1); ctx.beginPath(); ctx.moveTo(X(d.x), Y(d.y)); ctx.lineTo(X(o.x), Y(o.y)); ctx.stroke(); });
  }
  sim.man.forEach((m) => { const d = at(m.role, t), o = at(m.target, t); ctx.strokeStyle = B.man; ctx.setLineDash([s * 0.15, s * 0.25]); ctx.lineWidth = Math.max(1, s * 0.08); ctx.beginPath(); ctx.moveTo(X(d.x), Y(d.y)); ctx.lineTo(X(o.x), Y(o.y)); ctx.stroke(); ctx.setLineDash([]); });
  // the throws: the answer (green) and his (dark), from the release to the catch
  const throwLine = (id, color, dash) => {
    const o = rep.post.options.find((q) => q.id === id); if (!o) return;
    const qb = at('QB', rep.freeze2), c = at(id, o.catchT);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, s * 0.2); ctx.setLineDash(dash ? [s * 0.5, s * 0.35] : []);
    ctx.beginPath(); ctx.moveTo(X(qb.x), Y(qb.y)); ctx.lineTo(X(c.x), Y(c.y)); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(X(c.x), Y(c.y), s * 1.0, 0, Math.PI * 2); ctx.stroke();
  };
  if (opts.showThrows) { throwLine(rep.post.decision, B.best, false); if (opts.mine && opts.mine !== rep.post.decision) throwLine(opts.mine, B.mine, true); }
  // players
  const r = s * 0.62;
  sim.tracks.forEach((p) => {
    const q = at(p.id, t), o = p.team === 'O';
    ctx.fillStyle = o ? B.oFill : B.dFill; ctx.strokeStyle = o ? B.oEdge : B.dEdge; ctx.lineWidth = Math.max(1.2, s * 0.14);
    ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (p.id === rep.routine.key) { ctx.strokeStyle = B.los; ctx.setLineDash([s * 0.3, s * 0.2]); ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), r * 1.8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if (p.label) { ctx.fillStyle = o ? B.oText : B.dText; ctx.font = '700 ' + Math.max(8, Math.round(s * (p.label.length > 2 ? 0.62 : 0.78))) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.label, X(q.x), Y(q.y) + 0.5); }
  });
}

/**
 * The pocket Breakdown (PRD §8.4): his path against the right move (the ghost line), the rushers' paths, the pocket
 * edge, and everyone where they were at time t.
 */
export function drawPocketBoard(canvas, rep, sim, ideal, t) {
  const fr = rep.play.offense.frame, P = sim.c.pocket;
  // the pocket and the rush, close up
  const lo = Math.max(fr.leftSideline - 1, -12), hi = Math.min(fr.rightSideline + 1, 12);
  const { ctx, s, X, Y } = field(canvas, fr, lo, hi, -10, 5);
  const tt = Math.min(t, sim.t);
  const path = (h, upTo, color, width, dash) => {
    if (!h) return;
    const n = Math.min(h.xs.length, Math.floor(upTo / (1 / 120)) + 1);
    if (n < 2) return;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(X(h.xs[0]), Y(h.ys[0])); for (let k = 1; k < n; k += 2) ctx.lineTo(X(h.xs[k]), Y(h.ys[k])); ctx.stroke(); ctx.setLineDash([]);
  };
  // the pocket edge around his set point
  ctx.strokeStyle = 'rgba(242,193,78,0.9)'; ctx.lineWidth = Math.max(1.5, s * 0.12); ctx.setLineDash([s * 0.4, s * 0.25]);
  ctx.beginPath(); ctx.arc(X(sim.set.x), Y(sim.set.y), P.pocket_edge * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  // the rushers' paths, the right move (ghost) and his path
  for (const r of sim.rushers) path(sim.hist.get(r.s.role), tt, 'rgba(201,74,22,0.75)', Math.max(1.5, s * 0.12));
  path(ideal.hist.get('QB'), ideal.t, '#2F7D4F', Math.max(2, s * 0.2), [s * 0.5, s * 0.3]);
  path(sim.hist.get('QB'), tt, '#1C2430', Math.max(2.5, s * 0.22));
  // where the pressure turned real, and where he started to move
  const dot = (q, color, label) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), s * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.font = '700 ' + Math.max(10, Math.round(s * 0.6)) + 'px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, X(q.x) + s * 0.6, Y(q.y));
  };
  if (Number.isFinite(rep.real) && rep.real <= sim.t) dot(sim.pos('QB', rep.real), '#C94A16', `pressure real ${rep.real.toFixed(1)} s`);
  if (sim.moveStart !== null) dot(sim.pos('QB', sim.moveStart), '#1C2430', `you moved ${sim.moveStart.toFixed(1)} s`);
  // everyone at time t
  const rad = s * 0.62;
  for (const tr of rep.play.sim.tracks) {
    const q = sim.pos(tr.id, tt), o = tr.team === 'O';
    ctx.fillStyle = tr.id === 'QB' ? B.oEdge : o ? B.oFill : B.dFill; ctx.strokeStyle = o ? B.oEdge : B.dEdge; ctx.lineWidth = Math.max(1.2, s * 0.14);
    ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const lab = o ? tr.id : tr.label;
    if (lab) { ctx.fillStyle = tr.id === 'QB' ? '#fff' : o ? B.oText : B.dText; ctx.font = '800 ' + Math.max(8, Math.round(s * (lab.length > 1 ? 0.55 : 0.8))) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, X(q.x), Y(q.y) + 0.5); }
  }
}
