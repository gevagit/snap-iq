import type { PlayContent } from '../play/content';
import { idealPolicy, makeSnap, moveGrade, runSnap, separation } from '../instinct';

export interface InstinctSweep { snaps: number; byPattern: Record<string, number>; failures: string[] }

/**
 * Pocket Instinct invariants (docs/plans/instinct.md), for every level of the ramp:
 * - every snap can be generated, and the right move with a throw to the first window completes it (makeSnap);
 * - standing still gets him hit;
 * - when the pattern needs a move, standing still and throwing when an ally opens is not enough (he gets hit).
 */
export function sweepInstinct(c: PlayContent, perLevel = 8): InstinctSweep {
  const out: InstinctSweep = { snaps: 0, byPattern: {}, failures: [] };
  for (let level = 1; level <= c.instinct.ramp.levels + 2; level++) for (let i = 0; i < perLevel; i++) {
    const seed = 900 + level * 31 + i, where = `level ${level} seed ${seed} snap ${i}`;
    let snap;
    try { snap = makeSnap(c, level, seed, i); } catch (e) { out.failures.push(`${where}: ${(e as Error).message}`); continue; }
    out.snaps++;
    out.byPattern[snap.pattern.id] = (out.byPattern[snap.pattern.id] ?? 0) + 1;
    const at = `${where} (${snap.pattern.id})`;
    if (runSnap(c, snap, () => ({ mx: 0, my: 0 })).result!.kind !== 'hit') out.failures.push(`${at}: standing still was not hit`);
    const ideal = runSnap(c, snap, idealPolicy(c, snap));
    if (ideal.result!.kind !== 'complete') out.failures.push(`${at}: the right move did not complete (${ideal.result!.kind})`);
    const g = moveGrade(c, ideal);
    if (g !== null && g !== 'best') out.failures.push(`${at}: the right move graded ${g}`);
    if (['climb', 'pocket-slide', 'pocket-escape'].includes(snap.pattern.response)) {
      const stand = runSnap(c, snap, (s) => {
        const a = s.canThrow ? snap.allies.find((x) => separation(c, x, s.t + c.drills.ball.release_delay) >= c.drills.reads.open_separation + 0.3) : undefined;
        return a ? { mx: 0, my: 0, action: { kind: 'throw', target: a.id } } : { mx: 0, my: 0 };
      });
      if (stand.result!.kind !== 'hit') out.failures.push(`${at}: standing still and throwing on the first window was enough (${stand.result!.kind})`);
    }
  }
  return out;
}
