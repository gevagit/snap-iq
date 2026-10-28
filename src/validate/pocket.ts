import type { PlayContent } from '../play/content';
import { gradePocket, idealPolicy, makePocketRep, runPolicy, type Mode, type Tier } from '../pocket';

export interface PocketSweep { reps: number; byType: Record<string, number>; failures: string[] }

/**
 * Pocket invariants (PRD §6.11, §8.4) on generated Bubble reps, for every tier and protection mode:
 * - every rep can be generated;
 * - in a pressure rep, standing still gets him sacked (the pressure is real);
 * - the right move, on time, is never sacked, grades as the best move and gets the ball out on time.
 */
export function sweepPocket(c: PlayContent, perCell = 16): PocketSweep {
  const out: PocketSweep = { reps: 0, byType: {}, failures: [] };
  for (const tier of ['youth', 'jv'] as Tier[]) for (const mode of ['good', 'bad', 'unpredictable'] as Mode[]) for (let i = 0; i < perCell; i++) {
    const seed = 1000 + i * 7;
    const rep = makePocketRep(c, tier, mode, seed, i, true);
    const where = `${tier} ${mode} seed ${seed} rep ${i}`;
    if (!rep) { out.failures.push(`${where}: no rep could be generated`); continue; }
    out.reps++;
    out.byType[rep.type.id] = (out.byType[rep.type.id] ?? 0) + 1;
    const at = `${where} (${rep.type.id}, ${rep.call.formation} ${rep.call.concept} vs ${rep.call.front} ${rep.call.coverage})`;
    if (!rep.type.holds) {
      const idle = runPolicy(c, rep, () => ({ mx: 0, my: 0 })).result!;
      if (idle.kind !== 'sack') out.failures.push(`${at}: standing still was not sacked (${idle.kind})`);
    }
    const ideal = runPolicy(c, rep, idealPolicy(c, rep));
    const g = gradePocket(c, ideal);
    if (g.sacked) out.failures.push(`${at}: the right move was sacked at ${ideal.result!.t.toFixed(2)} s`);
    else {
      if (g.move !== null && g.move !== 'best') out.failures.push(`${at}: the right move graded ${g.move} (${g.path.kind})`);
      if (g.timing === false) out.failures.push(`${at}: the right move graded late or early`);
      if (g.onTime === false) out.failures.push(`${at}: the right move got the ball out late`);
    }
  }
  return out;
}
