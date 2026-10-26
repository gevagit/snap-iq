// SNAP IQ game shell: locker room, Shell Game workout (PRD §8.3), result, Breakdown, session wrap.
// All football comes from /content through the play engine; this file is flow and screens only.
import raw from 'virtual:content';
import { parsePlayContent } from '../play/content';
import { makeRep, grade, recordRep, finishWorkout, newProgress, rank, catchPoint } from './drill';
import { explain } from './explain';
import { createEyes, sceneFor, setThrow, SHAPES } from './eyes.js';
import { drawBoard } from './board.js';

const C = parsePlayContent(raw);
const TERMS = new Map(raw.glossary.terms.map((t) => [t.id, t]));
const term = (id) => (TERMS.get(id) ? TERMS.get(id).term : id);
const lower = (s) => (/^Cover \d/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const $ = (id) => document.getElementById(id);
const KEY = 'snapiq-progress-v1';

// ---------------------------------------------------------------- progress (on this device only, PRD Phase 2)
let progress = load();
function load() { try { return { ...newProgress(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return newProgress(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* storage blocked: progress lasts this session */ } }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
  document.body.classList.toggle('playing', id === 'rep');
}

// ---------------------------------------------------------------- locker room
function renderHome() {
  const r = rank(C, progress.xp);
  $('rankName').textContent = r.name;
  $('rankNext').textContent = r.next ? `${r.next - progress.xp} XP to the next rank` : 'Top rank';
  $('rankBar').style.width = (r.next ? ((progress.xp - r.floor) / (r.next - r.floor)) * 100 : 100) + '%';
  $('sXp').textContent = progress.xp; $('sStreak').textContent = progress.streak; $('sReps').textContent = progress.reps;
  for (const b of document.querySelectorAll('#tierSeg button')) b.setAttribute('aria-pressed', String(b.dataset.tier === progress.tier));
  const t = C.drills.shell_game.tiers[progress.tier];
  $('tierNote').textContent = `${progress.tier === 'youth' ? 'Youth' : 'JV'}: you see the defense for ${t.look} s, the play freezes ${t.decision} s after the snap. Coverages: ${t.coverages.map((id) => C.coverages.coverages.find((c) => c.id === id).name).join(', ')}.`;
  $('startSub').textContent = `Shell Game · ${C.drills.shell_game.reps} reps · about 4 minutes`;
  $('playtest').checked = progress.playtest;
  const anyReviewed = makeRep(C, progress.tier, 1, 0, false) !== null;
  const b = $('playtestBanner');
  b.hidden = anyReviewed && !progress.playtest;
  b.innerHTML = anyReviewed
    ? '<b>Playtest is on.</b><span>Plays the owner hasn\'t signed off can appear. Turn it off in Parent settings.</span>'
    : progress.playtest
      ? '<b>Playtest: these plays aren\'t signed off yet.</b><span>Every rep uses Football Bible batch 2, which is still in owner review.</span>'
      : '<b>No plays are signed off yet.</b><span>The owner reviews Football Bible batch 2 first. To playtest it now, turn on playtest in Parent settings.</span><button class="plain" id="ptQuick" type="button">Playtest now</button>';
  const q = $('ptQuick'); if (q) q.addEventListener('click', () => { progress.playtest = true; save(); renderHome(); });
  $('startBtn').disabled = !anyReviewed && !progress.playtest;
  $('startBtn').style.opacity = $('startBtn').disabled ? 0.45 : 1;
}
$('tierSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; progress.tier = b.dataset.tier; save(); renderHome(); });
$('playtest').addEventListener('change', () => { progress.playtest = $('playtest').checked; save(); renderHome(); });
$('resetBtn').addEventListener('click', () => { const keep = { tier: progress.tier, playtest: progress.playtest }; progress = { ...newProgress(), ...keep }; save(); renderHome(); });

// ---------------------------------------------------------------- the workout
const canvas = $('view');
const eyes = createEyes(canvas);
let session = null;
let rep = null;
let scene = null;
let clock = { t: 0, running: false, until: 0, last: 0, onDone: null };

function startWorkout() {
  session = { seed: (Date.now() / 1000) | 0, i: 0, results: [], xp: 0 };
  show('rep');
  requestAnimationFrame(() => { eyes.resize(); nextRep(); });
}
$('startBtn').addEventListener('click', startWorkout);
$('quitBtn').addEventListener('click', () => endWorkout());

function nextRep() {
  hide('result'); hide('ask');
  if (session.i >= C.drills.shell_game.reps) { endWorkout(); return; }
  rep = makeRep(C, progress.tier, session.seed, session.i, progress.playtest);
  if (!rep) { endWorkout(); return; }
  session.i++;
  rep.answers = { shell: null, coverage: null, throwTo: null };
  scene = sceneFor(rep);
  eyes.setScene(scene);
  $('hudRep').textContent = `Rep ${session.i} of ${C.drills.shell_game.reps}`;
  $('hudXp').textContent = `${session.xp} XP`;
  $('hudTest').hidden = rep.reviewed;
  // the look, the snap, real speed to the decision point, then freeze
  run(rep.start, rep.decision, () => ask());
}

function run(from, to, onDone) {
  clock = { t: from, running: true, until: to, last: performance.now(), onDone };
  requestAnimationFrame(tick);
}
function tick(now) {
  if (!clock.running) return;
  const dt = Math.min(0.05, (now - clock.last) / 1000); clock.last = now;
  clock.t = Math.min(clock.until, clock.t + dt);
  eyes.draw(clock.t);
  cue(clock.t);
  if (clock.t >= clock.until) { clock.running = false; cue(99); if (clock.onDone) clock.onDone(); return; }
  requestAnimationFrame(tick);
}
function cue(t) {
  const el = $('cue');
  const text = t < -0.9 && t > rep.start + 0.2 ? 'Read the defense' : t >= -0.9 && t < -0.25 ? 'SET…' : t >= -0.25 && t < 0.35 ? 'HUT!' : '';
  el.textContent = text; el.classList.toggle('on', Boolean(text));
}
const hide = (id) => $(id).classList.remove('on');

// ---------------------------------------------------------------- his answers (left thumb)
function ask() {
  const tier = C.drills.shell_game.tiers[progress.tier];
  const steps = [
    { q: 'Before the snap, the shell was…', key: 'shell', opts: tier.answers.shell.map((id) => ({ id, label: term(id) })) },
    { q: 'After the snap, the coverage is…', key: 'coverage', opts: tier.answers.coverage.map((id) => ({ id, label: term(id) })) },
    { q: 'Throw it', key: 'throwTo', opts: rep.key.options.map((o) => ({ id: o.id, label: `${SHAPES[o.id] || ''} ${o.id}`, throw: true })).sort((a, b) => 'XHYZRF'.indexOf(a.id) - 'XHYZRF'.indexOf(b.id)) },
  ];
  let i = 0;
  const render = () => {
    const s = steps[i];
    $('askQ').textContent = s.q;
    document.querySelectorAll('#ask .steps i').forEach((el, j) => el.classList.toggle('done', j < i));
    $('choices').innerHTML = s.opts.map((o) => `<button type="button" class="${o.throw ? 'throw' : ''}" data-id="${o.id}">${o.label}</button>`).join('');
    for (const b of $('choices').querySelectorAll('button')) b.addEventListener('click', () => {
      rep.answers[s.key] = b.dataset.id;
      i++;
      if (i < steps.length) render(); else { hide('ask'); throwBall(); }
    });
  };
  $('ask').classList.add('on');
  render();
}

function throwBall() {
  const id = rep.answers.throwTo;
  const release = rep.decision + C.drills.ball.release_delay;
  const cp = catchPoint(C, rep.play, id, release);
  setThrow(scene, id, release, cp.t, cp.at);
  run(rep.decision, scene.T1, () => result());
}

function result() {
  const g = grade(C, rep.key, rep.answers);
  rep.grade = g;
  progress = recordRep(progress, rep.call, g); save();
  session.xp += g.xp; session.results.push({ rep, g });
  $('hudXp').textContent = `${session.xp} XP`;
  const best = rep.key.options.find((o) => o.id === rep.key.throwTo);
  const all = g.shell && g.coverage && g.throw === 'read';
  $('resTitle').textContent = all ? 'Perfect read' : g.throw === 'read' ? 'Good throw' : g.throw === 'open' ? 'Completed' : 'Not this time';
  const coverage = rep.play.defense.coverage;
  $('resList').innerHTML = [
    [g.shell, `Shell: ${term(rep.key.shell)}`, g.shell ? '' : `You said ${term(rep.answers.shell)}.`],
    [g.coverage, `Coverage: ${coverage.name}`, g.coverage ? '' : `You said ${term(rep.answers.coverage)}.`],
    [g.throw === 'read' ? true : g.throw === 'open' ? 'part' : false, `Throw: ${SHAPES[best.id] || ''} ${best.id} on the ${lower(term(best.route))}`, g.throw === 'read' ? '' : g.throw === 'open' ? `${rep.answers.throwTo} was open too, but ${best.id} came first in your read.` : `${rep.answers.throwTo} was covered.`],
  ].map(([ok, a, b]) => `<li><span class="${ok === true ? 'yes' : ok === 'part' ? 'part' : 'no'}">${ok === true ? '✓' : ok === 'part' ? '~' : '✗'}</span><span>${a}${b ? `<small>${b}</small>` : ''}</span></li>`).join('') +
    `<li><span class="yes">+</span><span>${g.xp} XP</span></li>`;
  $('nextBtn').textContent = session.i >= C.drills.shell_game.reps ? 'Finish' : 'Next rep';
  $('result').classList.add('on');
}
$('nextBtn').addEventListener('click', () => nextRep());

// ---------------------------------------------------------------- Breakdown
let bd = { t: 0, playing: false, last: 0, back: 'rep' };
$('bdBtn').addEventListener('click', () => openBreakdown(rep, 'rep'));
$('bdClose').addEventListener('click', () => {
  bd.playing = false;
  show(bd.back);
  if (bd.back === 'rep') { eyes.resize(); eyes.draw(clock.t); }
});
function openBreakdown(r, back) {
  show('breakdown');
  $('bdTitle').textContent = `${C.concepts.concepts.find((c) => c.id === r.call.concept).name} vs ${r.play.defense.coverage.name}`;
  const parts = explain(C, TERMS, r, r.answers, r.grade);
  $('why').innerHTML = parts.map((p) => `<section><h3>${p.title}</h3>${p.lines.map((l) => `<p>${l}</p>`).join('')}</section>`).join('');
  bd = { t: r.start, playing: true, last: performance.now(), rep: r, back };
  requestAnimationFrame(bdTick);
}
function bdEnd(r) { return Math.max(...r.key.options.map((o) => o.catchT)) + 0.2; }
function bdDraw() {
  const r = bd.rep;
  drawBoard($('board'), r, bd.t, { showThrows: bd.t >= r.decision, mine: r.answers.throwTo });
  const end = Math.min(bdEnd(r), r.play.sim.steps * r.play.sim.dt + r.play.sim.tStart);
  $('bdScrub').value = String(Math.round(((bd.t - r.start) / (end - r.start)) * 1000));
  $('bdTime').textContent = bd.t < 0 ? `${(-bd.t).toFixed(1)} s to the snap` : `${bd.t.toFixed(1)} s`;
  return end;
}
function bdTick(now) {
  if (!bd.playing || !$('breakdown').classList.contains('on')) return;
  const dt = Math.min(0.05, (now - bd.last) / 1000); bd.last = now;
  bd.t += dt * 0.6;
  const end = bdDraw();
  if (bd.t >= end) { bd.t = end; bd.playing = false; bdDraw(); return; }
  requestAnimationFrame(bdTick);
}
$('bdPlay').addEventListener('click', () => { bd.t = bd.rep.start; bd.playing = true; bd.last = performance.now(); requestAnimationFrame(bdTick); });
$('bdScrub').addEventListener('input', () => {
  const r = bd.rep, end = Math.min(bdEnd(r), r.play.sim.steps * r.play.sim.dt + r.play.sim.tStart);
  bd.playing = false; bd.t = r.start + (Number($('bdScrub').value) / 1000) * (end - r.start); bdDraw();
});

// ---------------------------------------------------------------- end of the workout
function endWorkout() {
  clock.running = false; hide('ask'); hide('result');
  if (!session || !session.results.length) { show('home'); renderHome(); return; }
  const done = session.i >= C.drills.shell_game.reps;
  if (done) progress = finishWorkout(C, progress, today());
  save();
  const n = session.results.length;
  const reads = session.results.filter((x) => x.g.throw === 'read').length;
  const shells = session.results.filter((x) => x.g.shell).length;
  const covs = session.results.filter((x) => x.g.coverage).length;
  $('wrapXp').textContent = `+${session.xp + (done ? C.drills.scoring.workout_bonus : 0)} XP`;
  $('wrapNote').textContent = done ? `Day streak: ${progress.streak} · Rank: ${rank(C, progress.xp).name}` : 'Workout ended early; finish all reps to keep your streak.';
  $('wrapList').innerHTML = `<p class="note"><b>Shells</b> ${shells} of ${n} · <b>Coverages</b> ${covs} of ${n} · <b>Reads</b> ${reads} of ${n}</p>` +
    session.results.map((x, i) => `<p class="note">${i + 1}. ${C.concepts.concepts.find((c) => c.id === x.rep.call.concept).name} vs ${x.rep.play.defense.coverage.name}: ${x.g.throw === 'read' ? '✓' : x.g.throw === 'open' ? '~' : '✗'} <button class="plain" data-i="${i}" type="button" style="padding:3px 9px">Breakdown</button></p>`).join('');
  for (const b of $('wrapList').querySelectorAll('button')) b.addEventListener('click', () => openBreakdown(session.results[Number(b.dataset.i)].rep, 'wrap'));
  show('wrap');
}
$('wrapDone').addEventListener('click', () => { session = null; show('home'); renderHome(); });

window.addEventListener('resize', () => { if ($('rep').classList.contains('on')) { eyes.resize(); eyes.draw(clock.t); } });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (rep) eyes.draw(clock.t); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { /* offline install is optional */ });
renderHome();
