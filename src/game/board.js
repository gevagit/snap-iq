// Top-down Breakdown board (PRD §7.5: top-down only in Learn and Breakdown), Look B coaching board.
const B = {
  oob: '#BAC3BA', turf: ['#CAD4C7', '#C2CDBF'], line: '#FFFFFF', los: '#1F5FD1',
  oFill: 'rgba(227,236,251,0.85)', oEdge: '#1F5FD1', oText: '#173F8F', dFill: '#FFFFFF', dEdge: '#C94A16', dText: '#8A2E0A',
  route: 'rgba(31,95,209,0.75)', read: 'rgba(201,74,22,0.85)', man: 'rgba(201,74,22,0.6)', trailO: 'rgba(31,95,209,0.3)', trailD: 'rgba(201,74,22,0.3)',
  best: '#2F7D4F', mine: '#1C2430', ball: '#8A5A3C'
};
const FONT = 'Archivo, "Helvetica Neue", Arial, sans-serif';

export function drawBoard(canvas, rep, t, opts) {
  const play = rep.play, sim = play.sim, fr = play.offense.frame;
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth || 600, dpr = Math.min(2, window.devicePixelRatio || 1);
  let lo = Infinity, hi = -Infinity;
  sim.tracks.forEach((p) => { for (let k = 0; k <= sim.steps; k += 3) { lo = Math.min(lo, p.xs[k]); hi = Math.max(hi, p.xs[k]); } });
  lo = Math.max(fr.leftSideline - 1, lo - 4); hi = Math.min(fr.rightSideline + 1, hi + 4);
  const Y0 = -9, Y1 = 19, s = w / (hi - lo), h = Math.round((Y1 - Y0) * s);
  canvas.style.height = h + 'px'; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const X = (x) => (x - lo) * s, Y = (y) => (Y1 - y) * s;
  const at = (id, tt) => {
    const tr = sim.tracks.find((q) => q.id === id), f = Math.max(0, Math.min(sim.steps, (tt - sim.tStart) / sim.dt)), k = Math.floor(f), k2 = Math.min(sim.steps, k + 1), u = f - k;
    return { x: tr.xs[k] + (tr.xs[k2] - tr.xs[k]) * u, y: tr.ys[k] + (tr.ys[k2] - tr.ys[k]) * u };
  };
  ctx.fillStyle = B.oob; ctx.fillRect(0, 0, w, h);
  for (let y = Math.floor(Y0 / 5) * 5; y < Y1; y += 5) { ctx.fillStyle = B.turf[((y / 5) % 2 + 2) % 2]; ctx.fillRect(X(fr.leftSideline), Y(y + 5), (fr.rightSideline - fr.leftSideline) * s, 5 * s); }
  ctx.strokeStyle = B.line; ctx.lineWidth = Math.max(1, s * 0.12);
  for (let y = Math.ceil(Y0 / 5) * 5; y <= Y1; y += 5) { ctx.beginPath(); ctx.moveTo(X(fr.leftSideline), Y(y)); ctx.lineTo(X(fr.rightSideline), Y(y)); ctx.stroke(); }
  for (let y = Math.ceil(Y0); y <= Y1; y++) if (y % 5) for (const hx of [fr.leftHash, fr.rightHash]) { ctx.beginPath(); ctx.moveTo(X(hx) - s * 0.35, Y(y)); ctx.lineTo(X(hx) + s * 0.35, Y(y)); ctx.stroke(); }
  ctx.strokeStyle = B.los; ctx.lineWidth = Math.max(1.5, s * 0.18); ctx.beginPath(); ctx.moveTo(X(fr.leftSideline), Y(0)); ctx.lineTo(X(fr.rightSideline), Y(0)); ctx.stroke();
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
    const o = rep.key.options.find((q) => q.id === id); if (!o) return;
    const qb = at('QB', rep.decision), c = at(id, o.catchT);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, s * 0.2); ctx.setLineDash(dash ? [s * 0.5, s * 0.35] : []);
    ctx.beginPath(); ctx.moveTo(X(qb.x), Y(qb.y)); ctx.lineTo(X(c.x), Y(c.y)); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(X(c.x), Y(c.y), s * 1.0, 0, Math.PI * 2); ctx.stroke();
  };
  if (opts.showThrows) { throwLine(rep.key.throwTo, B.best, false); if (opts.mine && opts.mine !== rep.key.throwTo) throwLine(opts.mine, B.mine, true); }
  // players
  const r = s * 0.62;
  sim.tracks.forEach((p) => {
    const q = at(p.id, t), o = p.team === 'O';
    ctx.fillStyle = o ? B.oFill : B.dFill; ctx.strokeStyle = o ? B.oEdge : B.dEdge; ctx.lineWidth = Math.max(1.2, s * 0.14);
    ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (p.id === rep.key.readDefender) { ctx.strokeStyle = B.los; ctx.setLineDash([s * 0.3, s * 0.2]); ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), r * 1.8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if (p.label) { ctx.fillStyle = o ? B.oText : B.dText; ctx.font = '700 ' + Math.max(8, Math.round(s * (p.label.length > 2 ? 0.62 : 0.78))) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.label, X(q.x), Y(q.y) + 0.5); }
  });
}
