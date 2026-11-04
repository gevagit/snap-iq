// The pre-snap routine v2 (docs/plans/routine-v2.md): our playbook against looks built for it. One rep: down &
// distance, the call, then the whole routine at the line on one 40-second clock, a last scan (the look may change),
// the snap (the play runs about a second in his eyes), and the scorecard. Answer keys come from src/routine2; the
// owner's edits (the answer editor) are kept on this device and applied on top.
import { contentFrom, dealRep, stepsFor, withOverrides, repFor } from '../routine2';
import { routePath, routeStart, active, resolve } from '../playbook';
import { playSvg } from '../playbook/svg';

const KEYS = 'snapiq-keys-v1';
const REPS = 6;
const WORD = {
  short: 'Short (1-2)', medium: 'Medium (3-6)', long: 'Long (7+)', deep: 'Deep', middle: 'Middle', low: 'Low',
  hash: 'Over the hash', 'over-2': 'Over #2', box: 'In the box', press: 'Press', off: 'Off', cloud: 'Cloud',
  inside: 'Inside', 'head-up': 'Head-up', outside: 'Outside', left: 'Left', right: 'Right', yes: 'Yes', no: 'No',
  enough: 'Yes, we block them all', free: 'No: one comes free (ball out hot)', 'can-to-pass': 'Can to pass',
  'one-step-drop': '1-step', 'three-step-drop': '3-step', 'five-step-drop': '5-step', 'seven-step-drop': '7-step',
  boot: 'Boot', 'catch-and-throw': 'Catch & throw', backpedal: 'Backpedal', 'roll-out': 'Roll out', same: 'Same look', run: 'Run (hand off / keep)',
};
const w = (x) => WORD[x] ?? String(x);
const ORD = ['1st', '2nd', '3rd', '4th'];
const STEP_NAME = {
  'down-distance': 'Down & distance', call: 'The call', alignment: 'Everyone set', safeties: 'Safeties', corners: 'Corners', box: 'Box',
  protection: 'Protection', 'run-check': 'Run check', reads: 'Reads', 'look-off': 'Look off the safety', footwork: 'Footwork',
  key: 'Key defender', 'run-lane': 'Run lane', 'last-scan': 'Last scan',
};
const FOOT = ['one-step-drop', 'three-step-drop', 'five-step-drop', 'seven-step-drop', 'boot', 'catch-and-throw'];

export function initOps({ raw, $, show, progress, save, renderHome, createEyes, sceneFromPlayers }) {
  const C = contentFrom(raw);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const field = { halfWidth: C.halfWidth, hashX: C.hashX, sidelineRoom: raw.routes.sideline_room };
  const canvas = $('opsView');
  const eyes = createEyes(canvas);
  let session = null, rep = null, steps = [], si = 0, asks = [], ai = 0, scene = null, results = {}, answers = {};
  let clock = { left: 0, running: false, last: 0, raf: 0, started: 0 };
  let showing = 'pre'; // pre | change | snap

  const loadKeys = () => { try { return JSON.parse(localStorage.getItem(KEYS) || '{}'); } catch { return {}; } };
  const saveKeys = (k) => { try { localStorage.setItem(KEYS, JSON.stringify(k)); } catch { /* blocked: this session only */ } };

  // ------------------------------------------------------------------ the field in his eyes
  const BACKS = new Set(['beside-qb', 'i-back', 'fullback', 'pistol-back', 'up-back']);
  function poseO(q) {
    if (q.lineman) return q.id === 'C' ? 'C' : 'OL';
    const s = rep.play.players[q.id];
    if (s && s.align === 'attached') return 'TE';
    if (s && (BACKS.has(s.align) || (s.align === 'spot' && q.y < -2))) return 'RB';
    return 'WR';
  }
  function poseD(d) {
    if (d.role === 'DL') return 'DL';
    if (d.role === 'EDGE') return d.blitz ? 'BLZ' : 'LB';
    if (d.role === 'LB') return d.blitz ? 'BLZ' : 'LB';
    if (d.role === 'CB') return d.depth === 'press' ? 'CBpress' : 'CB';
    if (d.role === 'N') return d.blitz ? 'BLZ' : 'CB';
    return 'S';
  }
  const along = (pts, dist) => {
    let left = dist;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (left <= L) { const u = L ? left / L : 0; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
      left -= L;
    }
    return pts[pts.length - 1];
  };
  /** The scene: everyone where they stand (`def`: the look, or the look partly changed), the play from the snap. */
  function buildScene(def) {
    const O = rep.offense, play = rep.play;
    const qbAt = O.find((q) => q.id === 'QB');
    const qbDepth = -qbAt.y;
    const qb = (t) => [0, t <= 0 ? qbAt.y : qbAt.y - Math.min(2, t * 2.2) * (qbDepth < 2 ? 2.5 : 0.6)];
    const players = [];
    for (const q of O) {
      if (q.ghost || q.id === 'QB') continue;
      const call = play.routes[q.id];
      const start = [q.x, rep.fault && rep.fault.id === q.id ? rep.fault.y : q.y];
      const end = play.motion && play.motion.who === q.id ? routeStart(O, q.id) : null;
      let path = null;
      try { if (call) path = routePath(C.book, C.routes, play, routeStart(O, q.id), call, C.halfWidth - field.sidelineRoom); } catch { path = null; }
      const block = call && ['stalk-block', 'pass-block', 'down-block'].includes(call.route);
      const speed = q.lineman ? 0 : block ? 1.2 : 7;
      players.push({
        id: q.id, side: 'O', role: poseO(q), num: 0, label: q.lineman ? '' : q.id,
        pos: (t) => {
          if (t < -1.2) return start;
          const set = end ? [end.x, end.y] : [q.x, q.y];
          if (t <= 0) { if (!end) return t < -0.6 ? start : set; const u = (t + 1.2) / 1.2; return [start[0] + (set[0] - start[0]) * u, start[1] + (set[1] - start[1]) * u]; }
          if (q.lineman) return [q.x, q.y - Math.min(0.8, t)];
          if (!path) return set;
          return along(path, t * speed);
        },
      });
    }
    for (const d of def) {
      const blitz = d.blitz, back = d.role === 'CB' ? (d.depth === 'press' ? 0.3 : 1.6) : d.role === 'S' ? (d.depth === 'deep' ? 1.2 : 0.4) : d.role === 'LB' && !blitz ? 1.2 : 0;
      players.push({
        id: d.id, side: 'D', role: poseD(d), num: d.num, label: String(d.num),
        pos: (t) => {
          if (t <= 0) return [d.x, d.y];
          // the line meets our line at the line of scrimmage; blitzers come on toward him
          if ((d.role === 'DL' || d.role === 'EDGE') && !blitz) return [d.x, Math.max(0.1, d.y - t * 1.5)];
          if (blitz) { const dx = -d.x, dy = qbAt.y - d.y, L = Math.hypot(dx, dy) || 1, s = Math.min(L - 2.5, t * 3.5); return [d.x + (dx / L) * s, d.y + (dy / L) * s]; }
          return [d.x, d.y + t * back];
        },
      });
    }
    return sceneFromPlayers({ players, qb, T1: 1.4, field: { xl: -C.halfWidth, xr: C.halfWidth, hashes: [-C.hashX, C.hashX], los: 35 } });
  }
  const lerpDef = (a, b, u) => a.map((d, k) => ({ ...(u < 0.5 ? d : b[k]), x: d.x + (b[k].x - d.x) * u, y: d.y + (b[k].y - d.y) * u }));

  // ------------------------------------------------------------------ a workout
  function start() {
    if (!progress().playtest && !dealRep(C, 1, 0, { playtest: false })) { $('opsGate').hidden = false; return; }
    const fixed = Number(new URLSearchParams(location.search).get('seed'));
    session = { seed: fixed || ((Date.now() / 1000) | 0), i: 0, cards: [] };
    show('ops');
    document.body.classList.add('playing');
    requestAnimationFrame(() => { eyes.resize(); nextRep(); });
  }
  function nextRep() {
    if (session.i >= REPS) return wrap();
    const dealt = dealRep(C, session.seed, session.i, { playtest: progress().playtest });
    if (!dealt) return wrap();
    rep = withOverrides(dealt, loadKeys());
    steps = stepsFor(C, rep);
    si = 0; results = {}; answers = {}; showing = 'pre';
    scene = buildScene(rep.defense);
    eyes.setScene(scene); eyes.draw(-1.2);
    $('opsCard').hidden = true; $('opsCall').hidden = true; $('opsAsk').hidden = false;
    $('opsBug').textContent = `${ORD[rep.situation.down - 1]} & ${rep.situation.distance === 10 && rep.situation.down === 1 ? 10 : rep.situation.distance}`;
    $('opsRep').textContent = `Rep ${session.i + 1} of ${REPS}`;
    $('opsTest').hidden = rep.reviewed;
    clock = { left: C.rules.clock, running: true, last: performance.now(), raf: 0, started: performance.now() };
    tick();
    openStep();
  }
  function tick() {
    cancelAnimationFrame(clock.raf);
    const loop = (now) => {
      if (!clock.running) return;
      clock.left = Math.max(0, clock.left - (now - clock.last) / 1000); clock.last = now;
      $('opsClockBar').style.width = `${(clock.left / C.rules.clock) * 100}%`;
      $('opsClockNum').textContent = `${Math.ceil(clock.left)}`;
      $('opsClock').classList.toggle('out', clock.left <= 5);
      if (showing === 'pre') eyes.draw(-1.2);
      if (clock.left <= 0) { clock.running = false; timeUp(); return; }
      clock.raf = requestAnimationFrame(loop);
    };
    clock.raf = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ the steps
  const K = () => rep.keys;
  const sideOf = (x) => (x < -0.5 ? 'left' : x > 0.5 ? 'right' : 'middle');
  const skill = () => rep.offense.filter((q) => !q.lineman && !q.ghost && q.id !== 'QB');
  function asksFor(id) {
    const k = K(), D = rep.defense;
    switch (id) {
      case 'down-distance': return [
        { q: `${$('opsBug').textContent}: what kind of yardage?`, opts: ['short', 'medium', 'long'], key: k.yardage },
        { q: 'Is this a must-convert down?', opts: ['yes', 'no'], key: k.mustConvert ? 'yes' : 'no' },
      ];
      case 'call': return [{ call: true }];
      case 'alignment': return [{ q: 'Is everyone lined up right? Tap a player who isn\'t.', opts: ['ok', ...skill().map((q) => q.id)], labels: { ok: 'All set' }, key: k.alignment }];
      case 'safeties': return k.safeties.flatMap((s) => {
        const d = D.find((x) => x.id === s.id), who = `Safety #${d.num}${k.safeties.length > 1 ? ` (${sideOf(d.x)})` : ''}`;
        return [{ q: `${who}: how deep?`, opts: ['deep', 'middle', 'low'], key: s.depth }, { q: `${who}: where?`, opts: ['hash', 'middle', 'over-2', 'box'], labels: { middle: 'Middle of the field' }, key: s.position }];
      });
      case 'corners': return k.corners.flatMap((c) => {
        const d = D.find((x) => x.id === c.id), who = `Corner #${d.num} (${sideOf(d.x)})`;
        return [{ q: `${who}: press or off?`, opts: ['press', 'off'], key: c.depth }, { q: `${who}: his leverage on #1?`, opts: ['inside', 'head-up', 'outside'], key: c.leverage }];
      });
      case 'box': {
        const front = D.filter((d) => d.role !== 'CB' && d.role !== 'S');
        const notDl = D.filter((d) => d.role !== 'DL');
        return [
          { q: 'How many down linemen?', opts: ['3', '4', '5', '6'], key: String(k.down) },
          { q: 'Tap the two edges (the outside rusher on each side).', multi: 2, opts: front.map((d) => d.id), labels: Object.fromEntries(front.map((d) => [d.id, `#${d.num}`])), key: k.edges },
          { q: 'How many linebackers?', opts: ['2', '3', '4'], key: String(k.linebackers) },
          { q: 'Who might blitz? Tap each one, or Nobody.', multi: 'any', none: 'Nobody', opts: notDl.map((d) => d.id), labels: Object.fromEntries(notDl.map((d) => [d.id, `#${d.num}`])), key: k.blitzers },
        ];
      }
      case 'protection': return [{ q: 'Protection: can we block every rusher?', opts: ['enough', 'free'], key: k.protection }];
      case 'run-check': return [{ q: 'Is this look good for this run?', opts: ['yes', 'can-to-pass'], key: k.runCheck }];
      case 'reads': {
        if (k.side) return [{ q: 'Which side gives you the numbers?', opts: ['left', 'right'], key: k.side }];
        const ids = [...new Set([...Object.keys(rep.play.routes).filter((x) => !['stalk-block', 'pass-block', 'down-block'].includes(rep.play.routes[x].route)), ...(k.reads ?? []).filter((x) => x.length <= 3 || x === 'run')])];
        if (k.reads?.includes('run') && !ids.includes('run')) ids.push('run');
        return [{ q: k.readsGraded ? 'Your reads, in order: tap 1, 2, then your checkdown.' : 'Your reads, in order (on this play it\'s your call: not scored).', multi: 'order', opts: ids, key: k.readsGraded ? k.reads : null }];
      }
      case 'look-off': {
        const lo = k.lookOff, S = D.filter((d) => d.role === 'S');
        return [
          { q: `Your deep read is ${lo.target}. Which safety guards that throw?`, opts: [...S.map((d) => d.id), 'none'], labels: { ...Object.fromEntries(S.map((d) => [d.id, `#${d.num}`])), none: 'No deep safety' }, key: lo.safety ?? 'none' },
          { q: 'Where do you look first, to move him?', opts: ['left', 'right'], key: lo.first },
        ];
      }
      case 'footwork': return [{ q: 'Your footwork on this play?', opts: FOOT, key: k.footwork }];
      case 'key': return [{ q: 'Your key defender on this play?', opts: k.keyChoices.map((_, i) => `k${i}`), labels: Object.fromEntries(k.keyChoices.map((t, i) => [`k${i}`, t])), key: `k${k.keyChoices.indexOf(k.key)}`, long: true }];
      case 'run-lane': return [{ q: 'Bad snap, or nobody open: which way do you run?', opts: ['left', 'right'], key: k.runLane }];
      case 'last-scan': return [{ q: 'Last scan: is it the same look?', opts: ['same', 'changed'], labels: { changed: 'It changed' }, key: rep.change ? 'changed' : 'same' }];
      default: return [];
    }
  }
  function openStep() {
    if (si >= steps.length) return snap();
    const id = steps[si];
    asks = asksFor(id); ai = 0; answers[id] = [];
    if (!asks.length) { results[id] = null; si++; return openStep(); } // nothing to ask on this play
    $('opsStep').textContent = `${si + 1}/${steps.length} · ${STEP_NAME[id]}`;
    if (id === 'last-scan' && rep.change && showing === 'pre') return playChange(() => renderAsk());
    renderAsk();
  }
  function playChange(then) {
    showing = 'change';
    const t0 = performance.now(), D = 1300;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / D);
      scene = buildScene(lerpDef(rep.defense, rep.after, u)); eyes.setScene(scene); eyes.draw(-1.2);
      if (u < 1) requestAnimationFrame(step); else then();
    };
    requestAnimationFrame(step);
  }
  function renderAsk() {
    const a = asks[ai];
    if (!a) return;
    if (a.call) return showCall();
    const box = $('opsChoices');
    $('opsQ').textContent = a.q;
    let picked = [];
    const label = (o) => (a.labels && a.labels[o]) || w(o);
    const draw = () => {
      box.className = 'choices' + (a.long ? ' long' : '');
      box.innerHTML = a.opts.map((o) => `<button type="button" data-id="${esc(o)}" aria-pressed="${picked.includes(o)}">${a.multi === 'order' && picked.includes(o) ? `<em>${picked.indexOf(o) + 1}</em> ` : ''}${esc(label(o))}</button>`).join('')
        + (a.none ? `<button type="button" class="wide" data-id="__none">${esc(a.none)}</button>` : '')
        + (a.multi ? `<button type="button" class="wide" data-id="__done" ${picked.length || a.multi === 'any' ? '' : 'disabled'}>Done</button>` : '');
    };
    draw();
    box.onclick = (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled || asks[ai] !== a) return; // a stale tap after the step moved on
      const id = b.dataset.id;
      if (id === '__none') return answer([]);
      if (id === '__done') return answer(picked);
      if (!a.multi) return answer(id);
      picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
      if (typeof a.multi === 'number' && picked.length === a.multi) return answer(picked);
      draw();
    };
  }
  function grade(a, v) {
    if (a.key == null) return null; // not scored
    if (a.multi === 'order') { const n = Math.min(2, a.key.length); return v.slice(0, n).join() === a.key.slice(0, n).join(); }
    if (a.multi) return [...v].sort().join() === [...a.key].sort().join();
    return v === a.key;
  }
  function answer(v) {
    const a = asks[ai], id = steps[si];
    answers[id].push({ a, v, ok: grade(a, v) });
    // the last scan: if he says it changed, what changed?
    if (id === 'last-scan' && ai === 0 && v === 'changed' && asks.length === 1) {
      const opts = rep.change ? rep.change.options : [...new Set(C.looks.looks.flatMap((l) => l.last_scan.map((x) => x.text)))].slice(0, 3);
      asks.push({ q: 'What changed?', opts: opts.map((_, i) => `c${i}`), labels: Object.fromEntries(opts.map((t, i) => [`c${i}`, t])), key: rep.change ? `c${opts.indexOf(rep.change.text)}` : '__none', long: true });
    }
    ai++;
    if (ai < asks.length) return renderAsk();
    const graded = answers[id].map((x) => x.ok).filter((x) => x !== null);
    results[id] = graded.length ? graded.every(Boolean) : null;
    si++; openStep();
  }
  function timeUp() { for (let k = si; k < steps.length; k++) if (!(steps[k] in results)) results[steps[k]] = 'missed'; snap(); }

  // ------------------------------------------------------------------ the call (the huddle)
  function showCall() {
    const { svg } = playSvg(C.book, C.formations, C.routes, rep.play, field, 'ops');
    $('opsCallName').textContent = `${rep.play.number} | ${rep.play.name}`;
    $('opsCallSit').textContent = `${$('opsBug').textContent} · ${rep.isRun ? 'Run' : rep.play.kind === 'play-action' ? 'Play action' : rep.play.kind === 'screen' ? 'Screen' : rep.play.kind === 'rpo' ? 'RPO' : rep.play.kind === 'option' ? 'Option' : 'Pass'}`;
    $('opsCallField').innerHTML = svg;
    $('opsCallNotes').textContent = rep.play.motion ? `Motion: ${rep.play.motion.who}${rep.play.motion.snap ? `, snap ${rep.play.motion.snap}` : ''}` : '';
    $('opsCall').hidden = false; $('opsAsk').hidden = true;
  }
  $('opsBreak').addEventListener('click', () => {
    $('opsCall').hidden = true; $('opsAsk').hidden = false;
    answers.call = []; results.call = null; si++; openStep();
  });

  // ------------------------------------------------------------------ the snap and the scorecard
  function snap() {
    clock.running = false;
    const used = C.rules.clock - clock.left;
    showing = 'snap';
    scene = buildScene(rep.after ?? rep.defense); eyes.setScene(scene);
    $('opsAsk').hidden = true;
    const t0 = performance.now();
    const run = (now) => {
      const t = -1.2 + (now - t0) / 1000;
      eyes.draw(Math.min(t, 1.2));
      if (t < 1.2) requestAnimationFrame(run); else card(used);
    };
    requestAnimationFrame(run);
  }
  const fmt = (a, v) => {
    const one = (x) => (a.labels && a.labels[x]) || (x.length <= 3 && /^[A-Z]/.test(x) ? x : w(x));
    if (v == null) return '–';
    if (Array.isArray(v)) return v.length ? v.map(one).join(a.multi === 'order' ? ' → ' : ', ') : 'Nobody';
    return one(v);
  };
  function card(used) {
    const rows = steps.filter((id) => id !== 'call').map((id) => {
      const r = results[id], list = answers[id] ?? [];
      const mark = r === 'missed' ? '<i class="miss">time</i>' : r === null ? '<i class="na">·</i>' : r ? '<i class="ok">✓</i>' : '<i class="no">✗</i>';
      const detail = list.filter((x) => x.ok === false).map((x) => `${esc(x.a.q)} <b>You:</b> ${esc(fmt(x.a, x.v))} · <b>Right:</b> ${esc(fmt(x.a, x.a.key))}`).join('<br>');
      return `<li>${mark}<span><b>${STEP_NAME[id]}</b>${detail ? `<small>${detail}</small>` : ''}</span></li>`;
    });
    const scored = steps.filter((id) => results[id] === true || results[id] === false || results[id] === 'missed');
    const right = scored.filter((id) => results[id] === true).length;
    session.cards.push({ play: rep.play.number, look: rep.look.id, right, of: scored.length, used, results: { ...results } });
    const p = progress(); p.xp = (p.xp || 0) + right * 10 + (clock.left > 0 ? 10 : 0); p.reps = (p.reps || 0) + 1; save();
    $('opsCardTitle').textContent = `${right} of ${scored.length} right · ${Math.round(used)} s${clock.left <= 0 ? ' (time ran out)' : ''}`;
    $('opsCardSub').textContent = `${rep.play.number} ${rep.play.name} vs ${rep.look.name}${rep.change ? ` · changed: ${rep.change.text}` : ''}`;
    $('opsCardList').innerHTML = rows.join('');
    $('opsCard').hidden = false; $('opsCard').scrollTop = 0;
    $('opsNext').textContent = session.i + 1 >= REPS ? 'Finish' : 'Next rep';
  }
  $('opsNext').addEventListener('click', () => { session.i++; nextRep(); });
  function wrap() {
    clock.running = false;
    const all = session.cards, right = all.reduce((a, c) => a + c.right, 0), of = all.reduce((a, c) => a + c.of, 0);
    const miss = {};
    for (const c of all) for (const [id, r] of Object.entries(c.results)) if (r === false || r === 'missed') miss[id] = (miss[id] || 0) + 1;
    const worst = Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => STEP_NAME[id]);
    $('opsCardTitle').textContent = `Workout done: ${right} of ${of} steps right`;
    $('opsCardSub').textContent = `Average ${Math.round(all.reduce((a, c) => a + c.used, 0) / Math.max(1, all.length))} s at the line${worst.length ? ` · work on: ${worst.join(', ')}` : ''}`;
    $('opsCardList').innerHTML = all.map((c, i) => `<li><i class="${c.right === c.of ? 'ok' : 'na'}">${i + 1}</i><span><b>Play ${c.play}</b><small>${c.right} of ${c.of} · ${Math.round(c.used)} s</small></span></li>`).join('');
    $('opsNext').textContent = 'Back to the locker room';
    $('opsNext').onclick = () => { $('opsNext').onclick = null; end(); };
    $('opsCard').hidden = false; $('opsCard').scrollTop = 0;
  }
  function end() {
    clock.running = false; cancelAnimationFrame(clock.raf);
    document.body.classList.remove('playing');
    renderHome(); show('home');
  }
  $('opsQuit').addEventListener('click', end);
  $('opsGateOn').addEventListener('click', () => { progress().playtest = true; save(); $('opsGate').hidden = true; renderHome(); start(); });
  $('opsGateNo').addEventListener('click', () => { $('opsGate').hidden = true; });

  // head turns: drag the field or the buttons
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (scene) drag = { x: e.clientX, yaw: scene.yawOverride || 0 }; });
  window.addEventListener('pointermove', (e) => { if (!drag || !scene) return; scene.yawOverride = Math.max(-1.25, Math.min(1.25, drag.yaw + ((drag.x - e.clientX) / eyes.width) * 1.6)); if (showing !== 'snap') eyes.draw(-1.2); });
  window.addEventListener('pointerup', () => { drag = null; });
  const turn = (d) => { if (!scene) return; scene.yawOverride = d === null ? 0 : Math.max(-1.25, Math.min(1.25, (scene.yawOverride || 0) + d)); eyes.draw(-1.2); };
  $('opsL').addEventListener('click', () => turn(-0.6)); $('opsR').addEventListener('click', () => turn(0.6)); $('opsC').addEventListener('click', () => turn(null));
  window.addEventListener('resize', () => { if (document.getElementById('ops').classList.contains('on')) { eyes.resize(); if (showing !== 'snap') eyes.draw(-1.2); } });

  // ------------------------------------------------------------------ the answer editor (parent area)
  const ed = { play: null, look: null };
  function openEditor() {
    const plays = C.book.plays.filter(active).sort((a, b) => a.number - b.number);
    $('edPlay').innerHTML = plays.map((p) => `<option value="${p.id}">${p.number} | ${esc(p.name)}</option>`).join('');
    ed.play = ed.play || plays[0].id;
    $('edPlay').value = ed.play;
    edLooks(); show('opsEdit');
  }
  function edLooks() {
    const play = resolve(C.book, ed.play);
    const g = Object.entries(C.looks.groups).find(([, x]) => x.plays.includes(play.number))?.[0];
    const looks = C.looks.looks.filter((l) => l.groups.includes(g));
    $('edLook').innerHTML = looks.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    if (!looks.some((l) => l.id === ed.look)) ed.look = looks[0]?.id;
    $('edLook').value = ed.look;
    edRender();
  }
  function edRender() {
    const keys = loadKeys();
    const base = repFor(C, ed.play, ed.look, 3), r = withOverrides(base, keys), k = r.keys;
    const mine = { ...(keys[ed.play]?.['*'] ?? {}), ...(keys[ed.play]?.[ed.look] ?? {}) };
    const { svg } = playSvg(C.book, C.formations, C.routes, base.play, field, 'ed');
    const S = 10, X = (x) => ((x + C.halfWidth) * S).toFixed(1), Y = (y) => ((26 - y) * S).toFixed(1);
    const tag = { DL: 'DL', EDGE: 'E', LB: 'LB', CB: 'C', N: 'N', S: 'S' };
    $('edField').innerHTML = svg.replace('</svg>', base.defense.map((q) => `<g class="def${q.blitz ? ' blz' : ''}"><circle cx="${X(q.x)}" cy="${Y(q.y)}" r="10"/><text x="${X(q.x)}" y="${Y(q.y)}">${tag[q.role]}</text></g>`).join('') + '</svg>');
    const row = (label, val, edit) => `<div class="edrow"><b>${label}</b><span>${val}</span>${edit ?? ''}</div>`;
    const sel = (name, opts, cur) => `<select data-k="${name}"><option value="">(computed)</option>${opts.map((o) => `<option value="${o}" ${cur === o ? 'selected' : ''}>${esc(w(o))}</option>`).join('')}</select>`;
    $('edKeys').innerHTML = [
      row('Situation', `${ORD[base.situation.down - 1]} & ${base.situation.distance} (${w(k.yardage)}) — an example; reads and footwork follow the down & distance`),
      row('Safeties', k.safeties.map((s) => `${w(s.depth)}, ${w(s.position)}`).join(' · ') || 'none'),
      row('Corners', k.corners.map((c) => `${w(c.depth)}, ${w(c.leverage)}`).join(' · ')),
      row('Box', `${k.down} down, ${k.linebackers} linebackers; may blitz: ${k.blitzers.length ? k.blitzers.join(', ') : 'nobody'}`),
      row('Protection', w(k.protection), sel('protection', ['enough', 'free'], mine.protection)),
      r.isRun ? row('Run check', w(k.runCheck), sel('runCheck', ['yes', 'can-to-pass'], mine.runCheck)) : '',
      !r.isRun ? row('Reads', k.side ? `pick the side: ${w(k.side)}` : (k.reads ?? []).join(' → ') || 'his call', `<input data-k="reads" placeholder="e.g. X, Y, RB" value="${esc((mine.reads ?? []).join(', '))}">`) : '',
      !r.isRun ? row('Footwork', k.footwork ? w(k.footwork) : 'not set', sel('footwork', FOOT, mine.footwork)) : '',
      row('Key defender', k.key ?? 'not set', `<input data-k="key" placeholder="his key, in your words" value="${esc(mine.key ?? '')}">`),
      row('Run lane', w(k.runLane), sel('runLane', ['left', 'right'], mine.runLane)),
    ].join('');
  }
  $('edPlay').addEventListener('change', () => { ed.play = $('edPlay').value; edLooks(); });
  $('edLook').addEventListener('change', () => { ed.look = $('edLook').value; edRender(); });
  $('edSave').addEventListener('click', () => {
    const keys = loadKeys(), scope = $('edAll').checked ? '*' : ed.look;
    const o = {};
    for (const el of $('edKeys').querySelectorAll('[data-k]')) {
      const v = el.value.trim(); if (!v) continue;
      o[el.dataset.k] = el.dataset.k === 'reads' ? v.split(/[\s,]+/).filter(Boolean) : v;
    }
    keys[ed.play] = { ...(keys[ed.play] ?? {}), [scope]: o };
    if (!Object.keys(o).length) delete keys[ed.play][scope];
    saveKeys(keys); edRender();
    $('edMsg').textContent = Object.keys(o).length ? 'Saved on this device. It applies to his next rep.' : 'Cleared: the computed answers apply.';
  });
  $('edExport').addEventListener('click', () => {
    const text = JSON.stringify({ exported: new Date().toISOString(), keys: loadKeys() }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new window.Blob([text], { type: 'application/json' }));
    a.download = 'snap-iq-answer-keys.json'; a.click();
    $('edMsg').textContent = 'Exported. Send the file to Claude to make it permanent for every device.';
  });
  $('edBack').addEventListener('click', () => { renderHome(); show('home'); });
  return { start, openEditor };
}
