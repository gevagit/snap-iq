import { onLineCount, place, routePath, routeStart, type Formations, type Playbook, type TeamPlay } from './index';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface Field { halfWidth: number; hashX: number; sidelineRoom: number }
/** Our play from above (the call card, the review page): players, routes, motion, the run and the blocks. Its CSS
 * classes (turf, yl, hash, los, route, carry, block, motion, ol, skill, qb, carrier, ah, ahc, ahm, bar, ball) are
 * styled by the page. `ids` prefixes the marker ids so several drawings can share a page. */
export function playSvg(book: Playbook, formations: Formations, routes: { id: string; waypoints: [number, number][] }[], p: TeamPlay, F: Field, ids = 'pb'): { svg: string; problems: string[] } {
  const HALF = F.halfWidth;
  const Y_TOP = 26, Y_BOT = -9, S = 10;
  const X = (x: number) => ((x + HALF) * S).toFixed(1);
  const Y = (y: number) => ((Y_TOP - y) * S).toFixed(1);
  const problems: string[] = [];
  let placed: ReturnType<typeof place> = [];
  try { placed = place(book, formations, p, HALF); } catch (e) { problems.push((e as Error).message); }
  const w = HALF * 2 * S, h = (Y_TOP - Y_BOT) * S;
  const g: string[] = [];
  for (let y = -5; y <= 25; y += 5) if (y !== 0) g.push(`<line class="yl" x1="0" x2="${w}" y1="${Y(y)}" y2="${Y(y)}"/>`);
  const hx = F.hashX;
  for (let y = -8; y <= 25; y++) for (const sx of [-hx, hx]) g.push(`<line class="hash" x1="${X(sx - 0.35)}" x2="${X(sx + 0.35)}" y1="${Y(y)}" y2="${Y(y)}"/>`);
  g.push(`<line class="los" x1="0" x2="${w}" y1="${Y(0)}" y2="${Y(0)}"/>`);
  const BLOCKS = ['stalk-block', 'pass-block', 'down-block'];
  for (const [id, call] of Object.entries(p.routes)) {
    const from = routeStart(placed, id);
    if (!from) { problems.push(`a route for ${id}, who is not in the formation`); continue; }
    try {
      const pts = routePath(book, routes, p, from, call, HALF - F.sidelineRoom);
      const block = BLOCKS.includes(call.route), carry = call.route === 'carry';
      g.push(`<polyline class="${block ? 'block' : carry ? 'carry' : 'route'}" marker-end="url(#${ids}-${block ? 'bar' : carry ? 'arrow-c' : 'arrow'})" points="${pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')}"/>`);
    } catch (e) { problems.push((e as Error).message); }
  }
  if (p.motion) {
    const m = placed.find((q) => q.id === p.motion!.who), end = placed.find((q) => q.id === `${p.motion!.who}*`);
    if (m && end) {
      // around the QB for an orbit (behind him), straight across otherwise
      const qb = placed.find((q) => q.id === 'QB')!;
      const pts: [number, number][] = p.motion.kind === 'orbit-motion' ? [[m.x, m.y], [qb.x, qb.y - 2], [end.x, end.y]] : [[m.x, m.y], [end.x, end.y]];
      g.push(`<polyline class="motion" marker-end="url(#${ids}-arrow-m)" points="${pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')}"/>`);
    } else if (m) {
      const dir = m.x > 0.5 ? -1 : m.x < -0.5 ? 1 : 1;
      const len = p.motion.kind === 'short-motion' ? 3 : p.motion.kind === 'return-motion' ? 2.5 : 10;
      g.push(`<line class="motion" marker-end="url(#${ids}-arrow-m)" x1="${X(m.x)}" y1="${Y(m.y)}" x2="${X(m.x + dir * len)}" y2="${Y(m.y)}"/>`);
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
<marker id="${ids}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker>
<marker id="${ids}-arrow-c" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ahc"/></marker>
<marker id="${ids}-arrow-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ahm"/></marker>
<marker id="${ids}-bar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M5,0 L5,10" class="bar"/></marker></defs>
<rect class="turf" width="${w}" height="${h}"/>${g.join('')}</svg>`;
  return { svg, problems };
}

