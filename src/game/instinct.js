// Pocket Instinct (docs/plans/instinct.md): the Pocket workout. An endless run of snaps from his eyes: dodge the
// hitters with the pad (right thumb), throw to an ally the moment he comes open (fixed buttons, left thumb), and hang
// as long as you can. All football and every number come from content through src/instinct; this file draws, takes
// input (touch, keyboard, mouse, game controller) and keeps score.
import { ALLY_IDS, STEP, Run, SnapSim, idealPolicy, isOpen, rampAt } from '../instinct';
import { instinctScene, extendInstinct, setThrow, SHAPES } from './eyes.js';
import { drawInstinctBoard } from './board.js';

const PAD_KEYS = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0] };
const THROW_KEYS = { j: 'X', k: 'Y', l: 'Z', ';': 'H', ' ': 'R' };
// game controller (standard mapping): A B X Y RB throw to ◆ ● ▲ ■ ★, LB throws it away, Start snaps
const PAD_BUTTONS = { 0: 'X', 1: 'Y', 2: 'Z', 3: 'H', 5: 'R' };

export function initInstinct(ctx) {
  const { C, eyes, $, show, term, def, esc, progress, save, renderHome, finishWorkout } = ctx;
  const I = C.instinct;
  let run = null, S = null, simShown = null, raf = 0, last = 0, acc = 0, input = { mx: 0, my: 0 };
  const keys = new Set();
  // ?autoplay=1 plays the right moves (a demo of a good run, and how the browser tests reach later levels)
  const autoplay = new URLSearchParams(location.search).get('autoplay') === '1';
  let gpPrev = [];
  let banner = null;

  // ------------------------------------------------------------ start, loop, end
  function start() {
    const p = progress();
    const st = p.instinct || {};
    const fixed = Number(new URLSearchParams(location.search).get('seed'));
    const startLevel = Math.max(1, (st.lastLevel || 1) - I.ramp.restart_below);
    run = new Run(C, fixed || ((Date.now() / 1000) | 0), startLevel);
    document.body.classList.add('pocket');
    $('pReport').classList.remove('on');
    show('rep');
    requestAnimationFrame(() => {
      eyes.resize();
      newScene();
      $('pReady').hidden = false;
      $('pCall').innerHTML = `<b>Hang as long as you can</b><span>Dodge the rush with your right thumb. Throw to the ally who comes open with your left. Best: ${fmt(st.best || 0)}</span>`;
      eyes.draw(-0.4);
      hud();
    });
  }
  function go() {
    $('pReady').hidden = true;
    last = performance.now(); acc = 0;
    cue('HUT!', 0.5);
    raf = requestAnimationFrame(loop);
  }
  $('pSnap').addEventListener('click', go);

  function newScene() {
    S = instinctScene(run.sim);
    S.overlay = ground; S.hud = screen;
    eyes.setScene(S);
    extendInstinct(S, 0);
    simShown = run.sim;
    renderThrows();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt;
    pollPad();
    while (acc >= STEP && run.phase !== 'over') {
      acc -= STEP;
      const before = run.sim, had = !!before.result, level = run.level;
      let u = currentInput();
      if (autoplay && run.phase === 'snap') { const a = idealPolicy(C, run.sim.snap)(run.sim); if (a.action) run.act(a.action); u = a; }
      run.step(u);
      if (!had && before.result) onResult(before.result);
      if (run.sim !== before) { newScene(); cue(run.level > level ? `LEVEL ${run.level}` : 'HUT!', 0.7); }
    }
    if (run.phase !== 'between') {
      // an open ally's tag turns green too (on the field and on the edge markers), so it reads at any distance
      for (const a of run.sim.snap.allies) if (S.byId[a.id]) S.byId[a.id].glow = isOpen(C, a, run.sim.t) && (!run.sim.result || run.sim.result.target === a.id);
      extendInstinct(S, run.sim.t); eyes.draw(run.sim.t);
    }
    hud();
    if (run.phase === 'over') { setTimeout(report, 350); return; }
    raf = requestAnimationFrame(loop);
  }

  function onResult(r) {
    const words = { complete: 'COMPLETE', incomplete: 'INCOMPLETE', pick: 'PICKED OFF', 'throw-away': 'THROWN AWAY', grounding: 'GROUNDING', hit: 'HIT!' };
    cue(words[r.kind] + (r.kind === 'complete' ? `  ×${run.multiplier.toFixed(1)}` : ''), 0.9);
    if (r.kind === 'complete' || r.kind === 'incomplete' || r.kind === 'pick') setThrow(S, r.target, r.t, r.catchT, r.catchAt);
    else if (r.kind === 'throw-away' || r.kind === 'grounding') {
      const fr = run.sim.snap.frame, side = Math.sign(r.release.x) || 1, x = side > 0 ? fr.rightSideline + 1.5 : fr.leftSideline - 1.5;
      setThrow(S, null, r.t, r.t + Math.hypot(x - r.release.x, 2 - r.release.y) / C.drills.ball.speed, { x, y: 2 });
    }
  }

  function cue(text, secs) {
    const el = $('cue'); el.textContent = text; el.classList.add('on');
    clearTimeout(banner); banner = setTimeout(() => el.classList.remove('on'), secs * 1000);
  }

  const fmt = (t) => `${t.toFixed(1)} s`;
  function hud() {
    if (!run) return;
    // the ball he has now counts as it goes (up to the hot clock)
    const sim = run.sim, now = run.phase === 'snap' && !sim.result ? Math.min(I.scoring.hot_clock, Math.max(0, sim.t - I.snap.catch)) : 0;
    $('hudRep').textContent = `Hang ${fmt(run.hang + now)}`;
    $('hudXp').textContent = `×${run.multiplier.toFixed(1)} · ${Math.round(run.score * 10)} pts`;
    $('hudCall').textContent = `Level ${run.level} · ${run.completions} complete`;
    $('hudTest').hidden = I.reviewed;
  }

  // ------------------------------------------------------------ input
  function currentInput() {
    if (keys.size) {
      let mx = 0, my = 0;
      for (const k of keys) { const v = PAD_KEYS[k] || PAD_KEYS[k.toLowerCase()]; if (v) { mx += v[0]; my += v[1]; } }
      const m = Math.hypot(mx, my);
      if (m) { const scale = keys.has('Shift') ? 1 : C.pocket.movement.run_at * 0.9; return { mx: (mx / m) * scale, my: (my / m) * scale }; }
    }
    return input;
  }
  function act(a) { if (run && run.phase === 'snap') run.act(a); }

  function renderThrows() {
    // the five buttons never move: each ally always wears the same shape, so his thumb learns where it is
    const here = new Set(run.sim.snap.allies.map((a) => a.id));
    $('pThrows').innerHTML = ALLY_IDS.map((id) => `<button type="button" class="throw b-${id}" data-id="${id}" ${here.has(id) ? '' : 'disabled'}>${SHAPES[id]}</button>`).join('') +
      '<button type="button" class="away" data-a="throw-away">Throw it away</button>';
  }
  $('pThrows').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    e.preventDefault();
    act(b.dataset.a === 'throw-away' ? { kind: 'throw-away' } : { kind: 'throw', target: b.dataset.id });
  });

  // the pad (right thumb)
  const pad = $('pPad'), knob = $('pKnob');
  let padId = null;
  const padAt = (e) => {
    const b = pad.getBoundingClientRect(), R = b.width / 2;
    let dx = (e.clientX - b.left - R) / R, dy = -(e.clientY - b.top - R) / R;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    input = { mx: dx, my: dy };
    knob.style.transform = `translate(${dx * R * 0.72}px, ${-dy * R * 0.72}px)`;
  };
  pad.addEventListener('pointerdown', (e) => { padId = e.pointerId; pad.setPointerCapture(e.pointerId); padAt(e); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padAt(e); });
  const padUp = (e) => { if (e.pointerId !== padId) return; padId = null; input = { mx: 0, my: 0 }; knob.style.transform = ''; };
  pad.addEventListener('pointerup', padUp); pad.addEventListener('pointercancel', padUp);

  // desktop: the keyboard, and a mouse click on an ally
  window.addEventListener('keydown', (e) => {
    if (!run || !document.body.classList.contains('pocket')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (PAD_KEYS[k] || k === 'Shift') { keys.add(k); e.preventDefault(); }
    if (THROW_KEYS[k] && !$('pReady').hidden) { if (k === ' ') { go(); e.preventDefault(); } return; }
    if (THROW_KEYS[k]) { act({ kind: 'throw', target: THROW_KEYS[k] }); e.preventDefault(); }
    if (k === 't') act({ kind: 'throw-away' });
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); });
  $('view').addEventListener('pointerdown', (e) => {
    if (!run || e.pointerType !== 'mouse' || !S || !S.screen) return;
    const b = $('view').getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    let best = null, d0 = Infinity;
    for (const a of run.sim.snap.allies) { const p = S.screen[a.id]; if (!p) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < p.r && d < d0) { d0 = d; best = a.id; } }
    if (best) act({ kind: 'throw', target: best });
  });

  // a game controller
  function pollPad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!gp) return;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (Math.hypot(ax, ay) > 0.15) input = { mx: ax, my: -ay }; else if (padId === null) input = { mx: 0, my: 0 };
    gp.buttons.forEach((b, i) => {
      if (b.pressed && !gpPrev[i]) {
        if (PAD_BUTTONS[i]) act({ kind: 'throw', target: PAD_BUTTONS[i] });
        if (i === 4) act({ kind: 'throw-away' });
        if (i === 9 && !$('pReady').hidden) go();
      }
    });
    gpPrev = gp.buttons.map((b) => b.pressed);
  }
  window.addEventListener('gamepadconnected', () => { if (!$('pReady').hidden) requestAnimationFrame(function wait() { pollPad(); if (!$('pReady').hidden && run) requestAnimationFrame(wait); }); });

  // ------------------------------------------------------------ what he sees on the field
  function ground({ ctx: g, proj, t }) {
    const sim = S && S.isim; if (!sim || t <= 0) return;
    // the pocket edge: a ring around his set point that bends in where a rusher is closer
    const set = sim.set, R0 = C.pocket.pocket_edge;
    const near = sim.hitters.filter((l) => l.phase !== 'approach' && l.phase !== 'drop').map((l) => sim.pos(l.h.id, Math.min(t, sim.t)));
    const pts = []; let hot = false;
    for (let a = -1.9; a <= 1.9001; a += 0.1) {
      let rr = R0;
      for (const q of near) {
        const dx = q.x - set.x, dy = q.y - set.y, d = Math.hypot(dx, dy);
        let da = Math.atan2(dx, dy) - a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) < 0.45 && d - 0.4 < rr) { rr = Math.max(0.6, d - 0.4); hot = true; }
      }
      pts.push(proj(set.x + rr * Math.sin(a), set.y + rr * Math.cos(a), 0));
    }
    g.save(); g.strokeStyle = hot ? 'rgba(201,74,22,0.9)' : 'rgba(242,193,78,0.85)'; g.lineWidth = 3; g.setLineDash([10, 6]);
    g.beginPath(); let on = false;
    for (const p of pts) { if (p.dy < 0.3) { on = false; continue; } if (on) g.lineTo(p.x, p.y); else { g.moveTo(p.x, p.y); on = true; } }
    g.stroke(); g.restore();
    // an open ally glows on the ground under him (never on his button)
    for (const a of sim.snap.allies) {
      if (!isOpen(C, a, t) || (sim.result && sim.result.target !== a.id)) continue;
      const q = sim.pos(a.id, t), c0 = proj(q.x, q.y, 0); if (c0.dy < 0.5) continue;
      const e1 = proj(q.x, q.y - 1.1, 0), e2 = proj(q.x, q.y + 1.1, 0);
      g.save(); g.fillStyle = 'rgba(107,203,147,0.55)'; g.strokeStyle = 'rgba(47,125,79,0.95)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(c0.x, c0.y, Math.max(8, 1.3 * c0.sc), Math.max(3, Math.abs(e1.y - e2.y) / 2), 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore();
    }
  }
  function screen({ ctx: g, cam, t, W, H, FOV }) {
    const sim = S && S.isim; if (!sim || t <= 0) return;
    // blind side: a rusher who has won outside his view flickers on that edge of the screen (PRD §6.9)
    if (!sim.result) for (const l of sim.hitters) {
      if (l.phase !== 'free' && !(l.h.kind === 'push' && t >= l.h.win)) continue;
      const q = sim.pos(l.h.id, Math.min(t, sim.t));
      let a = Math.atan2(q.x - cam.x, q.y - cam.y) - cam.yaw; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
      if (Math.abs(a) < FOV / 2 - 0.05) continue;
      const right = a > 0, pulse = 0.35 + 0.35 * Math.abs(Math.sin(t * 14));
      const grad = g.createLinearGradient(right ? W : 0, 0, right ? W - 70 : 70, 0);
      grad.addColorStop(0, `rgba(201,74,22,${pulse})`); grad.addColorStop(1, 'rgba(201,74,22,0)');
      g.fillStyle = grad; g.fillRect(right ? W - 70 : 0, 0, 70, H);
    }
    // the hot clock: how much of this ball still counts as hang time
    if (!sim.result && t > I.snap.catch) {
      const u = Math.min(1, (t - I.snap.catch) / I.scoring.hot_clock), x = W / 2, y = H - 130;
      g.save(); g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = u < 1 ? '#F2C14E' : '#F97066'; g.beginPath(); g.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); g.stroke(); g.restore();
    }
  }

  // ------------------------------------------------------------ the run report
  function report() {
    cancelAnimationFrame(raf);
    const p = progress(), st = p.instinct || { best: 0, bestScore: 0, runs: 0 };
    const pts = Math.round(run.score * 10), newBest = run.hang > (st.best || 0);
    p.instinct = { best: Math.max(st.best || 0, run.hang), bestScore: Math.max(st.bestScore || 0, pts), runs: (st.runs || 0) + 1, lastLevel: run.level };
    p.xp += pts; p.reps += run.log.length;
    save();
    const log = run.log, end = log[log.length - 1];
    const how = end.result.kind === 'pick' ? `Picked off throwing to ${SHAPES[end.result.target]} ${end.result.target}`
      : end.result.by === 'clock' ? 'Held the ball too long' : `Hit by #${end.snap.hitters.find((h) => h.id === end.result.by)?.number ?? ''} from your ${side(run.sim.pos(end.result.by, end.result.t).x - run.sim.pos('QB', end.result.t).x)}`;
    const moves = {};
    for (const l of log) if (l.grade) { const k = l.snap.pattern.id; moves[k] = moves[k] || [0, 0]; moves[k][1]++; if (l.grade === 'best') moves[k][0]++; }
    const reacts = log.filter((l) => l.grade && l.moveStart !== null && Number.isFinite(l.real)).map((l) => l.moveStart - l.real);
    const off = C.quarterback.throwing_hand === 'left' ? 1 : -1;
    const win = { blind: [0, 0], hand: [0, 0] };
    for (const l of log) for (const w of l.windows) { const k = w.side === off ? 'blind' : 'hand'; win[k][1]++; if (w.caught) win[k][0]++; }
    const ball = log.filter((l) => l.result.kind !== 'hit').map((l) => l.held);
    const row = (a, b) => `<li><span>${a}</span><b>${b}</b></li>`;
    $('pRepTitle').textContent = newBest ? 'New best!' : 'Run over';
    $('pRepBig').textContent = fmt(run.hang);
    $('pRepList').innerHTML =
      row('Score', `${pts} pts (best ${p.instinct.bestScore})`) + row('Best hang', fmt(p.instinct.best)) +
      row('Completions', `${run.completions} · level ${run.level}`) + row('How it ended', esc(how)) +
      Object.entries(moves).map(([k, v]) => row(`Right move vs ${esc(lower(term(I.patterns.find((x) => x.id === k).terms[0])))}`, `${v[0]} of ${v[1]}`)).join('') +
      (reacts.length ? row('Reaction to pressure', `${(reacts.reduce((a, b) => a + b, 0) / reacts.length >= 0 ? '+' : '')}${(reacts.reduce((a, b) => a + b, 0) / reacts.length).toFixed(2)} s from when it turned real`) : '') +
      row('Open allies caught, throwing-hand side', `${win.hand[0]} of ${win.hand[1]}`) + row('Open allies caught, blind side', `${win.blind[0]} of ${win.blind[1]}`) +
      (ball.length ? row('Ball out after', `${(ball.reduce((a, b) => a + b, 0) / ball.length).toFixed(1)} s on average`) : '');
    $('pReport').classList.add('on');
    renderHome();
  }
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const side = (dx) => (Math.abs(dx) < 0.8 ? 'front' : (dx < 0) === (C.quarterback.throwing_hand === 'left') ? 'throwing-hand side' : 'blind side');

  $('pAgain').addEventListener('click', () => { $('pReport').classList.remove('on'); start(); });
  $('pDone').addEventListener('click', () => leave());
  $('pBd').addEventListener('click', () => openBreakdown());

  function leave() {
    cancelAnimationFrame(raf);
    const p = progress();
    if (run && run.log.length) { Object.assign(p, finishWorkout(C, p, ctx.today())); save(); }
    run = null; S = null;
    document.body.classList.remove('pocket');
    $('pReport').classList.remove('on');
    show('home'); renderHome();
  }

  // ------------------------------------------------------------ the last snap from above
  let bd = null;
  function openBreakdown() {
    const sim = simShown;
    const ideal = new SnapSim(C, sim.snap), pol = idealPolicy(C, sim.snap);
    while (!ideal.result) { const u = pol(ideal); if (u.action) ideal.act(u.action); ideal.step(u); }
    bd = { sim, ideal, t: sim.t, end: sim.t };
    const pat = sim.snap.pattern, l = run.log[run.log.length - 1];
    const line = (k, d) => `<p><b>${esc(k)}:</b> ${esc(d)}</p>`;
    const right = { stand: term('clean-pocket'), 'ball-out': term('hot-route'), climb: term('climb'), 'pocket-slide': term('pocket-slide'), 'pocket-escape': term('pocket-escape') }[pat.response];
    const sections = [
      { h: term(pat.terms[0]), body: pat.terms.map((id) => line(term(id), def(id))).join('') },
      { h: `The right move: ${right}`, body: pat.response === 'stand' ? line(term('happy-feet'), def('happy-feet')) : pat.response === 'ball-out' ? line(term('free-rusher'), def('free-rusher')) : line(term(pat.response), def(pat.response)) },
    ];
    if (Number.isFinite(sim.snap.real)) sections.push({ h: 'When the pressure turned real', body: `<p>At ${sim.snap.real.toFixed(1)} s. ${sim.moveStart === null ? 'You did not move.' : `You moved at ${sim.moveStart.toFixed(1)} s.`} Standing still, you would have been hit at ${sim.snap.arrive.toFixed(1)} s.</p>` });
    if (l && (l.result.kind === 'grounding' || l.result.kind === 'throw-away')) sections.push({ h: term('throwaway'), body: line(term('free-blocking-zone'), def('free-blocking-zone')) + line(term('throwaway'), def('throwaway')) });
    $('pbdTitle').textContent = `Last snap · level ${sim.snap.level} · ${term(pat.terms[0])}`;
    $('pWhy').innerHTML = sections.map((s) => `<section><h3>${esc(s.h)}</h3>${s.body}</section>`).join('');
    show('pbreakdown');
    requestAnimationFrame(drawBd);
  }
  function drawBd() { if (!bd) return; drawInstinctBoard($('pBoard'), bd.sim, bd.ideal, bd.t); $('pbdTime').textContent = `${bd.t.toFixed(1)} s`; $('pbdScrub').value = String(Math.round((bd.t / bd.end) * 1000)); }
  $('pbdScrub').addEventListener('input', () => { if (!bd) return; bd.t = (Number($('pbdScrub').value) / 1000) * bd.end; drawBd(); });
  $('pbdPlay').addEventListener('click', () => {
    if (!bd) return; bd.t = 0; let prev = performance.now();
    const tick = (now) => { if (!bd) return; bd.t = Math.min(bd.end, bd.t + (now - prev) / 1000); prev = now; drawBd(); if (bd.t < bd.end) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  $('pbdClose').addEventListener('click', () => { show('rep'); eyes.resize(); eyes.draw(simShown ? simShown.t : 0); });

  return { start, end: () => leave(), isOn: () => !!run, best: () => (progress().instinct || {}).best || 0, rampAt: (l) => rampAt(C, l) };
}
