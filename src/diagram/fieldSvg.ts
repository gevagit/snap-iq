import type { Geometry } from '../content/schemas';
import { type BallSpot, type Rect, fieldFrame } from '../field/geometry';

export interface FieldDiagramOptions {
  spot: BallSpot;
  /** the offense's own yard line at the line of scrimmage, e.g. 42 = own 42 */
  losOwnYardLine: number;
  /** yards to the line to gain */
  toGo: number;
  /** visible range, yards from the line of scrimmage */
  yFrom?: number;
  yTo?: number;
  pxPerYard?: number;
  overlays?: { rect: Rect; label: string }[];
  marks?: { x: number; y: number; label: string; kind: 'offense' | 'defense' | 'qb' | 'landmark' }[];
}

const COLORS = { turf: '#D5DAE0', oob: '#C4CAD2', line: '#FFFFFF', los: '#1F5FD1', ltg: '#1C2430', offense: '#1F5FD1', defense: '#C94A16', qb: '#B88A00', landmark: '#5B6573', ink: '#1C2430' };
const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** Top-down field diagram (Learn cards, Breakdown, Bible review doc). Deterministic SVG string. */
export function renderFieldSvg(g: Geometry, o: FieldDiagramOptions): string {
  const fr = fieldFrame(g, o.spot);
  const s = o.pxPerYard ?? 12;
  const yFrom = o.yFrom ?? -10;
  const yTo = o.yTo ?? 20;
  const margin = 2;
  const xMin = fr.leftSideline - margin;
  const xMax = fr.rightSideline + margin;
  const W = (xMax - xMin) * s;
  const H = (yTo - yFrom) * s;
  const X = (x: number) => (x - xMin) * s;
  const Y = (y: number) => (yTo - y) * s;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f1(W)} ${f1(H)}" role="img" aria-label="Top-down field, ball on the ${o.spot.replace('_', ' ')}">`);
  out.push(`<rect x="0" y="0" width="${f1(W)}" height="${f1(H)}" fill="${COLORS.oob}"/>`);
  out.push(`<rect x="${f1(X(fr.leftSideline))}" y="0" width="${f1((fr.rightSideline - fr.leftSideline) * s)}" height="${f1(H)}" fill="${COLORS.turf}"/>`);
  // yard lines every 5 yd, placed by absolute yard line
  for (let A = 0; A <= 100; A += g.field.yard_lines_every) {
    const y = A - o.losOwnYardLine;
    if (y < yFrom || y > yTo) continue;
    out.push(`<line x1="${f1(X(fr.leftSideline))}" x2="${f1(X(fr.rightSideline))}" y1="${f1(Y(y))}" y2="${f1(Y(y))}" stroke="${COLORS.line}" stroke-width="2"/>`);
    if (A % 10 === 0 && A > 0 && A < 100) {
      const lab = String(A <= 50 ? A : 100 - A);
      out.push(`<text x="${f1(X(fr.numbersLeft))}" y="${f1(Y(y))}" font-size="${f1(1.6 * s)}" font-family="Archivo, Arial, sans-serif" font-weight="700" fill="${COLORS.line}" text-anchor="middle" dominant-baseline="middle" transform="rotate(90 ${f1(X(fr.numbersLeft))} ${f1(Y(y))})">${lab}</text>`);
      out.push(`<text x="${f1(X(fr.numbersRight))}" y="${f1(Y(y))}" font-size="${f1(1.6 * s)}" font-family="Archivo, Arial, sans-serif" font-weight="700" fill="${COLORS.line}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${f1(X(fr.numbersRight))} ${f1(Y(y))})">${lab}</text>`);
    }
  }
  // hash marks at every yard
  const half = g.field.hash_mark_length / 2;
  const ticks: string[] = [];
  for (let y = Math.ceil(yFrom); y <= yTo; y++) {
    if ((o.losOwnYardLine + y) % 5 === 0) continue;
    for (const hx of [fr.leftHash, fr.rightHash]) ticks.push(`M${f1(X(hx - half))} ${f1(Y(y))}H${f1(X(hx + half))}`);
  }
  out.push(`<path d="${ticks.join(' ')}" stroke="${COLORS.line}" stroke-width="2"/>`);
  // sidelines
  for (const x of [fr.leftSideline, fr.rightSideline]) out.push(`<line x1="${f1(X(x))}" x2="${f1(X(x))}" y1="0" y2="${f1(H)}" stroke="${COLORS.line}" stroke-width="4"/>`);
  // line of scrimmage and line to gain
  out.push(`<line x1="${f1(X(fr.leftSideline))}" x2="${f1(X(fr.rightSideline))}" y1="${f1(Y(0))}" y2="${f1(Y(0))}" stroke="${COLORS.los}" stroke-width="3"/>`);
  out.push(`<line x1="${f1(X(fr.leftSideline))}" x2="${f1(X(fr.rightSideline))}" y1="${f1(Y(o.toGo))}" y2="${f1(Y(o.toGo))}" stroke="${COLORS.ltg}" stroke-width="2" stroke-dasharray="8 6" opacity="0.6"/>`);
  for (const ov of o.overlays ?? []) {
    out.push(`<rect x="${f1(X(ov.rect.xMin))}" y="${f1(Y(ov.rect.yMax))}" width="${f1((ov.rect.xMax - ov.rect.xMin) * s)}" height="${f1((ov.rect.yMax - ov.rect.yMin) * s)}" fill="none" stroke="${COLORS.landmark}" stroke-width="1.5" stroke-dasharray="5 4"/>`);
    out.push(`<text x="${f1(X(ov.rect.xMin) + 4)}" y="${f1(Y(ov.rect.yMax) - 4)}" font-size="11" font-family="Archivo, Arial, sans-serif" fill="${COLORS.ink}">${ov.label}</text>`);
  }
  for (const m of o.marks ?? []) {
    const c = COLORS[m.kind];
    out.push(`<circle cx="${f1(X(m.x))}" cy="${f1(Y(m.y))}" r="${f1(0.55 * s)}" fill="#FFFFFF" stroke="${c}" stroke-width="2"/>`);
    out.push(`<text x="${f1(X(m.x))}" y="${f1(Y(m.y) + 4)}" font-size="11" font-family="Archivo, Arial, sans-serif" font-weight="700" fill="${COLORS.ink}" text-anchor="middle">${m.label}</text>`);
  }
  out.push('</svg>');
  return out.join('\n');
}
