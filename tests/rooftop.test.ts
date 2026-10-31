import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { rng } from '../src/game/drill';
import { parsePlayContent } from '../src/play/content';
import {
  Run, RoundSim, STEP, VIEW, checkRules, inView, watched, idealPolicy, isLit, makeGame, makeRound, offSign, report, runRound, separation, standPolicy, sweepRooftop, tossKeys, unlocked,
  type Action, type Input, type Round,
} from '../src/rooftop';

const raw = loadRawContent();
const g = makeGame(raw.rooftop, parsePlayContent(raw).quarterback.throwing_hand);
const still = (): Input => ({});
const RIGHT = { x: 1, z: 0 };

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
    const script = () => { const i = ideal(); return (r: Run) => (r.clock >= 1.2 && r.clock < 1.2 + STEP ? { tap: RIGHT } : i(r)); };
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

  it('a drone that locks on flies straight: one tap after the lock-on beats it, a tap before does not', () => {
    const round = roundOf('dive', 3), r = g.r;
    const once = (when: (s: RoundSim) => boolean) => { let done = false; return (s: RoundSim): Input => (!done && when(s) ? ((done = true), { tap: RIGHT }) : still()); };
    // stand, then one tap at the lock-on: a miss
    const late = runRound(g, round, once((s) => s.drones[0]!.committed), 6);
    expect(late.drones[0]!.passed).toBe(true);
    // one tap early: it steers onto him
    const early = runRound(g, round, once((s) => s.t > round.launches[0]!.t + 0.2), 6);
    expect(early.result?.kind).toBe('hit');
    expect(r.drones.commit.end * r.drones.speed.end).toBeGreaterThan(r.drones.hit);
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
      return s.holding && f && s.t > 0.2 ? { action: { kind: 'toss', target: f.id } } : still();
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

  it('every drone launches in front of him, inside his view, and hovers there before it comes', () => {
    for (let level = 1; level <= g.r.ramp.levels; level++) for (let i = 0; i < 10; i++) {
      const round = makeRound(g, level, 500 + 10 * level + i), [sx, sz] = g.r.courier.start;
      for (const l of round.launches) {
        const deg = (Math.atan2(l.x - sx, l.z - sz) * 180) / Math.PI;
        expect(Math.abs(deg)).toBeLessThan(VIEW / 2 - 2);
        expect(l.t).toBeGreaterThanOrEqual(g.r.drones.warn * 0.9);
      }
    }
  });

  it('a person always has time: tap a beat after the lock-on and it misses', () => {
    for (let level = 1; level <= g.r.ramp.levels; level += 3) for (let i = 0; i < 8; i++) {
      const round = makeRound(g, level, 900 + 10 * level + i);
      const s = runRound(g, round, idealPolicy(g, { react: g.r.drones.react }));
      expect(s.result?.kind, `level ${level} ${round.pattern.id}`).toBe('catch');
    }
  });

  it('he moves by taps: each tap is one step, holding does nothing more, tapping fast goes further', () => {
    const round = makeRound(g, 1, 5), r = g.r;
    const s = new RoundSim(g, round), x0 = s.x;
    s.step({ tap: RIGHT });
    for (let k = 0; k < 60; k++) s.step(still()); // half a second, no more taps
    expect(s.x - x0).toBeCloseTo(r.courier.step, 3);
    expect(Math.hypot(s.vx, s.vz)).toBeLessThan(1e-6);
    // three quick taps: three steps, quickly
    const q = new RoundSim(g, round);
    for (let k = 0; k < 36; k++) q.step(k % 12 === 0 ? { tap: RIGHT } : still());
    for (let k = 0; k < 30; k++) q.step(still());
    expect(q.x - x0).toBeCloseTo(3 * r.courier.step, 3);
    expect(q.taps).toBe(3);
  });

  it('a drone that can still get him stays in his view, however he moves (random tapping)', () => {
    let rounds = 0, out = 0, hunting = 0;
    for (let level = 1; level <= g.r.ramp.levels; level += 2) for (let i = 0; i < 20; i++) {
      const round = makeRound(g, level, 7000 + level * 100 + i), rand = rng(level * 31 + i);
      let next = 0.2, seen = true;
      runRound(g, round, (s) => {
        for (const d of watched(g, s)) if (!inView(g, s, d)) { seen = false; if (!d.committed) hunting++; }
        if (s.t < next) return still();
        next = s.t + 0.15 + rand() * 0.6;
        const k = Math.floor(rand() * 5);
        return k < 4 ? { tap: [RIGHT, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }][k]! } : still();
      }, 12);
      rounds++; if (!seen) out++;
    }
    // a hunting drone never leaves his view; a locked-on one only right at the edge in its last moment, rarely
    expect(hunting).toBe(0);
    expect(out / rounds).toBeLessThan(0.02);
  });

  it('blindside waves come from his off-hand side', () => {
    const round = roundOf('blindside');
    for (const l of round.launches) expect(Math.sign(l.x - g.r.courier.start[0])).toBe(offSign(g));
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
