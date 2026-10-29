// Bubble (PRD §8.4): the Pocket workout. From his eyes, live: the rush comes, he moves with the pad (right thumb)
// and gets rid of the ball with the buttons (left thumb). All football comes from content/pocket/rules.yaml through
// src/pocket; this file only draws, takes input and keeps score.
import { STEP, PocketSim, makePocketRep, gradePocket, idealPolicy, runPolicy } from '../pocket';
import { progression } from './drill';
import { liveScene, extendLive, setThrow, SHAPES } from './eyes.js';
import { drawPocketBoard } from './board.js';

const MODES = ['good', 'bad', 'unpredictable'];

export function initPocket(ctx) {
  const { C, eyes, $, show, term, def, esc, progress, save, renderHome, finishWorkout } = ctx;
  const P = C.pocket;
  let session = null, rep = null, sim = null, S = null, raf = 0, input = { mx: 0, my: 0 }, keys = new Set(), done = false, endAt = Infinity, last = 0, acc = 0;

  // ------------------------------------------------------------ protection mode (PRD §8.4): the planner, or a parent override
  /** Bad when he bails late or takes sacks, Good when he leaves clean pockets early, Unpredictable once both are stable. */
  function plannedMode() {
    const p = progress();
    if (MODES.includes(p.pocketMode)) return p.pocketMode;
    const recent = (p.pocket || []).slice(-8);
    if (recent.filter((r) => r.sack || r.late).length >= 3) return 'bad';
    if (recent.filter((r) => r.happy).length >= 2) return 'good';
    return recent.length >= 6 ? 'unpredictable' : 'good';
  }

  function start() {
    const fixed = Number(new URLSearchParams(location.search).get('seed'));
    session = { seed: fixed || ((Date.now() / 1000) | 0), i: 0, results: [], xp: 0 };
    document.body.classList.add('pocket');
    show('rep');
    requestAnimationFrame(() => { eyes.resize(); next(); });
  }

  function next() {
    $('pResult').classList.remove('on');
    if (session.i >= P.reps) { wrap(); return; }
    const p = progress();
    rep = makePocketRep(C, p.tier, plannedMode(), session.seed, session.i, p.playtest);
    if (!rep) { wrap(); return; }
    session.i++;
    sim = new PocketSim(C, rep);
    S = liveScene(rep, sim);
    S.overlay = groundOverlay; S.hud = screenOverlay;
    S.yawOverride = null;
    eyes.setScene(S);
    extendLive(S, 0);
    done = false; endAt = Infinity; input = { mx: 0, my: 0 };
    $('hudRep').textContent = `Pocket ${session.i} of ${P.reps}`;
    $('hudXp').textContent = `${session.xp} XP`;
    $('hudTest').hidden = rep.reviewed;
    const concept = C.concepts.concepts.find((x) => x.id === rep.call.concept);
    const protection = C.protections.protections.find((x) => x.id === rep.call.protection);
    $('hudCall').textContent = `${rep.play.offense.formation.name} · ${concept.name} · ${protection.name}`;
    $('pCall').innerHTML = `<b>${esc(rep.play.offense.formation.name)} · ${esc(concept.name)}</b><span>${esc(protection.name)} · first read ${esc(SHAPES[rep.firstRead] || '')} ${esc(rep.firstRead || '')}</span>`;
    renderThrows();
    $('pReady').hidden = false;
    eyes.draw(-1.0);
  }

  function renderThrows() {
    // every receiver running a route, in his read order (all his options, not just three)
    const ids = progression(C, rep.play);
    $('pThrows').innerHTML = ids.map((id, k) => `<button type="button" class="throw" data-a="throw" data-id="${id}">${k < 3 ? `<small>${k + 1}</small>` : ''}${esc(SHAPES[id] || '')} ${id}</button>`).join('') +
      '<button type="button" data-a="run">Run</button><button type="button" data-a="throw-away">Throw it away</button>';
  }
  $('pThrows').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button'); if (!b || !sim || done) return;
    e.preventDefault();
    act(b.dataset.a === 'throw' ? { kind: 'throw', target: b.dataset.id } : { kind: b.dataset.a });
  });
  function act(a) { if (sim && sim.t > 0 && !sim.result) sim.act(a); }

  // ------------------------------------------------------------ the snap and the live loop
  $('pSnap').addEventListener('click', () => {
    $('pReady').hidden = true;
    // cadence, then the snap
    let t = -0.7, prev = performance.now();
    const cue = $('cue');
    const pre = (now) => {
      t = Math.min(0, t + (now - prev) / 1000); prev = now;
      cue.textContent = t < -0.35 ? 'SET…' : 'HUT!'; cue.classList.add('on');
      eyes.draw(t);
      if (t < 0) { raf = requestAnimationFrame(pre); return; }
      last = performance.now(); acc = 0;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(pre);
  });

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt;
    while (acc >= STEP) {
      acc -= STEP;
      const had = !!sim.result;
      sim.step(currentInput());
      if (!had && sim.result) onResult();
      if (sim.t >= endAt) break;
    }
    if (sim.t > 0.35) $('cue').classList.remove('on');
    extendLive(S, sim.t);
    eyes.draw(sim.t);
    updateButtons();
    if (sim.t >= endAt) { finish(); return; }
    raf = requestAnimationFrame(loop);
  }

  function currentInput() {
    let { mx, my } = input;
    if (keys.size) {
      mx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      my = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
      const scale = keys.has('Shift') ? 1 : P.movement.run_at * 0.9; // Shift: run
      const m = Math.hypot(mx, my) || 1; mx = (mx / m) * scale; my = (my / m) * scale;
    }
    return { mx, my };
  }

  function updateButtons() {
    const can = sim.canThrow && !sim.running;
    for (const b of $('pThrows').querySelectorAll('button')) b.disabled = !can && b.dataset.a !== 'run' ? true : !!sim.result;
  }

  function onResult() {
    const r = sim.result;
    sim.coast = true;
    if (r.kind === 'throw') { setThrow(S, r.target, r.t, r.catchT, r.catchAt); endAt = Math.min(r.catchT + 0.5, sim.t + 1.6); }
    else if (r.kind === 'throw-away') {
      const side = Math.sign(r.release.x) || 1, fr = rep.play.offense.frame, x = side > 0 ? fr.rightSideline + 1.5 : fr.leftSideline - 1.5;
      const tc = r.t + Math.hypot(x - r.release.x, 3 - r.release.y) / C.drills.ball.speed;
      setThrow(S, null, r.t, tc, { x, y: 3 }); endAt = Math.min(tc + 0.2, sim.t + 1.4);
    } else { endAt = sim.t + 1.0; }
    const cue = $('cue');
    cue.textContent = r.kind === 'sack' || r.kind === 'held' ? 'SACKED' : r.kind === 'throw-away' ? (r.legal ? 'THROWN AWAY' : 'GROUNDING') : r.kind === 'run' ? 'RUNNING' : '';
    cue.classList.toggle('on', !!cue.textContent);
  }

  // ------------------------------------------------------------ the pad (right thumb) and the keyboard
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
  const release = (e) => { if (e.pointerId !== padId) return; padId = null; input = { mx: 0, my: 0 }; knob.style.transform = ''; };
  pad.addEventListener('pointerup', release); pad.addEventListener('pointercancel', release);
  window.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('pocket') || !sim) return;
    if (e.key.startsWith('Arrow') || e.key === 'Shift') { keys.add(e.key); e.preventDefault(); }
    const ids = progression(C, rep.play);
    if (/^[1-9]$/.test(e.key) && ids[Number(e.key) - 1]) act({ kind: 'throw', target: ids[Number(e.key) - 1] });
    if (e.key === 'r') act({ kind: 'run' });
    if (e.key === 't') act({ kind: 'throw-away' });
    if (e.key === ' ' && !$('pReady').hidden) $('pSnap').click();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key));

  // ------------------------------------------------------------ what he sees on the field
  /** The pocket edge on the ground: a ring around his set point that bends in where a rusher is closer. */
  function groundOverlay({ ctx: g, proj, t }) {
    if (!sim || t <= 0) return;
    const set = sim.set, R0 = P.pocket_edge;
    const near = sim.rushers.filter((r) => r.phase !== 'approach').map((r) => sim.pos(r.s.role, Math.min(t, sim.t)));
    const pts = [];
    let hot = false;
    for (let a = -1.9; a <= 1.9001; a += 0.1) {
      let rr = R0;
      for (const q of near) {
        const dx = q.x - set.x, dy = q.y - set.y, d = Math.hypot(dx, dy), ang = Math.atan2(dx, dy);
        let da = ang - a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) < 0.45 && d - 0.4 < rr) { rr = Math.max(0.6, d - 0.4); hot = true; }
      }
      pts.push(proj(set.x + rr * Math.sin(a), set.y + rr * Math.cos(a), 0));
    }
    g.save();
    g.strokeStyle = hot ? 'rgba(201,74,22,0.9)' : 'rgba(242,193,78,0.85)'; g.lineWidth = 3; g.setLineDash([10, 6]);
    g.beginPath(); let on = false;
    for (const p of pts) { if (p.dy < 0.3) { on = false; continue; } if (on) g.lineTo(p.x, p.y); else { g.moveTo(p.x, p.y); on = true; } }
    g.stroke(); g.restore();
    // youth: a lane hint once the pressure is real (PRD §8.4 progression)
    const T = P.tiers[rep.tier];
    if (T.hints && Number.isFinite(rep.real) && t >= rep.real - 0.2 && t < rep.real + 1.2 && !sim.result) {
      const dir = { climb: [0, 1], 'pocket-slide': [-rep.side, 0], 'pocket-escape': [rep.side, 0.4] }[rep.type.response];
      if (dir) {
        const q = sim.pos('QB', Math.min(t, sim.t)), a = proj(q.x + dir[0] * 1.2, q.y + 1.0 + dir[1] * 1.2, 0), b = proj(q.x + dir[0] * 3, q.y + 1.0 + dir[1] * 3, 0);
        if (a.dy > 0.3 && b.dy > 0.3) { g.save(); g.strokeStyle = 'rgba(107,203,147,0.95)'; g.lineWidth = 6; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.restore(); }
      }
    }
  }

  /** Blind-side pressure (PRD §6.9): a rusher who has won outside his view flickers on that edge of the screen. */
  function screenOverlay({ ctx: g, cam, t, W, H, FOV }) {
    if (!sim || t <= 0 || sim.result) return;
    for (const r of sim.rushers) {
      if (r.phase !== 'free' && !(r.s.kind === 'push' && t >= r.s.win)) continue;
      const q = sim.pos(r.s.role, Math.min(t, sim.t));
      let a = Math.atan2(q.x - cam.x, q.y - cam.y) - cam.yaw;
      while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
      if (Math.abs(a) < FOV / 2 - 0.05) continue;
      const right = a > 0, pulse = 0.35 + 0.35 * Math.abs(Math.sin(t * 14));
      const grad = g.createLinearGradient(right ? W : 0, 0, right ? W - 70 : 70, 0);
      grad.addColorStop(0, `rgba(201,74,22,${pulse})`); grad.addColorStop(1, 'rgba(201,74,22,0)');
      g.fillStyle = grad; g.fillRect(right ? W - 70 : 0, 0, 70, H);
    }
  }

  // ------------------------------------------------------------ result and Breakdown
  const MOVE_NAME = { stand: 'Stay in the pocket', climb: term('climb'), 'pocket-slide': term('pocket-slide'), 'pocket-escape': term('pocket-escape'), 'ball-out': 'Ball out before he gets there' };
  const DID = { stand: 'you stayed', climb: 'you climbed', 'pocket-slide': 'you slid', 'pocket-escape': 'you escaped' };
  const BALL = { complete: 'Complete: an open receiver', covered: 'Thrown to a covered receiver', run: 'You ran', 'throw-away': 'Thrown away, legally', grounding: 'Intentional grounding: thrown away inside the free-blocking zone', none: 'The ball never came out' };

  function finish() {
    cancelAnimationFrame(raf);
    done = true;
    $('cue').classList.remove('on');
    const g = gradePocket(C, sim);
    const late = g.timing === false && (sim.moveStart === null || sim.moveStart > rep.real);
    const p = progress();
    p.xp += g.xp; p.reps += 1;
    p.pocket = [...(p.pocket || []), { type: rep.type.id, sack: g.sacked, late, happy: rep.type.response === 'stand' && g.move === 'wrong' }].slice(-30);
    save();
    session.xp += g.xp;
    session.results.push({ rep, sim, g });
    $('hudXp').textContent = `${session.xp} XP`;
    const mark = (v) => (v === true || v === 'best' ? '<span class="yes">✓</span>' : v === 'admissible' ? '<span class="part">~</span>' : '<span class="no">✗</span>');
    const rows = [];
    if (g.move !== null) rows.push(`<li class="span">${mark(g.move)}<span>${esc(MOVE_NAME[rep.type.response])}${g.move === 'best' ? '' : ` (${DID[g.path.kind]}${g.path.side ? (g.path.side < 0 ? ' left' : ' right') : ''})`}${g.move === 'admissible' ? '<small>You got away, but it was not the best move</small>' : ''}</span></li>`);
    if (g.timing !== null) rows.push(`<li class="span">${mark(g.timing)}<span>Timing: ${sim.moveStart === null ? 'you never moved' : `you moved at ${sim.moveStart.toFixed(1)} s`}; the pressure turned real at ${rep.real.toFixed(1)} s</span></li>`);
    rows.push(`<li class="span">${mark(!g.sacked)}<span>${g.sacked ? 'Sacked' : 'No sack'}</span></li>`);
    if (!g.sacked) rows.push(`<li class="span">${mark(['complete', 'run', 'throw-away'].includes(g.ball))}<span>${esc(BALL[g.ball])}</span></li>`);
    if (g.onTime !== null) rows.push(`<li class="span">${mark(g.onTime)}<span>${rep.type.response === 'ball-out' ? 'Ball out before the free rusher got there' : `Ball out by ${P.on_time} s`}</span></li>`);
    rows.push(`<li class="span"><span class="yes">+</span><span>${g.xp} XP · ${esc(term(rep.type.terms[0]))}</span></li>`);
    $('pResTitle').textContent = g.sacked ? 'Sacked' : g.move === 'best' && ['complete', 'run', 'throw-away'].includes(g.ball) ? 'Great pocket' : g.move === 'wrong' ? 'Wrong move' : 'Survived';
    $('pResList').innerHTML = rows.join('');
    $('pNext').textContent = session.i >= P.reps ? 'Finish' : 'Next play';
    $('pResult').classList.add('on');
  }
  $('pNext').addEventListener('click', () => next());
  $('pBd').addEventListener('click', () => openBreakdown(session.results[session.results.length - 1]));

  let bd = null;
  function openBreakdown(x) {
    const ideal = runPolicy(C, x.rep, idealPolicy(C, x.rep));
    const end = Math.max(x.sim.t, 0.5);
    bd = { x, ideal, t: end, end, playing: false };
    const t = x.rep.type, g = x.g;
    const line = (k, d) => `<p><b>${esc(k)}:</b> ${esc(d)}</p>`;
    const sections = [
      { h: `${term(t.terms[0])}`, body: t.terms.map((id) => line(term(id), def(id))).join('') },
      { h: `The right move: ${MOVE_NAME[t.response]}`, body: (t.response === 'stand' ? line(term('clean-pocket'), def('clean-pocket')) + line(term('happy-feet'), def('happy-feet')) : t.response === 'ball-out' ? line(term('free-rusher'), def('free-rusher')) : line(term(t.response), def(t.response))) + (t.also ? line(`Also right: ${term(t.also)}`, def(t.also)) : '') },
    ];
    if (Number.isFinite(x.rep.real)) sections.push({ h: 'When the pressure turned real', body: `<p>At ${x.rep.real.toFixed(1)} s: the first moment a rusher who had won was within ${P.rush.real_within} yd of your set point. ${x.sim.moveStart === null ? 'You did not move.' : `You moved at ${x.sim.moveStart.toFixed(1)} s.`} Standing still, you would have been sacked at ${Number.isFinite(x.rep.arrive) ? x.rep.arrive.toFixed(1) + ' s' : 'the end of the play'}.</p>` });
    if (g.ball === 'grounding' || g.ball === 'throw-away') sections.push({ h: term('throwaway'), body: line(term('free-blocking-zone'), def('free-blocking-zone')) + line(term('throwaway'), def('throwaway')) });
    if (x.sim.pending && x.sim.pending.release - x.sim.result.t !== 0 && g.ball !== 'none') { /* the release time is shown on the board */ }
    $('pbdTitle').textContent = `${term(t.terms[0])} · ${x.rep.play.offense.formation.name} vs ${x.rep.play.defense.coverage.name}`;
    $('pWhy').innerHTML = sections.map((s) => `<section><h3>${esc(s.h)}</h3>${s.body}</section>`).join('');
    show('pbreakdown');
    requestAnimationFrame(drawBd);
  }
  function drawBd() { if (bd) drawPocketBoard($('pBoard'), bd.x.rep, bd.x.sim, bd.ideal, bd.t); $('pbdTime').textContent = `${bd.t.toFixed(1)} s`; $('pbdScrub').value = String(Math.round((bd.t / bd.end) * 1000)); }
  $('pbdScrub').addEventListener('input', () => { if (!bd) return; bd.playing = false; bd.t = (Number($('pbdScrub').value) / 1000) * bd.end; drawBd(); });
  $('pbdPlay').addEventListener('click', () => {
    if (!bd) return; bd.t = 0; bd.playing = true; let prev = performance.now();
    const tick = (now) => { if (!bd || !bd.playing) return; bd.t = Math.min(bd.end, bd.t + (now - prev) / 1000); prev = now; drawBd(); if (bd.t < bd.end) requestAnimationFrame(tick); else bd.playing = false; };
    requestAnimationFrame(tick);
  });
  $('pbdClose').addEventListener('click', () => { if (bd) bd.playing = false; show('rep'); eyes.resize(); eyes.draw(sim ? sim.t : 0); });

  function wrap() {
    cancelAnimationFrame(raf);
    document.body.classList.remove('pocket');
    const p = progress();
    if (session && session.results.length) { Object.assign(p, finishWorkout(C, p, ctx.today())); save(); }
    const res = session ? session.results : [];
    $('wrapXp').textContent = `+${session ? session.xp : 0} XP`;
    $('wrapNote').textContent = `${res.filter((r) => !r.g.sacked).length} of ${res.length} plays without a sack · ${res.filter((r) => r.g.move === 'best').length} best moves`;
    $('wrapList').innerHTML = res.map((r, k) => `<p class="note">${k + 1}. ${esc(term(r.rep.type.terms[0]))}: ${r.g.sacked ? 'sacked' : r.g.move === 'best' ? 'best move' : r.g.move === 'admissible' ? 'got away' : r.g.move === 'wrong' ? 'wrong move' : 'ball out'}${r.g.onTime === false ? ', late' : ''}</p>`).join('');
    session = null; sim = null;
    show('wrap');
    renderHome();
  }

  return { start, end: () => { if (session) wrap(); }, plannedMode, isOn: () => !!session };
}
