import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { active, onLineCount, place, resolve, routePath, routeStart, type Formations, type Playbook } from '../src/playbook';

const raw = loadRawContent();
const book = raw.playbook as Playbook;
const formations = raw.formations as Formations;
const routes = (raw.routes as { routes: { id: string; waypoints: [number, number][] }[] }).routes;
const HALF = (raw.geometry as { field: { width: number } }).field.width / 2;

describe('our playbook (content/playbook/plays.yaml)', () => {
  it('every play lines up 11 with 7 on the line, and every route is a known route word', () => {
    for (const { id } of book.plays.filter(active)) {
      const p = resolve(book, id);
      const placed = place(book, formations, p, HALF);
      expect(placed.filter((q) => !q.ghost).length, id).toBe(11);
      expect(onLineCount(placed), id).toBe(7);
      for (const [who, call] of Object.entries(p.routes)) {
        const from = routeStart(placed, who);
        expect(from, `${id}: ${who}`).toBeTruthy();
        expect(() => routePath(book, routes, p, from!, call)).not.toThrow();
      }
    }
  });
  it('is unreviewed until the owner checks it (football content)', () => {
    expect(book.plays.every((p) => p.reviewed === false)).toBe(true);
  });
});
