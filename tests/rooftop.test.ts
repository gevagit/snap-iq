import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { parsePlayContent } from '../src/play/content';
import {
  Run, RoundSim, STEP, checkRules, idealPolicy, isLit, makeGame, makeRound, offSign, report, runRound, separation, standPolicy, sweepRooftop, tossKeys, unlocked,
  type Action, type Input, type Round,
} from '../src/rooftop';

const raw = loadRawContent();
const g = makeGame(raw.rooftop, parsePlayContent(raw).quarterback.throwing_hand);
const still = () => ({ mx: 0, mz: 0 });

/** Play a run with a controller until it is over (or a time limit). */
function play(run: Run, policy: (r: Run) => Input & { action?: Action }, limit = 120) {
  while (run.phase !== 'over' && run.clock < limit) {
    const u: Input & { action?: Action } = run.phase === 'live' ? policy(run) : still();
    if (u.action) run.act(u.action);
    run.step(u);
  }
  return run;
}
/** the good player: the right play, a fresh one each round */
function ideal() {
  let sim: RoundSim | null = null, p: ReturnType<typeof idealPolicy> | null = null;
  return (r: Run) => { if (r.sim !== sim) { sim = r.sim; p = idealPolicy(g); } return p!(r.sim); };
}
function roundOf(pattern: string, level = 8): Round {
  for (let i = 0; i < 300; i++) { const r = makeRound(g, level, 77 + i); if (r.pattern.id === pattern) return r; }
  throw new Error(`no ${pattern} round`);
}

describe('Rooftop Run', () => {
  it('has settings that make sense', () => {
    expect(checkRules(g.r)).toEqual([]);
  });

  it('every round at every level is fair: the right play completes it, standing still does not', () => {
    const s = sweepRooftop(g, 12);
    expect(s.failures).toEqual([]);
    expect(s.rounds).toBe(12 * g.r.ramp.levels);
    for (const p of g.r.patterns) expect(s.byPattern[p.id] ?? 0, p.id).toBeGreaterThan(0);
  });

  it('is deterministic: the same seed and inputs give the same run (golden replay)', () => {
    const script = () => { const i = ideal(); return (r: Run) => (r.clock > 1.2 && r.clock < 1.6 ? { mx: 0.6, mz: 0.3 } : i(r)); };
    const a = play(new Run(g, 4242, 1), script(), 40), b = play(new Run(g, 4242, 1), script(), 40);
    expect(b.score).toBe(a.score);
    expect(b.log.map((l) => [l.round.pattern.id, l.result.kind, l.result.t])).toEqual(a.log.map((l) => [l.round.pattern.id, l.result.kind, l.result.t]));
  });

  it('the right play keeps a run going round after round, level after level, and the streak builds', () => {
    const run = play(new Run(g, 7, 1), ideal(), 90);
    expect(run.log.length).toBeGreaterThan(8);
    expect(run.log.every((l) => l.result.kind === 'catch')).toBe(true);
    expect(run.level).toBeGreaterThan(1);
    expect(run.multiplier).toBeCloseTo(Math.min(g.r.scoring.streak_cap, 1 + run.streak * g.r.scoring.streak_step), 5);
    expect(run.timeline.length).toBeGreaterThan(10);
  });

  it('standing still gets him hit, and the run ends', () => {
    const run = play(new Run(g, 9, 1), (r) => standPolicy(g)(r.sim));
    expect(run.phase).toBe('over');
    expect(run.log.at(-1)!.result.kind).toBe('hit');
  });

  it('a drone that commits flies straight: cutting after the commit beats it, cutting before does not', () => {
    const round = roundOf('dive', 3), r = g.r;
    // stand, then cut at the commit: a miss
    const late = runRound(g, round, (s) => (s.drones[0]!.committed ? { mx: 1.5, mz: 0 } : still()), 6);
    expect(late.drones[0]!.passed).toBe(true);
    // cut early and hold the same line: it steers onto him
    const early = runRound(g, round, (s) => (s.t > round.launches[0]!.t + 0.2 ? { mx: 0.6, mz: 0 } : still()), 6);
    expect(early.result?.kind).toBe('hit');
    expect(r.drones.commit).toBeGreaterThan(r.drones.hit);
  });

  it('a drone that just misses him is a near miss and scores', () => {
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
      const run = play(new Run(g, 300 + i, 2), ideal(), 30);
      if (run.nearMisses > 0) { found = true; expect(run.score).toBeGreaterThan(run.deliveries * g.r.scoring.delivery); }
    }
    expect(found).toBe(true);
  });

  it('a toss into a watcher still on his friend is snatched and ends the run', () => {
    const run = play(new Run(g, 11, 1), (r) => {
      const s = r.sim, f = s.round.friends.find((ff) => separation(g, ff, s.t + g.r.toss.release) < g.r.friends.snatch);
      return s.holding && f && s.t > 0.2 ? { mx: 0, mz: 0, action: { kind: 'toss', target: f.id } } : still();
    });
    expect(run.log.at(-1)!.result.kind).toBe('snatch');
    expect(run.phase).toBe('over');
  });

  it('a toss to a dark lantern is dropped: the run goes on but the streak starts over', () => {
    let dropped = false;
    const good = ideal();
    const run = play(new Run(g, 13, 1), (r) => {
      const s = r.sim;
      if (r.deliveries >= 2 && !dropped && s.holding) {
        const f = s.round.friends.find((ff) => { const sep = separation(g, ff, s.t + g.r.toss.release); return sep >= g.r.friends.snatch && !isLit(g, ff, s.t + g.r.toss.release); });
        if (f && s.drones.every((d) => !d.launched || d.passed)) { dropped = true; return { ...good(r), action: { kind: 'toss', target: f.id } }; }
      }
      return good(r);
    }, 60);
    const k = run.log.findIndex((l) => l.result.kind === 'drop');
    expect(k).toBe(2);
    expect(run.log.length).toBeGreaterThan(k + 1);
    expect(run.multiplier).toBeCloseTo(1 + (run.deliveries - 2) * g.r.scoring.streak_step, 5);
  });

  it('holding the package past the hot clock brings more drones', () => {
    const round = roundOf('swoop', 1);
    const s = new RoundSim(g, round), p = idealPolicy(g);
    while (!s.result && s.t < g.r.scoring.hot_clock + g.r.scoring.swarm_every * 1.5) { const u = p(s); s.step(u); } // never tosses
    expect(s.drones.some((d) => d.swarm)).toBe(true);
  });

  it('blind drones come from behind his off-hand shoulder', () => {
    const round = roundOf('blind');
    const l = round.launches[0]!;
    expect(l.z).toBeLessThan(0);
    expect(Math.sign(l.x)).toBe(offSign(g));
  });

  it('a toss to a friend who is not out this round does nothing', () => {
    const round = makeRound(g, 1, 5);
    const missing = ['A', 'B', 'C', 'D', 'E'].find((id) => !round.friends.some((f) => f.id === id))!;
    const s = new RoundSim(g, round);
    s.act({ kind: 'toss', target: missing });
    expect(s.toss).toBeNull();
    expect(STEP).toBeGreaterThan(0);
  });

  it('Y U I O P go left to right across his view: Y the leftmost friend, P the rightmost', () => {
    const want: Record<number, string> = { 1: 'i', 2: 'yp', 3: 'yip', 4: 'yuop', 5: 'yuiop' };
    for (let level = 1; level <= 8; level++) for (let i = 0; i < 4; i++) {
      const round = makeRound(g, level, 300 + 10 * level + i), keys = tossKeys(round);
      expect([...keys.keys()].join('')).toBe(want[round.friends.length]);
      const xs = [...keys.values()].map((id) => round.friends.find((f) => f.id === id)!.x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    }
  });

  it('the run report splits lanterns by side and counts what he dodged', () => {
    const run = play(new Run(g, 21, 1), ideal(), 40);
    const rep = report(run);
    expect(rep.bySide.throwing.lit + rep.bySide.off.lit).toBe(run.rounds);
    expect(rep.dodged).toBeGreaterThan(0);
    expect(rep.cut).not.toBeNull();
  });

  it('looks unlock with his best score, one of each from the start', () => {
    const none = unlocked(g, 0);
    expect(none.jackets.length).toBe(1);
    expect(none.trails.length).toBe(1);
    expect(unlocked(g, 1e9).jackets.length).toBe(g.r.unlocks.jackets.length);
  });
});
