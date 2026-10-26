// SNAP IQ: one rep = his pre-snap routine at the line (PRD §8.2) → snap → real speed → freeze 1 s after the snap →
// post-snap coverage and decision (§8.3) → result → Breakdown. All football comes from /content through the engine.
import raw from 'virtual:content';
import { parsePlayContent } from '../play/content';
import { makeRep, grade, recordRep, finishWorkout, newProgress, rank, catchPoint, withChanges, routeMenu, emptyAnswers, posAt } from './drill';
import { explain, CORNER_LABEL } from './explain';
import { createEyes, sceneFor, setThrow, setRun, SHAPES } from './eyes.js';
import { drawBoard, drawCall } from './board.js';
import { callSheet } from './call';

const C = parsePlayContent(raw);
const R = C.drills.routine;
const TERMS = new Map(raw.glossary.terms.map((t) => [t.id, t]));
const term = (id) => (TERMS.get(id) ? TERMS.get(id).term : id);
const def = (id) => (TERMS.get(id) ? TERMS.get(id).definition : '');
const lower = (s) => (/^Cover \d/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const KEY = 'snapiq-progress-v2';
const ORDER = 'XHYZRF';

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
  $('tierNote').textContent = `${progress.tier === 'youth' ? 'Youth' : 'JV'}: ${R.tiers[progress.tier].clock} seconds at the line for your routine. Coverages: ${R.tiers[progress.tier].coverages.map((id) => C.coverages.coverages.find((c) => c.id === id).name).join(', ')}.`;
  $('startSub').textContent = `${R.reps} plays · routine, snap, read · about 5 minutes`;
  $('playtest').checked = progress.playtest;
  const anyReviewed = makeRep(C, progress.tier, 1, 0, false) !== null;
  const b = $('playtestBanner');
  b.hidden = anyReviewed && !progress.playtest;
  b.innerHTML = anyReviewed
    ? '<b>Playtest is on.</b><span>Content the owner hasn\'t signed off can appear. Turn it off in Parent settings.</span>'
    : progress.playtest
      ? '<b>Playtest: some of this isn\'t signed off yet.</b><span>The routine steps, drops, escape lanes and route changes are new (batch 3) and still in owner review.</span>'
      : '<b>Waiting for sign-off.</b><span>The routine game uses new football content (batch 3) the owner hasn\'t reviewed yet. To playtest it now, turn on playtest in Parent settings.</span><button class="plain" id="ptQuick" type="button">Playtest now</button>';
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
let rep = null; // as dealt (with any alignment fault)
let played = null; // with his route changes
let answers = null;
let scene = null;
let clock = { t: 0, running: false, until: 0, last: 0, onDone: null };
let routineTimer = null;

function startWorkout() {
  // ?seed=N replays the same workout (for testing and for reporting a play)
  const fixed = Number(new URLSearchParams(location.search).get('seed'));
  session = { seed: fixed || ((Date.now() / 1000) | 0), i: 0, results: [], xp: 0 };
  show('rep');
  requestAnimationFrame(() => { eyes.resize(); nextRep(); });
}
$('startBtn').addEventListener('click', startWorkout);
$('quitBtn').addEventListener('click', () => endWorkout());

function nextRep() {
  hide('result'); hide('ask'); $('cue').classList.remove('on');
  if (session.i >= R.reps) { endWorkout(); return; }
  rep = makeRep(C, progress.tier, session.seed, session.i, progress.playtest);
  if (!rep) { endWorkout(); return; }
  session.i++;
  played = rep;
  answers = emptyAnswers();
  scene = sceneFor(rep, { fault: rep.fault });
  scene.yawPre = 0; scene.yawOverride = 0;
  eyes.setScene(scene);
  $('hudRep').textContent = `Play ${session.i} of ${R.reps}`;
  $('hudXp').textContent = `${session.xp} XP`;
  $('hudTest').hidden = rep.reviewed;
  const callText = `${rep.play.offense.formation.name} · ${C.concepts.concepts.find((c) => c.id === rep.call.concept).name} · ${C.protections.protections.find((p) => p.id === rep.call.protection).name}`;
  $('hudCall').textContent = callText;
  clock.t = -scene.rep.play.sim.dt / 2;
  showCall();
}

// ---------------------------------------------------------------- the call: the huddle, top-down (PRD §7.5 Learn)
// Everyone's job comes from the call alone (src/game/call.ts). Once he breaks the huddle he has to remember it.
const LINE = ['LT', 'LG', 'C', 'RG', 'RT'];
let call = null;
function showCall() {
  const sheet = callSheet(C, rep);
  call = { sheet, focus: null, hit: null };
  $('callRep').textContent = `Play ${session.i} of ${R.reps} · ${term('play-call')}`;
  $('callName').textContent = `${sheet.formation} · ${sheet.concept.name} · ${sheet.protection.name}`;
  $('callConcept').textContent = `${sheet.concept.name}: ${def(sheet.concept.term)}`;
  const byId = (id) => sheet.rows.find((r) => r.id === id);
  const job = (r) => (r.job === 'block' ? 'Stays in to block' : term(r.term));
  const btn = (key, who, title, sub, read) =>
    `<button type="button" data-key="${key}" aria-pressed="false"><span class="who">${who}</span><span class="what"><b>${esc(title)}</b><span>${esc(sub)}</span></span>${read ? `<span class="read">${read}</span>` : '<span></span>'}</button>`;
  const qb = byId('QB');
  const skill = sheet.rows.filter((r) => r.id !== 'QB' && !LINE.includes(r.id)).sort((a, b) => (a.read ?? 99) - (b.read ?? 99) || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const order = sheet.rows.filter((r) => r.read).sort((a, b) => a.read - b.read).map((r) => `${r.read} ${r.id}`).join(', ');
  $('roster').innerHTML =
    '<h4>Receivers and backs</h4>' +
    skill.map((r) => btn(r.id, `${SHAPES[r.id] || ''} ${r.id}`, job(r), `${term(r.position)} · #${r.number}`, r.read)).join('') +
    '<h4>You</h4>' + btn('QB', 'QB', term(qb.term), `${term('quarterback')} · #${qb.number} · read ${order}`, null) +
    '<h4>Line</h4>' + btn('LINE', 'OL', `Blocks: ${sheet.protection.name}`, `${term('offensive-line')} · ${LINE.join(' ')}`, null);
  for (const b of $('roster').querySelectorAll('button')) b.addEventListener('click', () => focusCall(b.dataset.key));
  focusCall(null);
  show('call');
  requestAnimationFrame(drawCallBoard);
}
function drawCallBoard() { if (call) call.hit = drawCall($('callBoard'), rep, call.sheet, call.focus === 'LINE' ? LINE : call.focus); }
function focusCall(key) {
  const sheet = call.sheet;
  call.focus = key && call.focus !== key ? key : null;
  for (const b of $('roster').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.key === call.focus));
  const r = sheet.rows.find((x) => x.id === call.focus);
  const concept = C.concepts.concepts.find((c) => c.id === rep.call.concept);
  const P = (t, d) => `<p><b>${esc(t)}:</b> ${esc(d)}</p>`;
  let html;
  if (!call.focus) html = P(term('play-call'), def('play-call')) + '<p>Tap a player or a line on the list to see his job. You won\'t see this sheet again once you break the huddle.</p>';
  else if (call.focus === 'LINE') html = P(term('offensive-line'), def('offensive-line')) + P(sheet.protection.name, def(sheet.protection.term));
  else if (r.job === 'qb') html = P(term(r.position), def(r.position)) + P(term(r.term), def(r.term)) + P(`Your key: ${term(concept.read.key)}`, def(concept.read.key)) + P(term('progression'), def('progression'));
  else {
    html = P(`${r.id}, ${term(r.position)}`, def(r.position));
    if (r.job === 'route') html += P(term(r.term), def(r.term)) + (r.read ? `<p>Your read number ${r.read}.</p>` : '<p>Not in your read order.</p>');
    else if (r.job === 'check') html += P(term(r.term), def(r.term));
    else html += P(term(r.term), def(r.term));
  }
  $('callInfo').innerHTML = html;
  drawCallBoard();
}
$('callBoard').addEventListener('click', (e) => {
  if (!call || !call.hit) return;
  const b = $('callBoard').getBoundingClientRect();
  const id = call.hit(e.clientX - b.left, e.clientY - b.top);
  if (id) focusCall(LINE.includes(id) ? 'LINE' : id);
});
$('breakBtn').addEventListener('click', () => {
  call = null;
  show('rep');
  eyes.resize(); eyes.draw(clock.t);
  routine();
});
$('callQuit').addEventListener('click', () => endWorkout());

// ---------------------------------------------------------------- his head: drag on the field to look left and right
let drag = null;
canvas.addEventListener('pointerdown', (e) => { if (scene && scene.yawOverride != null) drag = { x: e.clientX, yaw: scene.yawOverride }; });
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  scene.yawOverride = Math.max(-1.25, Math.min(1.25, drag.yaw + ((drag.x - e.clientX) / eyes.width) * 1.6));
  eyes.draw(clock.t);
});
window.addEventListener('pointerup', () => { drag = null; });
$('lookL').addEventListener('click', () => turn(-0.6));
$('lookR').addEventListener('click', () => turn(0.6));
$('lookC').addEventListener('click', () => turn(null));
function turn(d) { if (!scene || scene.yawOverride == null) return; scene.yawOverride = d === null ? 0 : Math.max(-1.25, Math.min(1.25, scene.yawOverride + d)); eyes.draw(clock.t); }

// ---------------------------------------------------------------- the routine at the line
const CHUNKS = ['know', 'see', 'threats', 'plan'];
function routine() {
  const receivers = rep.post.options.map((o) => o.id).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const recBtn = (id) => ({ id, label: `${SHAPES[id] || ''} ${id}` });
  const defenders = rep.play.defense.players.filter((d) => d.group !== 'dl').map((d) => ({ id: d.role, label: `${d.label} #${d.number}` }));
  const k = rep.routine;
  const steps = [];
  for (const chunk of CHUNKS) for (const step of R.chunks[chunk]) {
    if (step === 'alignment') steps.push({ chunk, q: 'Is everyone lined up right?', opts: [{ id: 'ok', label: 'All good' }, ...receivers.map((id) => ({ id, label: `${SHAPES[id] || ''} ${id} is wrong` }))], set: (v) => { answers.alignment = v; fixAlignment(); } });
    if (step === 'shell') steps.push({ chunk, q: 'The shell', opts: R.tiers[progress.tier].answers.shell.map((id) => ({ id, label: term(id) })), set: (v) => { answers.shell = v; } });
    if (step === 'box') steps.push({ chunk, q: 'Defenders in the box', opts: R.box_choices.map((n) => ({ id: String(n), label: String(n) })), set: (v) => { answers.box = Number(v); } });
    if (step === 'corners') k.corners.forEach((cn, i) => steps.push({ chunk, q: `${cn.side === 'left' ? 'Left' : 'Right'} corner`, opts: Object.entries(CORNER_LABEL).map(([id, label]) => ({ id, label })), set: (v) => { answers.corners[i] = v; } }));
    if (step === 'tells') steps.push({ chunk, q: 'Any tells?', opts: [{ id: 'none', label: 'None' }, { id: 'blitz-tell', label: term('blitz-tell') }, { id: 'rotation-tell', label: term('rotation-tell') }], set: (v) => { answers.tells = v; } });
    if (step === 'threats') {
      steps.push({ chunk, q: 'More rushers than blockers?', opts: [{ id: 'no', label: 'No, we\'re covered' }, { id: 'yes', label: 'Yes' }], set: (v) => { answers.threats.more = v === 'yes'; } });
      steps.push({ chunk, q: 'Your hot route', when: () => answers.threats.more === true, opts: receivers.map(recBtn), set: (v) => { answers.threats.hot = v; } });
    }
    if (step === 'adjust') steps.push({ chunk, q: `Change routes? (up to ${C.adjustments.max_changes})`, adjust: true });
    if (step === 'key') {
      steps.push({ chunk, q: `Your key: the ${lower(term(C.concepts.concepts.find((c) => c.id === rep.call.concept).read.key))}`, opts: [...defenders, { id: 'none', label: 'No one has that job' }], set: (v) => { answers.key = v === 'none' ? null : v; answers.keyAnswered = true; } });
      steps.push({ chunk, q: 'Your first look', opts: receivers.map(recBtn), set: (v) => { answers.firstLook = v; } });
    }
    if (step === 'drop') steps.push({ chunk, q: 'Your drop', opts: ['catch-and-throw', 'one-step-drop', 'three-step-drop', 'five-step-drop'].map((id) => ({ id, label: term(id) })), set: (v) => { answers.drop = v; } });
    if (step === 'escape') steps.push({ chunk, q: 'Your escape lane', opts: [{ id: 'left', label: C.quarterback.throwing_hand === 'left' ? 'Left (throwing hand)' : 'Left' }, { id: 'right', label: C.quarterback.throwing_hand === 'right' ? 'Right (throwing hand)' : 'Right' }], set: (v) => { answers.escape = v; } });
  }
  let i = 0;
  const started = performance.now();
  const limit = rep.clock;
  const tickClock = () => {
    const left = Math.max(0, limit - (performance.now() - started) / 1000);
    $('clockBar').style.width = (left / limit) * 100 + '%';
    $('clockNum').textContent = Math.ceil(left);
    eyes.draw(clock.t); // the look at the line, redrawn every frame so turning his head stays live
    if (left <= 0) { finish(false); return; }
    routineTimer = requestAnimationFrame(tickClock);
  };
  routineTimer = requestAnimationFrame(tickClock);
  const finish = (inTime) => {
    cancelAnimationFrame(routineTimer);
    answers.routineTime = inTime ? (performance.now() - started) / 1000 : null;
    hide('ask');
    snap();
  };
  const render = () => {
    while (i < steps.length && steps[i].when && !steps[i].when()) i++;
    if (i >= steps.length) { finish(true); return; }
    const s = steps[i];
    document.querySelectorAll('#chunks span').forEach((el) => {
      const ci = CHUNKS.indexOf(el.dataset.chunk), cur = CHUNKS.indexOf(s.chunk);
      el.className = ci < cur ? 'done' : ci === cur ? 'now' : '';
    });
    $('askQ').textContent = s.q;
    if (s.adjust) { renderAdjust(() => { i++; render(); }); return; }
    $('choices').innerHTML = s.opts.map((o) => `<button type="button" data-id="${esc(o.id)}">${esc(o.label)}</button>`).join('');
    for (const b of $('choices').querySelectorAll('button')) b.addEventListener('click', () => { s.set(b.dataset.id); i++; render(); });
  };
  $('ask').classList.add('on');
  $('clock').hidden = false;
  render();
}

function fixAlignment() {
  // he made his alignment check: the receiver resets to his spot before the snap
  if (!rep.fault) return;
  scene = sceneFor(played, {});
  scene.yawPre = 0; scene.yawOverride = scene.yawOverride ?? 0;
  eyes.setScene(scene);
  eyes.draw(clock.t);
}

function renderAdjust(done) {
  const max = C.adjustments.max_changes;
  const routeOf = (id) => played.play.sim.routes.find((r) => r.id === id);
  const list = () => {
    const ids = rep.post.options.map((o) => o.id).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    const n = Object.keys(answers.changes).length;
    $('choices').innerHTML = ids.map((id) => {
      const r = routeOf(id);
      const changed = answers.changes[id];
      return `<button type="button" data-id="${id}" ${!changed && n >= max ? 'disabled' : ''}>${SHAPES[id] || ''} ${id}<small>${esc(lower(term(changed || (r ? r.route : ''))))}${changed ? ' (changed)' : ''}</small></button>`;
    }).join('') + `<button type="button" class="wide" data-id="__done">${n ? 'Done' : 'Keep all routes'}</button>`;
    for (const b of $('choices').querySelectorAll('button')) b.addEventListener('click', () => {
      if (b.dataset.id === '__done') { done(); return; }
      menu(b.dataset.id);
    });
  };
  const menu = (id) => {
    const current = rep.play.sim.routes.find((r) => r.id === id);
    const opts = routeMenu(C, rep.play, id).filter((r) => r !== (current && current.route));
    $('choices').innerHTML = opts.map((r) => `<button type="button" data-r="${r}">${esc(term(r))}</button>`).join('') +
      (answers.changes[id] ? `<button type="button" data-r="__undo">Back to the ${esc(lower(term(current.route)))}</button>` : '') +
      '<button type="button" class="wide" data-r="__back">Cancel</button>';
    for (const b of $('choices').querySelectorAll('button')) b.addEventListener('click', () => {
      if (b.dataset.r === '__undo') delete answers.changes[id];
      else if (b.dataset.r !== '__back') answers.changes[id] = b.dataset.r;
      played = withChanges(C, rep, { ...answers.changes });
      list();
    });
  };
  list();
}

// ---------------------------------------------------------------- the snap and the play
function snap() {
  $('clock').hidden = true;
  // his pre-snap read sets his eyes at the snap (PRD §7.5): his key defender, or his first look
  const readId = answers.key || answers.firstLook || null;
  const lastYaw = scene && scene.yawOverride != null ? scene.yawOverride : 0;
  scene = sceneFor(played, { readId });
  scene.yawPre = lastYaw; // he snaps the ball looking where he last looked, then his eyes go to his read
  eyes.setScene(scene);
  run(-0.7, played.decision, () => postSnap());
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
  const el = $('cue');
  const text = clock.t < -0.35 ? 'SET…' : clock.t < 0.3 ? 'HUT!' : '';
  el.textContent = text; el.classList.toggle('on', Boolean(text));
  if (clock.t >= clock.until) { clock.running = false; el.classList.remove('on'); if (clock.onDone) clock.onDone(); return; }
  requestAnimationFrame(tick);
}

function postSnap() {
  const receivers = played.post.options.map((o) => o.id).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const steps = [
    { q: 'The coverage after the snap', opts: R.tiers[progress.tier].answers.coverage.map((id) => ({ id, label: term(id) })), set: (v) => { answers.coverage = v; } },
    { q: 'The ball', opts: [...receivers.map((id) => ({ id, label: `${SHAPES[id] || ''} ${id}`, cls: 'throw' })), { id: 'run', label: 'Keep it and run' }, { id: 'throw-away', label: 'Throw it away' }], set: (v) => { answers.decision = v; } },
  ];
  let i = 0;
  document.querySelectorAll('#chunks span').forEach((el) => { el.className = 'done'; });
  const render = () => {
    if (i >= steps.length) { hide('ask'); outcome(); return; }
    const s = steps[i];
    $('askQ').textContent = s.q;
    $('choices').innerHTML = s.opts.map((o) => `<button type="button" class="${o.cls || ''}" data-id="${esc(o.id)}">${esc(o.label)}</button>`).join('');
    for (const b of $('choices').querySelectorAll('button')) b.addEventListener('click', () => { s.set(b.dataset.id); i++; render(); });
  };
  $('ask').classList.add('on');
  render();
}

function outcome() {
  const release = played.decision + C.drills.ball.release_delay;
  const d = answers.decision;
  if (d === 'run') setRun(scene, played.decision);
  else if (d === 'throw-away') {
    const qb = posAt(played.play, 'QB', release), side = answers.escape === 'right' ? 1 : -1;
    const fr = played.play.offense.frame, x = side > 0 ? fr.rightSideline + 1.5 : fr.leftSideline - 1.5;
    setThrow(scene, null, release, release + Math.hypot(x - qb.x, 4 - qb.y) / C.drills.ball.speed, { x, y: 4 });
  } else {
    const cp = catchPoint(C, played.play, d, release);
    setThrow(scene, d, release, cp.t, cp.at);
  }
  run(played.decision, scene.T1, () => result());
}

// ---------------------------------------------------------------- result
const STEP_NAME = { alignment: 'Alignment', shell: 'Shell', box: 'Box', corners: 'Corners', tells: 'Tells', threats: 'Threats', adjust: 'Route changes', key: 'Key and first look', drop: 'Drop', escape: 'Escape lane', coverage: 'Coverage' };
function result() {
  if (!answers.keyAnswered) answers.key = '__unanswered';
  const g = grade(C, rep, played, answers);
  rep.result = { g, answers, played };
  progress = recordRep(progress, rep.call, g); save();
  session.xp += g.xp; session.results.push({ rep, g, answers, played });
  $('hudXp').textContent = `${session.xp} XP`;
  const right = Object.values(g.steps).filter(Boolean).length;
  const total = Object.keys(g.steps).length;
  $('resTitle').textContent = g.decision === 'read' && right === total ? 'Perfect play' : g.decision === 'read' ? 'Right decision' : g.decision === 'open' ? 'Completed' : 'Not this time';
  const dec = played.post.decision;
  const decText = dec === 'run' ? 'Keep it and run' : dec === 'throw-away' ? 'Throw it away' : `${SHAPES[dec] || ''} ${dec} on the ${lower(term(played.post.options.find((o) => o.id === dec).route))}`;
  $('resList').innerHTML =
    `<li class="span"><span class="${g.decision === 'read' ? 'yes' : g.decision === 'open' ? 'part' : 'no'}">${g.decision === 'read' ? '✓' : g.decision === 'open' ? '~' : '✗'}</span><span>The ball: ${esc(decText)}</span></li>` +
    Object.entries(g.steps).map(([k, ok]) => `<li><span class="${ok ? 'yes' : 'no'}">${ok ? '✓' : '✗'}</span><span>${STEP_NAME[k]}</span></li>`).join('') +
    `<li class="span"><span class="yes">+</span><span>${g.xp} XP${answers.routineTime !== null ? ` · routine in ${answers.routineTime.toFixed(1)} s` : ' · the clock ran out'}</span></li>`;
  $('nextBtn').textContent = session.i >= R.reps ? 'Finish' : 'Next play';
  $('result').classList.add('on');
}
$('nextBtn').addEventListener('click', () => nextRep());
const hide = (id) => $(id).classList.remove('on');

// ---------------------------------------------------------------- Breakdown
let bd = { t: 0, playing: false, last: 0, back: 'rep' };
$('bdBtn').addEventListener('click', () => openBreakdown(session.results[session.results.length - 1], 'rep'));
$('bdClose').addEventListener('click', () => { bd.playing = false; show(bd.back); if (bd.back === 'rep') { eyes.resize(); eyes.draw(clock.t); } });
function openBreakdown(x, back) {
  show('breakdown');
  $('bdTitle').textContent = `${C.concepts.concepts.find((c) => c.id === x.rep.call.concept).name} vs ${x.played.play.defense.coverage.name}`;
  const parts = explain(C, TERMS, x.rep, x.played, x.answers, x.g);
  $('why').innerHTML = parts.map((p) => `<section><h3><span class="${p.ok ? 'yes' : 'no'}">${p.ok ? '✓' : '✗'}</span> ${esc(p.title)}</h3>${p.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</section>`).join('');
  bd = { t: -0.6, playing: true, last: performance.now(), x, back };
  requestAnimationFrame(bdTick);
}
const bdEnd = (r) => Math.min(Math.max(...r.post.options.map((o) => o.catchT)) + 0.2, r.play.sim.steps * r.play.sim.dt + r.play.sim.tStart);
function bdDraw() {
  const r = bd.x.played, end = bdEnd(r);
  drawBoard($('board'), r, bd.t, { showThrows: bd.t >= r.decision, mine: bd.x.answers.decision });
  $('bdScrub').value = String(Math.round(((bd.t + 0.6) / (end + 0.6)) * 1000));
  $('bdTime').textContent = bd.t < 0 ? 'Before the snap' : `${bd.t.toFixed(1)} s`;
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
$('bdPlay').addEventListener('click', () => { bd.t = -0.6; bd.playing = true; bd.last = performance.now(); requestAnimationFrame(bdTick); });
$('bdScrub').addEventListener('input', () => { const end = bdEnd(bd.x.played); bd.playing = false; bd.t = -0.6 + (Number($('bdScrub').value) / 1000) * (end + 0.6); bdDraw(); });

// ---------------------------------------------------------------- end of the workout
function endWorkout() {
  clock.running = false; cancelAnimationFrame(routineTimer); hide('ask'); hide('result');
  if (!session || !session.results.length) { show('home'); renderHome(); return; }
  const done = session.i >= R.reps && session.results.length === session.i;
  if (done) progress = finishWorkout(C, progress, today());
  save();
  const n = session.results.length;
  const reads = session.results.filter((x) => x.g.decision === 'read').length;
  const steps = session.results.reduce((a, x) => a + Object.values(x.g.steps).filter(Boolean).length, 0);
  const all = session.results.reduce((a, x) => a + Object.keys(x.g.steps).length, 0);
  $('wrapXp').textContent = `+${session.xp + (done ? C.drills.scoring.workout_bonus : 0)} XP`;
  $('wrapNote').textContent = done ? `Day streak: ${progress.streak} · Rank: ${rank(C, progress.xp).name}` : 'Workout ended early; finish every play to keep your streak.';
  $('wrapList').innerHTML = `<p class="note"><b>Right decisions</b> ${reads} of ${n} · <b>Routine checks</b> ${steps} of ${all}</p>` +
    session.results.map((x, i) => `<p class="note">${i + 1}. ${esc(C.concepts.concepts.find((c) => c.id === x.rep.call.concept).name)} vs ${esc(x.played.play.defense.coverage.name)}: ${x.g.decision === 'read' ? '✓' : x.g.decision === 'open' ? '~' : '✗'} <button class="plain" data-i="${i}" type="button" style="padding:3px 9px">Breakdown</button></p>`).join('');
  for (const b of $('wrapList').querySelectorAll('button')) b.addEventListener('click', () => openBreakdown(session.results[Number(b.dataset.i)], 'wrap'));
  show('wrap');
}
$('wrapDone').addEventListener('click', () => { session = null; show('home'); renderHome(); });

window.addEventListener('resize', () => { if ($('rep').classList.contains('on')) { eyes.resize(); eyes.draw(clock.t); } if ($('call').classList.contains('on')) drawCallBoard(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (scene) eyes.draw(clock.t); });
if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
  // a new deploy takes over at once: reload into it, unless he is in the middle of a workout
  const fresh = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (fresh && !session) location.reload(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => { /* offline install is optional */ });
}
renderHome();
