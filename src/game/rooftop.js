// Rooftop Run (docs/plans/rooftop.md): the Pocket workout. A courier on neon rooftops at night, seen through his own
// eyes: dodge the hunter drones with the pad, toss the package to a friend the moment his lantern lights (fixed
// buttons, always in the same place), and keep the run going. The rules and every number live in src/rooftop and
// content/rooftop/rules.yaml; this file draws the city, plays the sound, takes input (touch, keyboard, mouse, game
// controller) and keeps score. Drawn in 2D canvas, no bought art.
import { STEP, Run, idealPolicy, isLit, separation, tossKeys, report, unlocked, offSign, GLYPHS, FRIEND_IDS } from '../rooftop';

const MOVE_KEYS = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0] };
// game controller (standard mapping): X Y A B RB toss, left to right like Y U I O P
const PAD_TOSS = { 2: 'y', 3: 'u', 0: 'i', 1: 'o', 5: 'p' };
const GOLD = '#FFD84D', GOLD_CORE = '#FFF4C2', HUNT = '#3FE0FF', LOCK = '#FF3B6B', WATCH = '#FF9A3C';
const NEON = ['#FF4FB8', '#3FE0FF', '#A8FF3E', '#B26BFF', '#FF9A3C'];
const FONT = '"Archivo", "Helvetica Neue", Arial, sans-serif';
const FOV = (100 * Math.PI) / 180;
const HORIZON = 0.43;

/** A small seeded random source for the city's look (the game itself uses src/rooftop's seeded rounds). */
function looks(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function initRooftop(ctx) {
  const { G, $, show, progress, save, renderHome } = ctx;
  const R = G.r;
  const canvas = $('roofView');
  const g = canvas.getContext('2d');
  const autoplay = new URLSearchParams(location.search).get('autoplay') === '1';
  const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  let run = null, raf = 0, last = 0, acc = 0, policy = null, policySim = null, on = false, started = false;
  let W = 0, H = 0, DPR = 1, F = 1, layers = null;
  const keys = new Set();
  let pad = { mx: 0, mz: 0, id: null };
  let gpPrev = [];
  const fx = { shakeT: -9, nearT: -9, nearSide: 0, catchT: -9, catchAt: null, popT: -9, commitT: -9, overT: -9, level: 0, levelT: -9 };
  let ghost = null, look = { jacket: null, trail: null }, guided = true;
  const trails = new Map();
  const audio = sound();

  // ------------------------------------------------------------ sizes and the cached city
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    F = W / 2 / Math.tan(FOV / 2);
    layers = city(W, H);
  }
  window.addEventListener('resize', () => { if (on) { resize(); draw(); } });

  /** The sky, the far skyline in three layers (with a lit-window copy that brightens with the streak), the street glow. */
  function city(w, h) {
    const mk = (cw, ch) => { const c = document.createElement('canvas'); c.width = Math.round(cw * DPR); c.height = Math.round(ch * DPR); const x = c.getContext('2d'); x.scale(DPR, DPR); return [c, x]; };
    const hy = h * HORIZON;
    const [sky, s] = mk(w, h);
    let gr = s.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#05030F'); gr.addColorStop(0.32, '#1A0B33'); gr.addColorStop(HORIZON, '#3B1458'); gr.addColorStop(HORIZON + 0.02, '#160A26'); gr.addColorStop(1, '#030208');
    s.fillStyle = gr; s.fillRect(0, 0, w, h);
    const rnd = looks(7);
    s.fillStyle = '#FFFFFF';
    for (let i = 0; i < 140; i++) { s.globalAlpha = 0.2 + rnd() * 0.6; const r = rnd() * 1.2 + 0.3; s.fillRect(rnd() * w, rnd() * hy * 0.8, r, r); }
    s.globalAlpha = 1;
    // the moon, haloed
    const mx = w * 0.78, my = h * 0.12, mr = Math.max(14, h * 0.035);
    gr = s.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 5); gr.addColorStop(0, 'rgba(255,214,240,0.25)'); gr.addColorStop(1, 'rgba(255,214,240,0)');
    s.fillStyle = gr; s.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    s.fillStyle = '#FBE9F7'; s.beginPath(); s.arc(mx, my, mr, 0, Math.PI * 2); s.fill();
    // a magenta haze along the horizon
    gr = s.createLinearGradient(0, hy - h * 0.18, 0, hy + h * 0.06); gr.addColorStop(0, 'rgba(255,79,184,0)'); gr.addColorStop(0.75, 'rgba(255,79,184,0.32)'); gr.addColorStop(1, 'rgba(255,79,184,0)');
    s.fillStyle = gr; s.fillRect(0, hy - h * 0.18, w, h * 0.24);
    // skyline layers, wider than the view so they can slide with his steps
    const sky3 = [];
    for (let L = 0; L < 3; L++) {
      const lw = w * 1.4, top = hy - h * (0.2 - L * 0.045), base = hy + h * (0.05 + L * 0.06);
      const [dark, d] = mk(lw, h), [lit, l] = mk(lw, h);
      const r2 = looks(31 + L * 17);
      const shade = ['#120A22', '#0D0719', '#080512'][L];
      let x = -10;
      while (x < lw) {
        const bw = (0.035 + r2() * 0.06) * w * (1 + L * 0.35), bh = (0.04 + r2() * (0.16 - L * 0.03)) * h * (1 + L * 0.2);
        const y = top + (hy - top) * r2() * 0.8 - bh * 0.4 + L * h * 0.02;
        d.fillStyle = shade; d.fillRect(x, y, bw, base - y + h);
        if (r2() < 0.3) { d.fillRect(x + bw * 0.45, y - bh * 0.25, Math.max(1, bw * 0.06), bh * 0.25); }
        // windows
        const cw = Math.max(2, bw / 9), ch = Math.max(2, cw * 1.3);
        for (let wy = y + ch; wy < base; wy += ch * 2) for (let wx = x + cw; wx < x + bw - cw; wx += cw * 2) {
          if (r2() < 0.42) { l.fillStyle = NEON[Math.floor(r2() * 5)]; l.globalAlpha = 0.35 + r2() * 0.5; l.fillRect(wx, wy, cw, ch); }
          else if (r2() < 0.25) { d.fillStyle = 'rgba(255,220,170,0.18)'; d.fillRect(wx, wy, cw, ch); d.fillStyle = shade; }
        }
        // a neon sign now and then
        if (r2() < 0.35) { l.globalAlpha = 0.9; l.fillStyle = NEON[Math.floor(r2() * 5)]; const sh = Math.max(3, h * 0.012); l.fillRect(x + bw * 0.15, y + bh * 0.25, bw * 0.7, sh); }
        x += bw + r2() * w * 0.012;
      }
      sky3.push({ dark, lit, lw });
    }
    // bake the skyline into the sky (one image), and its lit windows plus the horizon glow into a second one whose
    // brightness follows the streak: two full-screen copies a frame on the iPad instead of nine
    const [litAll, la] = mk(w, h);
    for (const L of sky3) { const ox = -(L.lw - w) / 2; s.drawImage(L.dark, ox, 0, L.lw, h); la.drawImage(L.lit, ox, 0, L.lw, h); }
    // glow sprites (soft round light), drawn with 'lighter'
    const sprite = (col) => { const [c, x] = mk(64, 64); const gg = x.createRadialGradient(32, 32, 0, 32, 32, 32); gg.addColorStop(0, col); gg.addColorStop(0.35, col.replace(/[\d.]+\)$/, '0.35)')); gg.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.fillStyle = gg; x.fillRect(0, 0, 64, 64); return c; };
    gr = la.createLinearGradient(0, hy - h * 0.16, 0, hy + h * 0.1); gr.addColorStop(0, 'rgba(255,79,184,0)'); gr.addColorStop(0.7, 'rgba(255,79,184,0.4)'); gr.addColorStop(1, 'rgba(255,79,184,0)');
    la.globalCompositeOperation = 'lighter'; la.fillStyle = gr; la.fillRect(0, hy - h * 0.16, w, h * 0.26); la.globalCompositeOperation = 'source-over';
    const rain = []; const r3 = looks(99);
    for (let i = 0; i < 110; i++) rain.push([r3(), r3(), 0.5 + r3() * 0.8]);
    return {
      sky, litAll, rain,
      glow: { gold: sprite('rgba(255,216,77,1)'), white: sprite('rgba(255,250,235,1)'), hunt: sprite('rgba(63,224,255,1)'), lock: sprite('rgba(255,59,107,1)'), watch: sprite('rgba(255,154,60,1)'), pink: sprite('rgba(255,79,184,1)') },
    };
  }

  /** Each round's buildings: one under each friend, with its own window texture and neon trim. */
  function buildings(round) {
    const rnd = looks(round.seed);
    return round.friends.map((f, k) => {
      const c = document.createElement('canvas'); c.width = 48; c.height = 160; const x = c.getContext('2d');
      x.fillStyle = '#100A1E'; x.fillRect(0, 0, 48, 160);
      const col = NEON[(k + Math.floor(rnd() * 5)) % 5];
      for (let wy = 6; wy < 160; wy += 9) for (let wx = 4; wx < 44; wx += 8) if (rnd() < 0.45) { x.fillStyle = rnd() < 0.7 ? 'rgba(255,214,160,0.55)' : col; x.globalAlpha = 0.4 + rnd() * 0.5; x.fillRect(wx, wy, 4, 5); }
      x.globalAlpha = 1;
      return { f, tex: c, trim: col, half: 2.4 + rnd() * 0.8, deep: 6 + rnd() * 4 };
    });
  }

  // ------------------------------------------------------------ start, loop, end
  function start() {
    const p = progress();
    const st = p.rooftop || {};
    const fixed = Number(new URLSearchParams(location.search).get('seed'));
    const startLevel = Math.max(1, (st.lastLevel || 1) - R.ramp.restart_below);
    run = new Run(G, fixed || ((Date.now() / 1000) | 0), startLevel);
    ghost = st.timeline || null;
    const un = unlocked(G, st.best || 0);
    look.jacket = (un.jackets.find((u) => u.id === st.jacket) || un.jackets[0]).color;
    look.trail = (un.trails.find((u) => u.id === st.trail) || un.trails[0]).color;
    on = true; started = false;
    guided = (st.runs || 0) < 5;
    show('roof');
    $('rReport').hidden = true;
    $('rReady').hidden = false;
    $('rBest').textContent = st.best ? `Best ${st.best.toLocaleString()}` : 'First run';
    requestAnimationFrame(() => { resize(); newRound(); draw(); hud(); });
  }
  function go() {
    if (!on || started || $('rReady').hidden) return;
    $('rGo').blur();
    $('rReady').hidden = true;
    started = true;
    audio.start();
    last = performance.now(); acc = 0;
    raf = requestAnimationFrame(loop);
  }
  $('rGo').addEventListener('click', go);

  let blds = [];
  function newRound() {
    blds = buildings(run.sim.round); trails.clear();
    renderToss();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt;
    pollPad();
    while (acc >= STEP && run.phase !== 'over') {
      acc -= STEP;
      const before = run.sim, phase = run.phase, level = run.level, streak = run.streak, pop = run.pop;
      let u = input();
      if (run.phase === 'live' && autoplay) { if (policySim !== run.sim) { policySim = run.sim; policy = idealPolicy(G); } const a = policy(run.sim); if (a.action) run.act(a.action); u = a; }
      run.step(u);
      for (const e of before.events) onEvent(e, before);
      if (phase === 'live' && run.phase !== 'live') onResult(before.result);
      if (run.sim !== before) { newRound(); if (run.level > level) { fx.level = run.level; fx.levelT = run.clock; audio.level(); } }
      if (run.pop !== pop) fx.popT = run.clock;
      if (run.streak !== streak) audio.streak(run.streak);
    }
    draw();
    hud();
    if (run.phase === 'over') {
      if (run.clock - fx.overT >= R.beats.over) { finish(); return; }
      run.clock += dt; // keep the hit beat moving
    }
    raf = requestAnimationFrame(loop);
  }
  function onEvent(e, sim) {
    if (e.kind === 'near') { fx.nearT = run.clock; const d = sim.drones.find((x) => x.id === e.id); fx.nearSide = d ? Math.sign(d.x - sim.x) : 0; audio.near(); }
    if (e.kind === 'commit') { fx.commitT = run.clock; audio.lock(); }
    if (e.kind === 'release') audio.toss();
  }
  function onResult(res) {
    if (res.kind === 'catch') { fx.catchT = run.clock; audio.catch(run.streak); }
    if (res.kind === 'drop') audio.drop();
    if (res.kind === 'hit' || res.kind === 'snatch') { fx.shakeT = run.clock; fx.overT = run.clock; audio.hit(); canvas.classList.add('over'); }
  }

  function end() {
    cancelAnimationFrame(raf);
    on = false; started = false; audio.stop();
    canvas.classList.remove('over');
    renderHome(); show('home');
  }
  $('rQuit').addEventListener('click', () => (run && run.phase !== 'over' && started ? finish() : end()));

  function finish() {
    cancelAnimationFrame(raf);
    audio.stop();
    const p = progress();
    const st = { ...(p.rooftop || {}) };
    const rep = report(run);
    const before = unlocked(G, st.best || 0);
    const newBest = run.score > (st.best || 0);
    if (newBest) { st.best = run.score; st.timeline = run.timeline; }
    st.lastLevel = run.level; st.runs = (st.runs || 0) + 1; st.deliveries = (st.deliveries || 0) + run.deliveries;
    p.rooftop = st; save();
    const after = unlocked(G, st.best || 0);
    const fresh = [...after.jackets.filter((u) => !before.jackets.includes(u)).map((u) => `${u.name} jacket`), ...after.trails.filter((u) => !before.trails.includes(u)).map((u) => `${u.name} trail`)];
    const f1 = (v) => (v == null ? '–' : `${v.toFixed(2)} s`);
    const cause = rep.end === 'snatch' ? 'A watcher was still on him: toss only when his lantern glows gold.'
      : rep.end === 'hit' ? 'Wait for the drone\'s ring to turn red, then step sideways. Move too early and it follows you.' : '';
    const side = (b, name) => `<li><b>${name}</b><span>${b.caught} of ${b.lit} lanterns${b.spot != null ? ` · spotted in ${f1(b.spot)}` : ''}</span></li>`;
    $('rRepTitle').textContent = newBest ? 'New best run!' : 'Run over';
    $('rRepBig').textContent = run.score.toLocaleString();
    $('rRepSub').textContent = newBest ? `Your best is now ${run.score.toLocaleString()}` : `Best ${(st.best || 0).toLocaleString()}`;
    $('rRepList').innerHTML = [
      `<li><b>Deliveries</b><span>${rep.deliveries} · level ${rep.level}</span></li>`,
      `<li><b>Near misses</b><span>${rep.nearMisses}</span></li>`,
      `<li><b>Drones dodged</b><span>${rep.dodged}${rep.cut != null ? ` · cut ${f1(rep.cut)} after lock-on` : ''}</span></li>`,
      side(rep.bySide.off, 'Blind side'), side(rep.bySide.throwing, 'Throwing side'),
      cause ? `<li class="tip"><span>${cause}</span></li>` : '',
      fresh.length ? `<li class="unlock"><b>Unlocked</b><span>${fresh.join(', ')}</span></li>` : '',
    ].join('');
    $('rReport').hidden = false;
    started = false;
  }
  $('rAgain').addEventListener('click', () => { canvas.classList.remove('over'); start(); });
  $('rDone').addEventListener('click', end);

  // ------------------------------------------------------------ input: pad, keys, mouse, game controller
  function input() {
    if (pad.id != null) return { mx: pad.mx, mz: pad.mz, sprint: Math.hypot(pad.mx, pad.mz) > 1 };
    let mx = 0, mz = 0;
    for (const k of keys) { const v = MOVE_KEYS[k]; if (v) { mx += v[0]; mz += v[1]; } }
    const gp = gamepad();
    if (gp && Math.hypot(gp.axes[0] || 0, gp.axes[1] || 0) > 0.2) { mx = gp.axes[0]; mz = -gp.axes[1]; return { mx, mz, sprint: Math.hypot(mx, mz) > 0.9 }; }
    const m = Math.hypot(mx, mz);
    return m ? { mx: mx / m, mz: mz / m, sprint: keys.has('Shift') } : { mx: 0, mz: 0 };
  }
  function toss(id) { if (on && started && run.phase === 'live' && run.sim.holding) run.act({ kind: 'toss', target: id }); }
  function tossKey(k) { if (!run) return; const id = tossKeys(run.sim.round).get(k); if (id) toss(id); }
  window.addEventListener('keydown', (e) => {
    if (!on) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === ' ' || k === 'Enter') { e.preventDefault(); if (!started && !$('rReady').hidden) go(); else if (!$('rReport').hidden && k === ' ') $('rAgain').click(); return; }
    if ('yuiop'.includes(k) && k.length === 1) { tossKey(k); return; }
    if (k === 'Escape') { $('rQuit').click(); return; }
    keys.add(k === 'Shift' ? 'Shift' : k);
  });
  window.addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys.delete(k); });
  window.addEventListener('blur', () => keys.clear());
  function gamepad() { const list = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of list) if (p) return p; return null; }
  function pollPad() {
    const gp = gamepad(); if (!gp) return;
    const now = gp.buttons.map((b) => b.pressed);
    now.forEach((p, i) => { if (p && !gpPrev[i]) { if (PAD_TOSS[i]) tossKey(PAD_TOSS[i]); if (i === 9) go(); } });
    gpPrev = now;
  }
  const padEl = $('rPad'), knob = $('rKnob');
  function padMove(e) {
    const r = padEl.getBoundingClientRect(), rad = r.width / 2;
    let dx = (e.clientX - r.left - rad) / (rad * 0.72), dz = -(e.clientY - r.top - rad) / (rad * 0.72);
    const m = Math.hypot(dx, dz); if (m > 1.35) { dx *= 1.35 / m; dz *= 1.35 / m; }
    pad.mx = dx; pad.mz = dz;
    knob.style.transform = `translate(${dx * rad * 0.55}px, ${-dz * rad * 0.55}px)`;
    padEl.classList.toggle('sprint', Math.hypot(dx, dz) > 1);
  }
  padEl.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.id = e.pointerId; padEl.setPointerCapture(e.pointerId); padMove(e); });
  padEl.addEventListener('pointermove', (e) => { if (e.pointerId === pad.id) padMove(e); });
  const padUp = (e) => { if (e.pointerId !== pad.id) return; pad = { mx: 0, mz: 0, id: null }; knob.style.transform = ''; padEl.classList.remove('sprint'); };
  padEl.addEventListener('pointerup', padUp); padEl.addEventListener('pointercancel', padUp);
  // a click (or tap) on a friend tosses to him
  canvas.addEventListener('pointerdown', (e) => {
    if (!run || run.phase !== 'live') return;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 60;
    for (const f of run.sim.round.friends) { const p = project(f.x, f.rise + 1.2, f.z); if (!p) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = f.id; } }
    if (best) toss(best);
  });

  // the toss buttons: one per friend, always in the same place, under his throwing thumb
  const tossEl = $('rToss');
  tossEl.innerHTML = FRIEND_IDS.map((id) => `<button type="button" data-id="${id}" aria-label="Toss to ${GLYPHS[id]}"><b>${GLYPHS[id]}</b><span></span></button>`).join('');
  tossEl.addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); if (b) { e.preventDefault(); toss(b.dataset.id); } });
  document.body.classList.toggle('roof-righty', G.hand === 'right');
  function renderToss() {
    const map = new Map([...tossKeys(run.sim.round)].map(([k, id]) => [id, k]));
    for (const b of tossEl.querySelectorAll('button')) {
      const there = run.sim.round.friends.some((f) => f.id === b.dataset.id);
      b.disabled = !there;
      b.querySelector('span').textContent = fine && there ? map.get(b.dataset.id).toUpperCase() : '';
    }
  }

  // ------------------------------------------------------------ HUD
  let shown = {};
  function setText(id, v) { if (shown[id] !== v) { shown[id] = v; $(id).textContent = v; } }
  function hud() {
    setText('rScore', run.score.toLocaleString());
    setText('rMult', `×${run.multiplier.toFixed(2).replace(/\.?0+$/, '')}`);
    $('rMult').classList.toggle('hot', run.streak >= 2);
    setText('rLevel', `Level ${run.level}`);
    // the ghost: where his best run was at this point
    if (ghost && ghost.length > 1) {
      const sec = Math.min(ghost.length - 1, Math.floor(run.clock)), u = Math.min(1, run.clock - Math.floor(run.clock));
      const at = sec + 1 < ghost.length ? ghost[sec] + (ghost[sec + 1] - ghost[sec]) * u : ghost[ghost.length - 1];
      const diff = Math.round(run.score - at);
      setText('rGhost', diff >= 0 ? `+${diff.toLocaleString()} vs best` : `${diff.toLocaleString()} vs best`);
      $('rGhostWrap').classList.toggle('ahead', diff >= 0);
      $('rGhostBar').style.width = `${Math.min(100, (run.score / Math.max(1, ghost[ghost.length - 1])) * 100)}%`;
      $('rGhostWrap').hidden = false;
    } else $('rGhostWrap').hidden = true;
    // the hot clock while he holds it
    const s = run.sim, holding = run.phase === 'live' && s.holding;
    const left = Math.max(0, R.scoring.hot_clock - s.t);
    $('rClock').hidden = !holding || !started;
    if (holding) {
      $('rClockArc').style.strokeDashoffset = String(100 - (left / R.scoring.hot_clock) * 100);
      $('rClock').classList.toggle('late', left < 1);
      setText('rClockNum', left > 0 ? left.toFixed(1) : '!');
    }
    // score pops
    const pop = $('rPop');
    if (run.pop && run.clock - fx.popT < 0.9) { setText('rPop', `+${run.pop.points}  ${run.pop.label}`); pop.style.opacity = String(1 - Math.max(0, run.clock - fx.popT - 0.5) / 0.4); pop.classList.add('on'); }
    else pop.classList.remove('on');
    const lv = $('rLevelUp');
    lv.classList.toggle('on', run.clock - fx.levelT < 1.2);
    if (run.clock - fx.levelT < 1.2) setText('rLevelUp', `LEVEL ${fx.level}`);
    for (const b of tossEl.querySelectorAll('button')) {
      b.classList.toggle('dim', !holding);
      const f = holding && s.round.friends.find((x) => x.id === b.dataset.id);
      b.classList.toggle('lit', !!f && isLit(G, f, s.t));
    }
    // first runs: say what to do right now
    guideText(s, holding);
  }

  /** Prompts for his first runs: what to do right now. */
  function guideText(s, holding) {
    const el = $('rGuide');
    let text = '', kind = '';
    if (guided && started && run.phase === 'live') {
      const live = s.drones.filter((d) => !d.gone && !d.passed);
      const lit = holding && s.round.friends.find((f) => isLit(G, f, s.t));
      if (live.some((d) => d.committed)) { text = 'RED! STEP SIDEWAYS'; kind = 'lock'; }
      else if (lit) { const key = [...tossKeys(s.round)].find(([, id]) => id === lit.id); text = `GOLD! TOSS TO ${GLYPHS[lit.id]}${fine && key ? ` (${key[0].toUpperCase()})` : ''}`; kind = 'gold'; }
      else if (live.some((d) => s.t >= d.launchT - R.drones.warn)) { text = 'DRONE COMING · WAIT FOR RED, THEN STEP'; kind = 'warn'; }
      else if (holding) { text = 'WATCH FOR A GOLD LANTERN'; kind = 'warn'; }
    }
    if (shown.rGuide !== text) { shown.rGuide = text; el.textContent = text; el.className = 'rguide' + (text ? ' on ' + kind : ''); }
  }

  // ------------------------------------------------------------ the camera and drawing
  let cam = { x: 0, y: 0, z: 0, bob: 0 };
  function project(x, y, z) {
    const dz = z - cam.z; if (dz < 0.25) return null;
    const s = F / dz;
    return { x: W / 2 + (x - cam.x) * s, y: H * HORIZON - (y - cam.y) * s, s };
  }
  function camera() {
    const s = run.sim, eye = R.courier.eye;
    const speed = Math.hypot(s.vx, s.vz);
    cam.bob = run.phase === 'live' ? Math.sin(run.clock * 11) * 0.025 * Math.min(1, speed / 4) : 0;
    cam.x = s.x; cam.y = eye + cam.bob; cam.z = s.z;
    if (run.phase === 'jump') {
      const u = Math.min(1, run.phaseT / R.beats.jump), D = -2 * R.roof.back + R.roof.gap, [sx, sz] = R.courier.start;
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      cam.x = s.x + (sx - s.x) * e; cam.z = s.z + (sz + D - s.z) * e;
      cam.y = eye + Math.sin(u * Math.PI) * 1.6 + Math.sin(u * Math.PI * 2) * 0.1;
    }
  }
  function streakGlow() { return Math.min(1, run.streak / 6); }

  function draw() {
    if (!run || !layers) return;
    camera();
    const t = run.clock;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    // a hit: a short shake (the package is gone, nothing left to read)
    const sk = t - fx.shakeT;
    if (sk >= 0 && sk < 0.35) { const a = 9 * (1 - sk / 0.35) ** 2; g.translate(a * Math.sin(t * 83), a * Math.cos(t * 71)); }
    const glow = streakGlow();
    g.drawImage(layers.sky, 0, 0, W, H);
    // the city's windows, neon and horizon glow brighten as the streak builds
    g.globalAlpha = 0.35 + 0.65 * glow; g.drawImage(layers.litAll, 0, 0, W, H); g.globalAlpha = 1;
    const s = run.sim, fade = run.phase === 'jump' ? Math.max(0, 1 - run.phaseT / (R.beats.jump * 0.5)) : run.phase === 'live' && started ? Math.min(1, s.t / 0.4) : 1;
    // far to near: friends' buildings (with friends and watchers), the next roof once the round is done, his roof,
    // then the drones (always nearer than the buildings' fronts while they hunt him)
    for (const b of [...blds].sort((a, c) => c.f.z - a.f.z)) if (fade > 0) building(b, s, fade);
    const D = -2 * R.roof.back + R.roof.gap;
    if (run.phase !== 'live') roof(D);
    roof(0);
    for (const d of s.drones.filter((x) => !x.gone && (x.launched || s.t >= x.launchT - R.drones.warn)).sort((a, c) => c.z - a.z)) drone(d, s);
    pkg(s);
    rain(t);
    hands(s);
    edges(s, t);
    // a near miss: a white rush along the side it went by
    const nm = t - fx.nearT;
    if (nm >= 0 && nm < 0.3) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * (1 - nm / 0.3); const x = fx.nearSide >= 0 ? W * 0.75 : -W * 0.25; g.drawImage(layers.glow.white, x, H * 0.1, W * 0.5, H * 0.8); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    // a catch: a warm lift for a moment
    const ct = t - fx.catchT;
    if (ct >= 0 && ct < 0.4) { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,190,120,${0.08 * (1 - ct / 0.4)})`; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
  }

  function quad(pts, fill) { g.fillStyle = fill; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); g.closePath(); g.fill(); }
  /** His roof (dz = 0) or the next one (dz = D): tar tiles, puddles that catch the neon, a lit parapet. */
  function roof(oz) {
    const hw = R.roof.half_width, z0 = R.roof.back + oz, z1 = -R.roof.back + oz;
    const near = Math.max(z0, cam.z + 0.3); if (near >= z1) return;
    const a = project(-hw, 0, near), b = project(hw, 0, near), c = project(hw, 0, z1), d = project(-hw, 0, z1);
    if (!a || !c) return;
    // the wall below the front edge, into the dark
    const fl = project(-hw, -12, z1), fr = project(hw, -12, z1);
    if (fl && fr) { const gr = g.createLinearGradient(0, d.y, 0, fl.y); gr.addColorStop(0, '#1A1030'); gr.addColorStop(1, 'rgba(10,6,20,0)'); quad([d, c, fr, fl], gr); }
    quad([a, b, c, d], '#140E22');
    // tiles
    g.strokeStyle = 'rgba(160,120,255,0.13)'; g.lineWidth = 1; g.beginPath();
    for (let x = -hw + 1; x < hw; x += 1) { const p = project(x, 0, near), q = project(x, 0, z1); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); }
    for (let z = Math.ceil(near); z < z1; z += 1) { const p = project(-hw, 0, z), q = project(hw, 0, z); if (p && q) { g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); } }
    g.stroke();
    // puddles with the city in them
    g.globalCompositeOperation = 'lighter';
    for (const [px, pz, col] of [[-2.6, -1.6, layers.glow.pink], [2.2, 0.8, layers.glow.hunt], [-0.4, 2.1, layers.glow.pink]]) {
      const p = project(px, 0, pz + oz); if (!p) continue;
      g.globalAlpha = 0.14 + 0.25 * streakGlow(); g.drawImage(col, p.x - p.s * 1.4, p.y - p.s * 0.25, p.s * 2.8, p.s * 0.5);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // the parapet: a low wall with a neon strip on the front and the sides
    const h = 0.45, col = '#FF4FB8';
    const tl = project(-hw, h, z1), tr = project(hw, h, z1);
    if (tl && tr) { quad([d, c, tr, tl], '#22163A'); line(tl, tr, col, 2.5); }
    for (const sx of [-hw, hw]) {
      const p = project(sx, h, near), q = project(sx, h, z1), p0 = project(sx, 0, near), q0 = project(sx, 0, z1);
      if (p && q) { quad([p0, q0, q, p], '#1C1230'); line(p, q, col, 2); }
    }
  }
  function line(a, b, col, w) {
    g.strokeStyle = col; g.lineWidth = w; g.globalAlpha = 0.95; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.globalAlpha = 0.25; g.lineWidth = w * 4; g.stroke(); g.globalAlpha = 1;
  }

  /** A friend's building, the friend on its edge with his lantern, and his watcher drone. */
  function building(b, s, fade) {
    const f = b.f, top = f.rise, z0 = f.z, z1 = f.z + b.deep, x0 = f.x - b.half, x1 = f.x + b.half;
    const A = project(x0, top, z0), B = project(x1, top, z0), Ab = project(x0, top - 40, z0);
    if (!A || !B) return;
    g.globalAlpha = fade;
    // sides (the one facing him), top, front with windows
    if (cam.x < x0) { const p = project(x0, top, z1), q = project(x0, top - 40, z1); if (p && q) quad([A, p, q, Ab], '#0B0716'); }
    if (cam.x > x1) { const Bb = project(x1, top - 40, z0), p = project(x1, top, z1), q = project(x1, top - 40, z1); if (p && q && Bb) quad([B, p, q, Bb], '#0B0716'); }
    if (cam.y > top) { const p = project(x1, top, z1), q = project(x0, top, z1); if (p && q) quad([A, B, p, q], '#1A1230'); }
    g.drawImage(b.tex, A.x, A.y, B.x - A.x, Math.min(H * 2, Ab.y - A.y));
    line(A, B, b.trim, 2);
    // the friend: a figure on the edge, lantern up
    const lit = isLit(G, f, s.t) && !s.result;
    const feet = project(f.x, top, z0 + 0.5); if (!feet) { g.globalAlpha = 1; return; }
    const k = feet.s * 1.35, wave = lit ? Math.sin(run.clock * 9) * 0.12 : 0;
    const hx = feet.x + f.drift * -k * (lit ? 0.32 : 0.3), hy = feet.y - k * (lit ? 2.0 + wave : 1.05);
    const figure = (w, col) => {
      g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round';
      g.lineWidth = Math.max(2, k * 0.26) + w; g.beginPath(); g.moveTo(feet.x - k * 0.15, feet.y); g.lineTo(feet.x - k * 0.08, feet.y - k * 0.85); g.moveTo(feet.x + k * 0.15, feet.y); g.lineTo(feet.x + k * 0.08, feet.y - k * 0.85); g.stroke();
      g.lineWidth = Math.max(3, k * 0.44) + w; g.beginPath(); g.moveTo(feet.x, feet.y - k * 0.85); g.lineTo(feet.x, feet.y - k * 1.42); g.stroke();
      g.lineWidth = Math.max(2, k * 0.14) + w; g.beginPath(); g.moveTo(feet.x, feet.y - k * 1.36); g.lineTo(hx, hy); g.moveTo(feet.x, feet.y - k * 1.36); g.lineTo(feet.x - f.drift * -k * 0.22, feet.y - k * 0.9); g.stroke();
      g.beginPath(); g.arc(feet.x, feet.y - k * 1.64, Math.max(2, k * 0.17) + w / 2, 0, Math.PI * 2); g.fill();
    };
    // a rim of light, then the figure in his jacket
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = (lit ? 0.75 : 0.45) * fade;
    figure(Math.max(3, k * 0.12), lit ? GOLD : b.trim);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = fade;
    figure(0, '#0A0716');
    g.lineWidth = Math.max(1.5, k * 0.2); g.strokeStyle = b.trim; g.globalAlpha = 0.55 * fade; g.beginPath(); g.moveTo(feet.x, feet.y - k * 0.95); g.lineTo(feet.x, feet.y - k * 1.32); g.stroke(); g.globalAlpha = fade;
    g.globalCompositeOperation = 'lighter';
    if (lit) {
      const pulse = 1 + Math.sin(run.clock * 8) * 0.08, r = Math.max(26, k * 2.2) * pulse;
      g.globalAlpha = 0.9 * fade; g.drawImage(layers.glow.gold, hx - r, hy - r, r * 2, r * 2);
      g.globalAlpha = fade; g.fillStyle = GOLD_CORE; g.beginPath(); g.arc(hx, hy, Math.max(3, k * 0.13), 0, Math.PI * 2); g.fill();
    } else { g.globalAlpha = 0.45 * fade; g.drawImage(layers.glow.watch, hx - 6, hy - 6, 12, 12); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = fade;
    // his tag: his shape (and his key on a computer), gold when his lantern is lit
    const keyOf = [...tossKeys(s.round)].find(([, id]) => id === f.id);
    const label = GLYPHS[f.id] + (fine && keyOf ? ' ' + keyOf[0].toUpperCase() : '');
    const ty = feet.y - k * 2.5 - 16;
    g.font = `800 ${Math.round(Math.max(13, Math.min(20, k * 0.5)))}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(label).width + 14;
    g.fillStyle = lit ? GOLD : 'rgba(10,8,20,0.8)'; roundRect(feet.x - tw / 2, ty - 11, tw, 22, 6); g.fill();
    g.strokeStyle = lit ? GOLD : 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = lit ? '#1A1206' : '#FFFFFF'; g.fillText(label, feet.x, ty + 1);
    // his watcher: tight on him, drifting off when the lantern lights
    const sep = separation(G, f, s.t);
    const w = project(f.x + f.drift * sep, top + 1.7 + Math.sin(run.clock * 3 + f.x) * 0.12, z0 + 0.2);
    if (w) mini(w, WATCH, 0.8);
    g.globalAlpha = 1;
  }
  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function mini(p, eye, size) {
    const k = p.s * size;
    g.fillStyle = '#0A0812'; g.beginPath(); g.ellipse(p.x, p.y, k * 0.35, k * 0.14, 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'lighter'; g.globalAlpha *= 0.9;
    g.drawImage(layers.glow.watch, p.x - k * 0.3, p.y - k * 0.3, k * 0.6, k * 0.6);
    g.globalCompositeOperation = 'source-over';
  }

  /** A hunter drone: four rotors, a body, an eye that turns from cyan (hunting) to red (locked on), a light trail.
   * Before it launches it hovers where it will come from, blinking inside a shrinking ring, so he sees it coming. */
  function drone(d, s) {
    const y = R.drones.height + Math.sin(run.clock * 6 + d.x) * 0.05;
    const p = project(d.x, y, d.z); if (!p) return;
    // trail
    let tr = trails.get(d); if (!tr) { tr = []; trails.set(d, tr); }
    tr.push([d.x, y, d.z]); if (tr.length > 14) tr.shift();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = d.committed ? LOCK : HUNT; g.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) { const a = project(...tr[i - 1]), b = project(...tr[i]); if (!a || !b || tr[i][2] - cam.z < 1.2) continue; g.globalAlpha = (i / tr.length) * 0.5; g.lineWidth = Math.min(10, Math.max(1, b.s * 0.12)); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // drawn larger than life so it reads at a distance; a ring marks it until it passes
    const k = Math.min(p.s * 1.7, H * 1.2);
    const bw = k * 0.55, bh = k * 0.16;
    const ring = Math.min(120, Math.max(18, k * 0.75));
    if (!d.launched) {
      const u = Math.max(0, Math.min(1, (d.launchT - s.t) / R.drones.warn));
      const blink = Math.sin(run.clock * 22) > 0;
      g.strokeStyle = HUNT; g.lineWidth = 2.5; g.globalAlpha = blink ? 0.95 : 0.4;
      g.beginPath(); g.arc(p.x, p.y, ring * (1 + 1.5 * u), 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    } else if (!d.passed) {
      g.strokeStyle = d.committed ? LOCK : HUNT; g.lineWidth = d.committed ? 3.5 : 1.5; g.globalAlpha = d.committed ? 0.95 : 0.55;
      g.beginPath(); g.arc(p.x, p.y, ring, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    }
    // rotors
    g.fillStyle = 'rgba(200,220,255,0.18)';
    for (const [rx, ry] of [[-0.55, -0.12], [0.55, -0.12], [-0.42, 0.06], [0.42, 0.06]]) { g.beginPath(); g.ellipse(p.x + rx * k, p.y + ry * k, k * 0.24, k * 0.05, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#1D1830'; g.lineWidth = Math.max(1, k * 0.04); g.beginPath(); g.moveTo(p.x - k * 0.55, p.y - k * 0.12); g.lineTo(p.x + k * 0.55, p.y - k * 0.12); g.stroke();
    // body
    g.fillStyle = '#0E0B18'; g.beginPath(); g.ellipse(p.x, p.y, bw / 2, bh, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2A2440'; g.beginPath(); g.ellipse(p.x, p.y - bh * 0.35, bw * 0.35, bh * 0.45, 0, 0, Math.PI * 2); g.fill();
    // the eye
    const eye = d.committed ? layers.glow.lock : layers.glow.hunt, er = k * (d.committed ? 0.5 : 0.36);
    g.globalCompositeOperation = 'lighter'; g.drawImage(eye, p.x - er, p.y - er * 0.7, er * 2, er * 2); g.globalCompositeOperation = 'source-over';
    g.fillStyle = d.committed ? '#FFD1DC' : '#D8FBFF'; g.beginPath(); g.arc(p.x, p.y + bh * 0.2, Math.max(1.5, k * 0.06), 0, Math.PI * 2); g.fill();
  }

  /** The package: in his hand while he holds it; flying to the friend after the toss, with his trail colour. */
  function pkg(s) {
    const T = s.toss; if (!T || s.t < T.release) return;
    const f = s.round.friends.find((x) => x.id === T.target); if (!f) return;
    const u = Math.min(1, (s.t - T.release) / (T.arrive - T.release));
    const hand = handAt(s);
    const x = hand.x + (f.x - hand.x) * u, z = hand.z + (f.z + 0.5 - hand.z) * u, y = hand.y + (f.rise + 1.9 - hand.y) * u + Math.sin(u * Math.PI) * 2.2;
    let tr = trails.get(T); if (!tr) { tr = []; trails.set(T, tr); }
    tr.push([x, y, z]); if (tr.length > 20) tr.shift();
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = look.trail; g.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) { const a = project(...tr[i - 1]), b = project(...tr[i]); if (!a || !b) continue; g.globalAlpha = (i / tr.length) * 0.8; g.lineWidth = Math.max(2, b.s * 0.16); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const p = project(x, y, z); if (!p) return;
    const k = Math.max(5, p.s * 0.3);
    g.fillStyle = '#E8B04A'; g.fillRect(p.x - k / 2, p.y - k / 2, k, k); g.fillStyle = '#7A4E12'; g.fillRect(p.x - k / 2, p.y - k * 0.08, k, k * 0.16);
    // the snatch: a watcher's drone takes it near the end
    if (T.kind === 'snatch' && u > 0.7) { const w = project(x, y + 0.3, z); if (w) mini(w, WATCH, 1.4); }
  }
  function handAt(s) { const side = G.hand === 'left' ? -1 : 1; return { x: s.x + side * 0.3, y: R.courier.eye - 0.5, z: s.z + 0.6 }; }

  function rain(t) {
    g.strokeStyle = 'rgba(190,200,255,0.22)'; g.lineWidth = 1; g.beginPath();
    for (const [rx, ry, sp] of layers.rain) {
      const x = ((rx * W * 1.2 - cam.x * 18 * sp) % (W * 1.2) + W * 1.2) % (W * 1.2) - W * 0.1;
      const y = ((ry + t * sp * 1.3) % 1) * H;
      g.moveTo(x, y); g.lineTo(x - 3 * sp, y + 16 * sp);
    }
    g.stroke();
  }

  /** His hands at the bottom of the view: gloves, jacket sleeves with a stripe in his trail colour, the package in his throwing hand. */
  function hands(s) {
    const bob = cam.bob * 400, throwing = G.hand === 'left' ? -1 : 1, u = Math.min(W, H);
    const toss = s.toss && s.t >= s.toss.press ? Math.min(1, (s.t - s.toss.press) / 0.25) : 0;
    for (const side of [-1, 1]) {
      const own = side === throwing;
      const lift = own ? -toss * u * 0.1 : 0;
      const gx = W / 2 + side * W * 0.17, gy = H - u * 0.1 + bob * (own ? 1 : -1) + lift;
      // the sleeve: from the bottom corner up to the glove
      const sx = W / 2 + side * W * 0.3, sy = H + u * 0.06;
      g.strokeStyle = look.jacket; g.lineCap = 'round'; g.lineWidth = u * 0.13;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(gx + side * u * 0.02, gy + u * 0.05); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = u * 0.05; g.beginPath(); g.moveTo(sx - side * u * 0.02, sy - u * 0.02); g.lineTo(gx + side * u * 0.01, gy + u * 0.035); g.stroke();
      g.strokeStyle = look.trail; g.globalAlpha = 0.85; g.lineWidth = u * 0.012;
      g.beginPath(); g.moveTo(sx + side * u * 0.035, sy - u * 0.035); g.lineTo(gx + side * u * 0.045, gy + u * 0.03); g.stroke(); g.globalAlpha = 1;
      // the glove
      g.fillStyle = '#16121F'; g.beginPath(); g.ellipse(gx, gy, u * 0.055, u * 0.048, side * 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.ellipse(gx - side * u * 0.012, gy - u * 0.02, u * 0.03, u * 0.014, side * 0.4, 0, Math.PI * 2); g.fill();
      if (own && s.holding && run.phase === 'live') {
        const k = u * 0.085, px = gx - side * u * 0.01, py = gy - u * 0.06;
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.3; g.drawImage(layers.glow.gold, px - k * 1.1, py - k * 1.1, k * 2.2, k * 2.2); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#E8B04A'; g.fillRect(px - k / 2, py - k / 2, k, k);
        g.fillStyle = '#C48A2C'; g.fillRect(px - k / 2, py - k / 2, k, k * 0.22);
        g.fillStyle = '#7A4E12'; g.fillRect(px - k * 0.07, py - k / 2, k * 0.14, k);
      }
    }
  }

  /** Drones he can't see (behind him or past the edge of the view): chevrons at that screen edge, flickering once one locks on. */
  function edges(s, t) {
    for (const d of s.drones) {
      if (!d.launched || d.gone || d.passed) continue;
      const p = project(d.x, R.drones.height, d.z);
      if (p && p.x > 0 && p.x < W) continue;
      const side = Math.sign(d.x - s.x) || offSign(G), dist = Math.hypot(d.x - s.x, d.z - s.z);
      const near = Math.max(0, 1 - dist / R.drones.spawn), flick = d.committed ? (Math.sin(t * 40) > 0 ? 1 : 0.35) : 0.55;
      const a = (0.25 + 0.75 * near) * flick;
      const x = side > 0 ? W - 8 : 8, y = H * 0.48;
      g.globalAlpha = a; g.fillStyle = d.committed ? LOCK : HUNT;
      for (let i = 0; i < 3; i++) {
        const o = i * 22, h2 = 26;
        g.beginPath(); g.moveTo(x - side * o, y - h2); g.lineTo(x - side * (o + 16), y); g.lineTo(x - side * o, y + h2); g.lineTo(x - side * (o + 7), y); g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    }
  }

  return { start, end, isOn: () => on };
}

/** Sound: a synth beat that builds with the streak, and the game's sound effects. Made in code, no files. */
function sound() {
  let ac = null, master = null, timer = 0, beat = 0, layers = 1, muted = false, next = 0;
  try { muted = localStorage.getItem('roof-muted') === '1'; } catch { /* storage blocked */ }
  const btn = document.getElementById('rMute');
  const paint = () => { if (btn) { btn.textContent = muted ? '♪̸' : '♪'; btn.setAttribute('aria-pressed', String(!muted)); } };
  paint();
  if (btn) btn.addEventListener('click', () => { muted = !muted; try { localStorage.setItem('roof-muted', muted ? '1' : '0'); } catch { /* */ } if (master) master.gain.value = muted ? 0 : 0.5; paint(); });
  function ensure() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
    return true;
  }
  function tone(freq, t, dur, type = 'sine', vol = 0.2, slide = 0) {
    const o = ac.createOscillator(), v = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v); v.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(t, dur, vol, hp = 3000) {
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const d = noiseBuf.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x7fffffff) * 2 - 1; } }
    const n = ac.createBufferSource(), f = ac.createBiquadFilter(), v = ac.createGain();
    n.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp; v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(v); v.connect(master); n.start(t); n.stop(t + dur);
  }
  const BASS = [55, 55, 65.4, 49];
  function schedule() {
    const spb = 60 / 118 / 2;
    while (next < ac.currentTime + 0.2) {
      const step = beat % 8, bar = Math.floor(beat / 8) % 4;
      if (step % 2 === 0) tone(110, next, 0.18, 'sine', 0.35, 0.35);
      if (layers >= 2 && step % 2 === 1) noise(next, 0.04, 0.08, 7000);
      if (layers >= 3) tone(BASS[bar] * (step === 6 ? 2 : 1), next, spb * 0.9, 'sawtooth', 0.05);
      if (layers >= 4 && step % 4 === 2) noise(next, 0.12, 0.12, 1500);
      if (layers >= 5 && (step === 0 || step === 3 || step === 5)) tone([440, 523, 587, 392][bar] * (step === 3 ? 1.5 : 1), next, 0.22, 'triangle', 0.05);
      next += spb; beat++;
    }
  }
  const at = () => ac.currentTime + 0.01;
  return {
    start() { if (!ensure()) return; if (ac.state === 'suspended') ac.resume(); layers = 1; beat = 0; next = ac.currentTime + 0.05; clearInterval(timer); timer = setInterval(schedule, 50); },
    stop() { clearInterval(timer); timer = 0; },
    streak(n) { layers = 1 + Math.min(4, Math.floor(n / 2) + (n > 0 ? 1 : 0)); },
    toss() { if (ac) noise(at(), 0.18, 0.2, 2500); },
    catch(n) { if (!ac) return; const b = 660 * Math.pow(2, Math.min(n, 8) / 12); tone(b, at(), 0.25, 'triangle', 0.18); tone(b * 1.5, at() + 0.08, 0.3, 'triangle', 0.15); },
    drop() { if (ac) tone(220, at(), 0.3, 'triangle', 0.12, 0.6); },
    near() { if (ac) { noise(at(), 0.25, 0.25, 1200); tone(900, at(), 0.2, 'sine', 0.08, 2); } },
    lock() { if (ac) tone(1760, at(), 0.06, 'square', 0.04); },
    hit() { if (!ac) return; tone(120, at(), 0.5, 'sawtooth', 0.3, 0.3); noise(at(), 0.4, 0.3, 300); clearInterval(timer); },
    level() { if (!ac) return; [523, 659, 784].forEach((f, i) => tone(f, at() + i * 0.07, 0.2, 'triangle', 0.12)); },
  };
}

