/**
 * Our playbook (content/playbook/plays.yaml): resolves a play (same_as / flip_of), places every player from the
 * alignment words and draws each route from the route words. No football numbers here: they all come from
 * content (content/offense/formations.yaml alignment, content/offense/routes.yaml, content/playbook/plays.yaml).
 * Coordinates as in content/field/geometry.yaml: x across from the ball (+ = his right), y downfield.
 */

export type Side = 'left' | 'right' | 'middle';
export interface Spot { side: Side; align: string; on_line?: boolean; depth?: number; behind?: string; slot?: number; x?: number; of?: string; out?: number; gap?: number }
export interface RouteCall { route: string; break?: number; ends?: 'left' | 'right'; note?: string; team_word?: string; gap?: string; side?: 'left' | 'right' }
export interface Motion { who: string; kind?: string; to?: string; snap?: string; note?: string; end?: Spot }
export interface TeamPlay {
  id: string; number: number; name: string; qb: 'under' | 'gun' | 'pistol'; kind: string;
  players: Record<string, Spot>; routes: Record<string, RouteCall>; motion?: Motion | null;
  ball?: string; reads?: unknown; checkdown?: unknown; footwork?: unknown; key?: string; protection?: string;
  tags?: string[]; notes?: string; questions?: string[]; same_as?: string; flip_of?: string; reviewed: boolean;
  [k: string]: unknown;
}
export interface Playbook {
  alignment: { gaps: Record<string, number>; wing: { outside_end_man: number; depth: number }; stack: { behind: number }; 'up-back': { x: number; depth: number }; 'beside-qb': { x: number }; quads: { spacing: number } };
  routes: { id: string; waypoints: [number, number][] }[];
  plays: TeamPlay[];
}
/** A play the owner took out of the game (kept in content with the reason). */
export const active = (p: object) => !(p as { cancelled?: unknown }).cancelled;
export interface Formations {
  alignment: {
    line: { split: number; depth: number };
    wide: { from_sideline: number; min_from_ball: number; max_from_ball: number };
    slot: { fraction: number; min_outside_end_man: number };
    inside_slot: { fraction: number };
    attached: { outside_tackle: number };
    qb: { gun: number; pistol: number; under: number };
    backs: Record<string, { x: number; depth: number }>;
  };
}
export interface Placed { id: string; x: number; y: number; onLine: boolean; lineman: boolean; ghost?: boolean }

const LINE = ['LT', 'LG', 'C', 'RG', 'RT'] as const;
const sign = (s: Side) => (s === 'left' ? -1 : s === 'right' ? 1 : 0);
const flipSide = (s: Side): Side => (s === 'left' ? 'right' : s === 'right' ? 'left' : s);

/** A play with its same_as / flip_of base merged in (the play's own fields win; players and routes merge by player). */
export function resolve(book: Playbook, id: string): TeamPlay {
  const p = book.plays.find((x) => x.id === id);
  if (!p) throw new Error(`no play ${id}`);
  const baseId = p.same_as ?? p.flip_of;
  if (!baseId) return { ...p, players: p.players ?? {}, routes: p.routes ?? {} };
  let base = resolve(book, baseId);
  if (p.flip_of) base = flip(base);
  const players: Record<string, Spot> = { ...base.players, ...(p.players ?? {}) };
  for (const [k, v] of Object.entries(players)) if (v === null) delete players[k]; // `TE: null`: not in this play
  // flip_of: the whole play, mirrored. same_as: the formation (and its snap); the rest only from a play of the same kind
  const own = (k: string) => (p as Record<string, unknown>)[k] !== undefined;
  const from: Partial<TeamPlay> = p.flip_of || base.kind === p.kind ? base : { qb: base.qb, motion: base.motion };
  const out: TeamPlay = { ...(from as TeamPlay), ...p, players, routes: { ...(from.routes ?? {}), ...(p.routes ?? {}) } };
  out.motion = own('motion') ? p.motion : (from.motion ?? null);
  return out;
}

/** The play mirrored left to right. */
export function flip(p: TeamPlay): TeamPlay {
  const players: Record<string, Spot> = {};
  for (const [k, s] of Object.entries(p.players)) players[k] = { ...s, side: flipSide(s.side) };
  const routes: Record<string, RouteCall> = {};
  for (const [k, r] of Object.entries(p.routes)) routes[k] = { ...r, ...(r.ends ? { ends: r.ends === 'left' ? 'right' : 'left' } : {}) };
  return { ...p, players, routes };
}

/** Every player's spot before the snap (yards; the ball at 0,0, the ball spot in the middle of the field). */
export function place(book: Playbook, f: Formations, p: TeamPlay, halfWidth: number): Placed[] {
  const A = f.alignment, B = book.alignment, line = A.line;
  const out: Placed[] = LINE.map((id, k) => ({ id, x: (k - 2) * line.split, y: -line.depth, onLine: true, lineman: true }));
  const qbDepth = A.qb[p.qb];
  out.push({ id: 'QB', x: 0, y: -qbDepth, onLine: false, lineman: false });
  const tackle = 2 * line.split;
  const attached = (s: number) => Object.values(p.players).some((q) => q.align === 'attached' && sign(q.side) === s);
  const endMan = (s: number) => tackle + (attached(s) ? A.attached.outside_tackle : 0);
  const wideX = Math.min(A.wide.max_from_ball, Math.max(A.wide.min_from_ball, halfWidth - A.wide.from_sideline));
  const offY = -line.depth - 1;
  const done = new Map<string, Placed>();
  const at = (id: string, spot?: Spot): Placed => {
    const have = done.get(id) ?? out.find((q) => q.id === id);
    if (have) return have;
    const s = spot ?? p.players[id];
    if (!s) throw new Error(`${p.id}: no player ${id}`);
    const sg = sign(s.side) || 1, on = !!s.on_line;
    const lineY = on ? -line.depth : offY;
    let x: number, y = lineY;
    switch (s.align) {
      case 'wide': x = sg * wideX; break;
      case 'slot': x = sg * Math.max(endMan(sg) + A.slot.min_outside_end_man, endMan(sg) + (wideX - endMan(sg)) * A.slot.fraction); break;
      case 'inside-slot': {
        const slot = Math.max(endMan(sg) + A.slot.min_outside_end_man, endMan(sg) + (wideX - endMan(sg)) * A.slot.fraction);
        x = sg * (endMan(sg) + (slot - endMan(sg)) * A.inside_slot.fraction); break;
      }
      case 'attached': x = sg * (tackle + A.attached.outside_tackle); y = -line.depth; break;
      case 'wing': x = sg * (endMan(sg) + B.wing.outside_end_man); y = -line.depth - B.wing.depth; break;
      case 'quads': x = sg * (endMan(sg) + B.quads.spacing * (s.slot ?? 1)); break;
      case 'stack': { const front = at(s.behind!); x = front.x; y = front.y - (s.gap ?? B.stack.behind); break; }
      case 'beside': { const next = at(s.of!); x = next.x + sg * (s.out ?? 1.5); y = -(s.depth ?? -offY); break; }
      case 'spot': x = sg * (s.x ?? 0); y = -(s.depth ?? -offY); break;
      case 'beside-qb': x = sg * B['beside-qb'].x; y = -(s.depth ?? qbDepth); break;
      case 'up-back': x = 0; y = -B['up-back'].depth; break;
      default: {
        const back = A.backs[s.align === 'i-back' ? 'i-back' : s.align === 'fullback' ? 'fullback' : s.align === 'pistol-back' ? 'pistol-back' : ''];
        if (!back) throw new Error(`${p.id}: unknown alignment ${s.align} for ${id}`);
        x = sign(s.side) * back.x; y = -(s.depth ?? back.depth);
      }
    }
    if (s.depth != null && !['beside-qb', 'i-back', 'fullback', 'pistol-back', 'beside', 'spot'].includes(s.align)) y = -s.depth;
    const q: Placed = { id, x, y, onLine: on || s.align === 'attached', lineman: false };
    done.set(id, q);
    return q;
  };
  for (const id of Object.keys(p.players)) out.push(at(id));
  // where a motion man is at the snap (`motion.end`): his route starts there
  if (p.motion?.end) out.push({ ...at(`${p.motion.who}*`, p.motion.end), onLine: false, ghost: true });
  return out;
}

/** A route as points on the field: its waypoints from his spot, toward his own sideline (to the middle for a back
 * in the middle: toward the side `ends` names), the break moved to the PDF's yards. */
export function routePath(book: Playbook, routes: { id: string; waypoints: [number, number][] }[], p: TeamPlay, from: Placed, call: RouteCall, maxX = Infinity): [number, number][] {
  if (call.route === 'carry') {
    // a run: to the gap (content/playbook/plays.yaml alignment gaps), then downhill
    const gx = (call.side === 'left' ? -1 : 1) * (book.alignment.gaps[call.gap ?? 'A'] ?? 0);
    return [[from.x, from.y], [gx, -0.4], [gx + Math.sign(gx) * 1.5, 4]];
  }
  const def = [...routes, ...book.routes].find((r) => r.id === call.route);
  if (!def) throw new Error(`${p.id}: unknown route ${call.route}`);
  const s = from.ghost ? undefined : p.players[from.id];
  let toward = s ? sign(s.side) : 0;
  if (call.ends) toward = call.ends === 'left' ? 1 : -1; // a crosser runs to the middle (negative x of his side) and ends on `ends`
  if (!toward) toward = from.x < 0 ? -1 : 1;
  const base = def.waypoints.find(([, y]) => y > 0)?.[1] ?? 0;
  const shift = call.break != null && base > 0 ? call.break - base : 0;
  const clampX = (x: number) => Math.max(-maxX, Math.min(maxX, x));
  return [[from.x, from.y], ...def.waypoints.map(([wx, wy]) => [clampX(from.x + toward * wx), from.y + 0.7 + (wy >= base && base > 0 ? wy + shift : wy)] as [number, number])];
}

/** Players on the line of scrimmage (a legal formation has 7, the five linemen among them). */
export const onLineCount = (placed: Placed[]) => placed.filter((q) => q.onLine && !q.ghost).length;
/** Where a player's route starts: where his motion ends, if he motions. */
export const routeStart = (placed: Placed[], who: string) => placed.find((q) => q.id === `${who}*`) ?? placed.find((q) => q.id === who);
