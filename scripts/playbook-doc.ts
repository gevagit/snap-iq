/**
 * The playbook review page for the owner (npm run playbook:doc): every play in content/playbook/plays.yaml drawn from
 * the alignment and route words, with what the game will ask about it and the open questions, and the defensive looks
 * per formation group from content/playbook/looks.yaml. Writes docs/playbook/review.html.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadRawContent } from '../src/content/load';
import { active, onLineCount, place, resolve, routePath, routeStart, type Formations, type Playbook, type TeamPlay } from '../src/playbook';

const raw = loadRawContent();
const book = raw.playbook as Playbook;
const looks = raw.looks as {
  groups: Record<string, { name: string; plays: number[] }>;
  fronts: { id: string; name: string; note: string }[];
  looks: { id: string; name: string; groups: string[]; front: string; coverage: string; safeties: Record<string, string>; corners: Record<string, string>; box: { down: number; edges: number; linebackers: number; blitzers: string[] }; last_scan: { change: string }[]; attack: string }[];
};
const formations = raw.formations as Formations;
const routes = (raw.routes as { routes: { id: string; waypoints: [number, number][] }[] }).routes;
const geo = raw.geometry as { field: { width: number; hash_from_sideline: number } };
const HALF = geo.field.width / 2;
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const words = (s: string) => s.replace(/-route$/, '').replace(/-/g, ' ');

// ----------------------------------------------------------------------------------------------- the diagram
const Y_TOP = 26, Y_BOT = -9, S = 10;
const X = (x: number) => ((x + HALF) * S).toFixed(1);
const Y = (y: number) => ((Y_TOP - y) * S).toFixed(1);
function diagram(p: TeamPlay): { svg: string; problems: string[] } {
  const problems: string[] = [];
  let placed: ReturnType<typeof place> = [];
  try { placed = place(book, formations, p, HALF); } catch (e) { problems.push((e as Error).message); }
  const w = HALF * 2 * S, h = (Y_TOP - Y_BOT) * S;
  const g: string[] = [];
  for (let y = -5; y <= 25; y += 5) if (y !== 0) g.push(`<line class="yl" x1="0" x2="${w}" y1="${Y(y)}" y2="${Y(y)}"/>`);
  const hx = HALF - geo.field.hash_from_sideline;
  for (let y = -8; y <= 25; y++) for (const sx of [-hx, hx]) g.push(`<line class="hash" x1="${X(sx - 0.35)}" x2="${X(sx + 0.35)}" y1="${Y(y)}" y2="${Y(y)}"/>`);
  g.push(`<line class="los" x1="0" x2="${w}" y1="${Y(0)}" y2="${Y(0)}"/>`);
  const BLOCKS = ['stalk-block', 'pass-block', 'down-block'];
  for (const [id, call] of Object.entries(p.routes)) {
    const from = routeStart(placed, id);
    if (!from) { problems.push(`a route for ${id}, who is not in the formation`); continue; }
    try {
      const pts = routePath(book, routes, p, from, call, HALF - (raw.routes as { sideline_room: number }).sideline_room);
      const block = BLOCKS.includes(call.route), carry = call.route === 'carry';
      g.push(`<polyline class="${block ? 'block' : carry ? 'carry' : 'route'}" marker-end="url(#${block ? 'bar' : carry ? 'arrow-c' : 'arrow'})" points="${pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')}"/>`);
    } catch (e) { problems.push((e as Error).message); }
  }
  if (p.motion) {
    const m = placed.find((q) => q.id === p.motion!.who), end = placed.find((q) => q.id === `${p.motion!.who}*`);
    if (m && end) {
      // around the QB for an orbit (behind him), straight across otherwise
      const qb = placed.find((q) => q.id === 'QB')!;
      const pts = p.motion.kind === 'orbit-motion' ? [[m.x, m.y], [qb.x, qb.y - 2], [end.x, end.y]] : [[m.x, m.y], [end.x, end.y]];
      g.push(`<polyline class="motion" marker-end="url(#arrow-m)" points="${pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')}"/>`);
    } else if (m) {
      const dir = m.x > 0.5 ? -1 : m.x < -0.5 ? 1 : 1;
      const len = p.motion.kind === 'short-motion' ? 3 : p.motion.kind === 'return-motion' ? 2.5 : 10;
      g.push(`<line class="motion" marker-end="url(#arrow-m)" x1="${X(m.x)}" y1="${Y(m.y)}" x2="${X(m.x + dir * len)}" y2="${Y(m.y)}"/>`);
    }
  }
  for (const q of placed) {
    if (q.ghost) continue;
    if (q.lineman) g.push(`<rect class="ol" x="${(Number(X(q.x)) - 7).toFixed(1)}" y="${(Number(Y(q.y)) - 7).toFixed(1)}" width="14" height="14" rx="2"/>`);
    else g.push(`<g class="${q.id === 'QB' ? 'qb' : p.ball === q.id ? 'carrier' : 'skill'}"><circle cx="${X(q.x)}" cy="${Y(q.y)}" r="11"/><text x="${X(q.x)}" y="${Y(q.y)}">${esc(q.id)}</text></g>`);
  }
  g.push(`<path class="ball" d="M ${X(0)} ${Y(0.05)} m -4 0 a 4 2.6 0 1 0 8 0 a 4 2.6 0 1 0 -8 0"/>`);
  const on = onLineCount(placed);
  if (placed.length && on !== 7) problems.push(`${on} players on the line of scrimmage (a legal formation has 7)`);
  const svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(p.name)}, top-down"><defs>
<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker>
<marker id="arrow-c" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ahc"/></marker>
<marker id="arrow-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ahm"/></marker>
<marker id="bar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M5,0 L5,10" class="bar"/></marker></defs>
<rect class="turf" width="${w}" height="${h}"/>${g.join('')}</svg>`;
  return { svg, problems };
}

// ----------------------------------------------------------------------------------------------- the play card
const list = (v: unknown): string => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => esc(typeof x === 'object' ? JSON.stringify(x) : x)).join(' → ');
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `<b>${esc(k.replace(/_/g, ' '))}:</b> ${typeof x === 'object' && x && !Array.isArray(x) ? Object.entries(x).map(([a, b]) => `${esc(a)} ${esc(b)}`).join(', ') : list(x)}`).join('<br>');
  return esc(String(v).replace(/-/g, ' '));
};
const KIND: Record<string, string> = { pass: 'Pass', 'play-action': 'Play action', screen: 'Screen', rpo: 'RPO', option: 'Option', run: 'Run' };
const groupOf = (n: number) => Object.entries(looks.groups).find(([, g]) => g.plays.includes(n))?.[0] ?? 'heavy';

/** An answer box: saved to the page's shared store as he types (read back by Claude). */
const box = (key: string, play: number, q: string) =>
  `<textarea id="${key}" data-key="${key}" data-play="${play}" data-q="${esc(q)}" rows="2" placeholder="Type your answer" disabled></textarea><span class="saved" data-for="${key}"></span>`;

function card(id: string): string {
  const p = resolve(book, id);
  const { svg, problems } = diagram(p);
  const rows: [string, string][] = [];
  const add = (k: string, v: unknown) => { const s = list(v); if (s) rows.push([k, s]); };
  add('Snap', p.qb === 'under' ? 'Under center' : p.qb === 'gun' ? 'Shotgun' : 'Pistol');
  if (p.motion) add('Motion', `${p.motion.who} ${(p.motion.kind ?? 'motion').replace(/-/g, ' ')}${p.motion.to ? ` to ${p.motion.to}` : ''}${p.motion.snap ? `; snap ${p.motion.snap}` : ''}`);
  add('Routes', Object.entries(p.routes).map(([k, r]) => `${k} ${words(r.route)}${r.break ? ` ${r.break}` : ''}${r.team_word ? ` ("${r.team_word}")` : ''}`).join(', '));
  if (p.ball) add('Ball', `${p.ball}${p.hole ? `, ${p.hole}` : ''}`);
  add('Reads', p.reads); add('Checkdown', p.checkdown); add('Footwork', p.footwork); add('Key', p.key);
  add('Protection', p.protection); add('Signal', p.signal); add('Audible', p.audible); add('Tags', p.tags?.map((t) => t.replace(/-/g, ' ')).join(', '));
  const qs = [...(p.questions ?? []), ...problems.map((x) => `Check: ${x}`)];
  return `<article class="play" id="play-${p.number}">
  <header><span class="num">${p.number}</span><div><h3>${esc(p.name)}</h3><span class="kind k-${esc(p.kind)}">${KIND[p.kind] ?? esc(p.kind)}</span>${p.same_as || p.flip_of ? `<span class="base">${p.flip_of ? 'flip of' : 'same set as'} ${esc(resolve(book, (p.flip_of ?? p.same_as)!).number)}</span>` : ''}</div></header>
  <div class="field">${svg}</div>
  <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
  ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}
  ${qs.length ? `<div class="ask"><b>For you to answer</b><ol>${qs.map((q, k) => `<li><label for="b-${p.number}-${k + 1}">${esc(q)}</label>${box(`b-${p.number}-${k + 1}`, p.number, q)}</li>`).join('')}</ol></div>` : ''}
  <div class="fix"><label for="b-${p.number}-fix">Anything wrong in this drawing or card?</label>${box(`b-${p.number}-fix`, p.number, 'Corrections to the drawing or card')}</div>
</article>`;
}

// ----------------------------------------------------------------------------------------------- the page
const groupsHtml = Object.entries(looks.groups).map(([gid, g]) => {
  const ls = looks.looks.filter((l) => l.groups.includes(gid));
  const plays = book.plays.filter((p) => active(p) && groupOf(p.number) === gid).sort((a, b) => a.number - b.number);
  return `<section class="group" id="${gid}">
  <h2>${esc(g.name)}</h2>
  <p class="meta">${plays.length} plays · ${ls.length} defensive looks</p>
  <div class="looks">${ls.map((l) => `<div class="look"><h4>${esc(l.name)}</h4>
    <p>${esc(l.attack)}</p>
    <dl><dt>Safeties</dt><dd>${esc(l.safeties.depth)}, ${esc(l.safeties.position)}; ${esc(l.safeties.stance)}</dd>
    <dt>Corners</dt><dd>${esc(l.corners.depth)}, ${esc(l.corners.leverage)} leverage; ${esc(l.corners.stance)}</dd>
    <dt>Box</dt><dd>${l.box.down} down, ${l.box.edges} edges, ${l.box.linebackers} linebackers${l.box.blitzers.length ? `; may blitz: ${esc(l.box.blitzers.join(', ').replace(/-/g, ' '))}` : ''}</dd>
    <dt>Last scan</dt><dd>${l.last_scan.map((c) => esc(c.change)).join('<br>')}</dd></dl></div>`).join('')}</div>
  <div class="plays">${plays.map((p) => card(p.id)).join('')}</div>
</section>`;
}).join('');

const live = book.plays.filter(active);
const total = live.length;
const asks = live.reduce((n, p) => n + (resolve(book, p.id).questions?.length ?? 0), 0);
const gone = book.plays.filter((p) => !active(p)).sort((a, b) => a.number - b.number);
const html = `<title>Chargers Playbook Review</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Source+Sans+3:wght@400;600&display=swap">
<style>
/* Layout: a coach's binder. One section per formation group: its defensive looks, then its play cards in a grid. */
:root {
  --bg: #F3F5F2; --panel: #FFFFFF; --ink: #17201B; --muted: #5A665F; --line: #D5DCD6;
  --turf: #2F6B3E; --paint: rgba(255,255,255,0.55); --route: #FFFFFF; --motion: #FFD54A;
  --accent: #0B5D9E; --ask-bg: #FFF4D6; --ask-ink: #5B4300; --carrier: #F2A33A;
  --display: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif; --body: "Source Sans 3", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #111613; --panel: #19201C; --ink: #E6ECE7; --muted: #9AA79F; --line: #2C3630;
  --turf: #24502F; --accent: #6DB3F2; --ask-bg: #3A3016; --ask-ink: #F5DE9A; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #111613; --panel: #19201C; --ink: #E6ECE7; --muted: #9AA79F; --line: #2C3630;
  --turf: #24502F; --accent: #6DB3F2; --ask-bg: #3A3016; --ask-ink: #F5DE9A; color-scheme: dark }
body { background: var(--bg); color: var(--ink); font: 16px/1.5 var(--body);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 24px 64px; }
main { max-width: 1240px; margin: 0 auto; display: grid; gap: 40px; }
h1, h2, h3, h4 { font-family: var(--display); text-wrap: balance; margin: 0; letter-spacing: 0.01em; }
h1 { font-size: clamp(34px, 6vw, 52px); line-height: 1; text-transform: uppercase; }
h2 { font-size: 30px; text-transform: uppercase; border-bottom: 3px solid var(--ink); padding-bottom: 4px; }
.intro { display: grid; gap: 12px; max-width: 68ch; }
.intro p { margin: 0; color: var(--muted); }
.stats { display: flex; flex-wrap: wrap; gap: 8px 24px; font-family: var(--display); font-size: 20px; font-variant-numeric: tabular-nums; }
.stats b { font-size: 30px; color: var(--accent); }
nav { display: flex; flex-wrap: wrap; gap: 8px; }
nav a { font-family: var(--display); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent); text-decoration: none; border: 1px solid var(--line); padding: 4px 10px; border-radius: 4px; }
nav a:focus-visible, nav a:hover { border-color: var(--accent); outline: none; }
.group { display: grid; gap: 16px; }
.meta { margin: 0; color: var(--muted); }
.looks { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px; }
.look { background: var(--panel); border: 1px solid var(--line); padding: 12px 14px; display: grid; gap: 6px; align-content: start; min-width: 0; }
.look h4 { font-size: 20px; }
.look p { margin: 0; font-size: 14px; color: var(--muted); }
.plays { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: 16px; }
.play { background: var(--panel); border: 1px solid var(--line); display: grid; gap: 10px; padding: 12px; align-content: start; min-width: 0; }
.play header { display: flex; gap: 10px; align-items: center; }
.num { font-family: var(--display); font-weight: 800; font-size: 30px; min-width: 2ch; color: var(--accent); font-variant-numeric: tabular-nums; }
.play h3 { font-size: 22px; line-height: 1.1; }
.kind, .base { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-right: 8px; }
.kind { font-weight: 600; color: var(--ink); }
.field { overflow-x: auto; }
.field svg { display: block; width: 100%; height: auto; min-width: 300px; }
.turf { fill: var(--turf); }
.yl { stroke: var(--paint); stroke-width: 1.5; }
.hash { stroke: var(--paint); stroke-width: 1.5; }
.los { stroke: #8EC5FF; stroke-width: 2; stroke-dasharray: 6 5; }
.route { fill: none; stroke: var(--route); stroke-width: 2.4; stroke-linejoin: round; }
.block { fill: none; stroke: var(--route); stroke-width: 2.4; }
.ah { fill: var(--route); } .ahc { fill: var(--carrier); }
.carry { fill: none; stroke: var(--carrier); stroke-width: 3; stroke-linejoin: round; } .ahm { fill: var(--motion); } .bar { stroke: var(--route); stroke-width: 2.5; fill: none; }
.motion { stroke: var(--motion); stroke-width: 2.2; stroke-dasharray: 5 4; }
.ol { fill: #1C2A22; stroke: #FFFFFF; stroke-width: 1.5; }
.skill circle, .qb circle, .carrier circle { fill: #1C2A22; stroke: #FFFFFF; stroke-width: 1.5; }
.qb circle { fill: #0B5D9E; } .carrier circle { fill: var(--carrier); }
.skill text, .qb text, .carrier text { fill: #FFFFFF; font: 700 10px var(--body); text-anchor: middle; dominant-baseline: central; }
.carrier text { fill: #1C1407; }
.ball { fill: #8B5A2B; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 10px; margin: 0; font-size: 14px; }
dt { font-family: var(--display); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.notes { margin: 0; font-size: 13px; color: var(--muted); border-left: 2px solid var(--line); padding-left: 8px; }
.ask { background: var(--ask-bg); color: var(--ask-ink); padding: 8px 10px; font-size: 14px; }
.ask ol { margin: 6px 0 0; padding-left: 20px; display: grid; gap: 10px; }
.ask label, .fix label { display: block; }
.fix { display: grid; gap: 4px; font-size: 14px; color: var(--muted); }
textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; font: 15px/1.4 var(--body); color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; resize: vertical; }
textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
textarea:disabled { opacity: 0.6; }
.saved { display: block; min-height: 1.2em; font-size: 12px; color: var(--muted); }
.round { margin: 0; padding: 10px 12px; border-left: 3px solid var(--accent); background: var(--panel); font-size: 15px; }
.status { margin: 0; padding: 8px 12px; border: 1px solid var(--line); background: var(--panel); font-size: 14px; }
</style>
<main>
  <div class="intro">
    <h1>Chargers 11U playbook in SNAP IQ</h1>
    <p>Each play from your PDF, redrawn from the game's own content: check that every player, route and read matches what you coach. The yellow boxes are what the PDF does not say. The defensive looks at the top of each group are the defenses the game will line up against those plays; each one also says what it may change to during his last scan.</p>
    <div class="stats"><span><b>${total}</b> plays</span><span><b>${looks.looks.length}</b> defensive looks</span><span><b>${asks}</b> questions for you</span></div>
    <p class="round">Round 2: your answers and corrections are in, and every play is redrawn from them. ${gone.length} plays are out of the game at your call: ${gone.map((p) => `${p.number} ${esc(p.name)}`).join(', ')}. The boxes are fresh: use them for anything still wrong and for the few new questions.</p>
    <p class="status" id="status">Loading the answer boxes...</p>
    <nav>${Object.entries(looks.groups).map(([gid, g]) => `<a href="#${gid}">${esc(g.name.split(' (')[0])}</a>`).join('')}</nav>
  </div>
  ${groupsHtml}
</main>
<script>
(function () {
  const status = document.getElementById('status');
  const boxes = Array.from(document.querySelectorAll('textarea[data-key]'));
  const say = (t) => { status.textContent = t; };
  const mark = (key, t) => { const el = document.querySelector('.saved[data-for="' + key + '"]'); if (el) el.textContent = t; };
  let timer = null;
  const fail = setTimeout(() => say('The answer boxes could not load. Answer in the chat with Claude instead (by play number).'), 10000);
  if (!window.claude || !window.claude.use) { clearTimeout(fail); say('Answer boxes work when this page is open in Claude. Otherwise, answer in the chat by play number.'); return; }
  window.claude.use('db').then((db) => {
    if (!db) { clearTimeout(fail); say('Sign in to Claude to use the answer boxes, or answer in the chat by play number.'); return; }
    const col = db.collection('answers');
    const pending = {};
    for (const b of boxes) {
      b.disabled = false;
      b.addEventListener('input', () => {
        pending[b.dataset.key] = b.value; mark(b.dataset.key, 'Saving...');
        clearTimeout(timer);
        timer = setTimeout(flush, 800);
      });
      b.addEventListener('blur', flush);
    }
    function flush() {
      clearTimeout(timer);
      for (const key of Object.keys(pending)) {
        const b = document.getElementById(key), text = pending[key];
        delete pending[key];
        col.doc(key).set({ play: Number(b.dataset.play), question: b.dataset.q, text, at: new Date().toISOString() })
          .then(() => mark(key, text ? 'Saved' : ''))
          .catch((e) => { pending[key] = text; mark(key, e && e.code === 'not_granted' ? 'You can read this page but not save answers.' : 'Not saved yet: it will retry when you type again.'); });
      }
    }
    col.onSnapshot((snap) => {
      clearTimeout(fail);
      let n = 0;
      for (const d of snap.docs) {
        const v = d.data() || {}, b = document.getElementById(d.id);
        if (v.text) n++;
        if (b && document.activeElement !== b && !(d.id in pending)) { b.value = v.text || ''; if (v.text) mark(d.id, 'Saved'); }
      }
      say(n ? n + ' answer' + (n === 1 ? '' : 's') + ' saved. Claude reads them from here: tell Claude in the chat when you are done.' : 'Type in the boxes under each play: answers save as you type. Tell Claude in the chat when you are done.');
    }, () => { clearTimeout(fail); say('The answer boxes stopped syncing. Reload the page; your saved answers stay.'); });
  });
})();
</script>
`;
mkdirSync(join(ROOT, 'docs/playbook'), { recursive: true });
writeFileSync(join(ROOT, 'docs/playbook/review.html'), html);
console.log(`docs/playbook/review.html: ${total} plays, ${looks.looks.length} looks, ${asks} questions`);
