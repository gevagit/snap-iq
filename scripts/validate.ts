import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { loadRawContent } from '../src/content/load';
import { parsePlayContent } from '../src/play/content';
import { allCalls } from '../src/play';
import { validateContent } from '../src/validate';
import { type SweepResult, describeCall, mergeSweeps, sweepPlays } from '../src/validate/plays';
import { makeGame, sweepRooftop } from '../src/rooftop';

/** Validation step: coarser than the game's, fine enough for every invariant (speeds are checked per step). */
const DT = 1 / 15;

if (!isMainThread) {
  const { index, of } = workerData as { index: number; of: number };
  const c = parsePlayContent(loadRawContent());
  const calls = allCalls(c).filter((_, i) => i % of === index);
  parentPort!.postMessage(sweepPlays(c, calls, DT));
} else {
  const raw = loadRawContent();
  const report = validateContent(raw);
  const n = report.counts;
  const b = n.batch2;
  console.log(`Content: ${n.terms} glossary terms, ${n.rules} NFHS rules, ${n.landmarks} field landmarks.`);
  console.log(`Plays: ${b.formations} formations, ${b.motions} motions, ${b.routes} routes, ${b.concepts} concepts, ${b.protections} protections, ${b.fronts} fronts, ${b.coverages} coverages.`);
  console.log(`Review: ${n.needsReview} entries not yet reviewed; ${n.toConfirm} items flagged for the owner or coach to confirm.`);
  if (report.errors.length) {
    console.error(`\n${report.errors.length} problem(s):`);
    for (const e of report.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const of = Math.max(1, Math.min(8, availableParallelism()));
  const parts = await Promise.all(
    Array.from({ length: of }, (_, index) =>
      new Promise<SweepResult>((resolve, reject) => {
        const w = new Worker(new URL('./worker-boot.mjs', import.meta.url), { workerData: { index, of, entry: import.meta.url } });
        w.once('message', resolve);
        w.once('error', reject);
      }),
    ),
  );
  const sweep = mergeSweeps(parts);
  const skippedCount = Object.values(sweep.skipped).reduce((a, v) => a + v, 0);
  console.log(`Play sweep: ${sweep.tried} calls, ${sweep.built} legitimate plays built and checked, ${skippedCount} skipped (call does not fit).`);
  if (sweep.failures.length) {
    console.error(`\n${sweep.failures.length} play invariant failure(s):`);
    for (const f of sweep.failures.slice(0, 25)) console.error(`  - ${f.check}: ${f.detail}\n      ${describeCall(f.call)}`);
    process.exit(1);
  }
  console.log('All football invariants pass.');
  // Rooftop Run (not football): its settings and that every round at every level is fair
  const roof = sweepRooftop(makeGame(raw.rooftop, parsePlayContent(raw).quarterback.throwing_hand));
  console.log(`Rooftop Run sweep: ${roof.rounds} rounds (${Object.entries(roof.byPattern).map(([k, v]) => `${k} ${v}`).join(', ')}).`);
  if (roof.failures.length) {
    console.error(`\n${roof.failures.length} Rooftop Run problem(s):`);
    for (const f of roof.failures.slice(0, 25)) console.error(`  - ${f}`);
    process.exit(1);
  }
}
