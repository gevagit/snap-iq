import type { PlayContent } from '../play/content';
import { buildPlay, type PlayCall } from '../play';

export interface SweepResult {
  tried: number;
  built: number;
  /** why calls that do not fit were skipped (reason -> count) */
  skipped: Record<string, number>;
  /** checks that failed on built plays */
  failures: { call: PlayCall; check: string; detail: string }[];
  /** built plays per coverage, to show nothing is silently skipped */
  builtBy: Record<string, number>;
}

/** Build every call and run the football invariants on each play (PRD §6.11). */
export function sweepPlays(c: PlayContent, calls: PlayCall[], dt: number): SweepResult {
  const out: SweepResult = { tried: 0, built: 0, skipped: {}, failures: [], builtBy: {} };
  for (const call of calls) {
    out.tried++;
    let r;
    try {
      r = buildPlay(c, call, dt);
    } catch (e) {
      out.failures.push({ call, check: 'engine', detail: (e as Error).message });
      continue;
    }
    if (!r.ok) {
      const reason = r.reason.replace(/^\d+ rushers against \d+ blockers/, 'more rushers than blockers');
      out.skipped[reason] = (out.skipped[reason] ?? 0) + 1;
      continue;
    }
    out.built++;
    out.builtBy[call.coverage] = (out.builtBy[call.coverage] ?? 0) + 1;
    for (const ch of r.value.checks) if (!ch.ok) out.failures.push({ call, check: ch.id, detail: ch.detail });
  }
  return out;
}

export function mergeSweeps(parts: SweepResult[]): SweepResult {
  const out: SweepResult = { tried: 0, built: 0, skipped: {}, failures: [], builtBy: {} };
  for (const p of parts) {
    out.tried += p.tried;
    out.built += p.built;
    out.failures.push(...p.failures);
    for (const [k, v] of Object.entries(p.skipped)) out.skipped[k] = (out.skipped[k] ?? 0) + v;
    for (const [k, v] of Object.entries(p.builtBy)) out.builtBy[k] = (out.builtBy[k] ?? 0) + v;
  }
  return out;
}

export const describeCall = (c: PlayCall) =>
  `${c.formation} (${c.strength}) ${c.motion} ${c.concept} ${c.protection} vs ${c.front} ${c.coverage}, ${c.spot}`;
