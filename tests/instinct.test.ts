import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { parsePlayContent } from '../src/play/content';
import { Run, SnapSim, STEP, idealPolicy, makeSnap, runSnap, separation, type Action, type Input } from '../src/instinct';

const c = parsePlayContent(loadRawContent());
const idle = () => ({ mx: 0, my: 0 });

/** Play a run with a controller until it is over (or a time limit). */
function play(run: Run, policy: (r: Run) => Input & { action?: Action }, limit = 120) {
  while (run.phase !== 'over' && run.clock < limit) {
    const u: Input & { action?: Action } = run.phase === 'snap' ? policy(run) : idle();
    if (u.action) run.act(u.action);
    run.step(u);
  }
  return run;
}
const ideal = (r: Run) => idealPolicy(c, r.sim.snap)(r.sim);
/** the first snap at a level with a given pattern */
function snapOf(pattern: string, level = 6) {
  for (let i = 0; i < 200; i++) { const s = makeSnap(c, level, 77, i); if (s.pattern.id === pattern) return s; }
  throw new Error(`no ${pattern} snap`);
}

describe('Pocket Instinct', () => {
  it('waits for the owner to sign off batch 5', () => {
    expect(c.instinct.reviewed).toBe(false);
  });

  it('is deterministic: the same seed and inputs give the same run (golden replay)', () => {
    const script = (r: Run) => (r.sim.t > 1.2 && r.sim.t < 1.8 ? { mx: 0.5, my: 0.4 } : ideal(r));
    const a = play(new Run(c, 4242, 1), script, 40), b = play(new Run(c, 4242, 1), script, 40);
    expect(b.score).toBe(a.score);
    expect(b.log.map((l) => [l.snap.pattern.id, l.result.kind, l.result.t])).toEqual(a.log.map((l) => [l.snap.pattern.id, l.result.kind, l.result.t]));
  });

  it('the right move and the first window keep a run going, level after level', () => {
    const run = play(new Run(c, 7, 1), ideal, 60);
    expect(run.log.length).toBeGreaterThan(8);
    expect(run.log.every((l) => l.result.kind === 'complete')).toBe(true);
    expect(run.level).toBeGreaterThan(1 + Math.floor((run.log.length - 1) / c.instinct.ramp.snaps_per_level) - 1);
    expect(run.multiplier).toBeCloseTo(1 + run.completions * c.instinct.scoring.multiplier_step, 5);
  });

  it('standing still ends the run with a hit on the first snap', () => {
    const run = play(new Run(c, 9, 1), idle);
    expect(run.phase).toBe('over');
    expect(run.log).toHaveLength(1);
    expect(run.log[0]!.result.kind).toBe('hit');
  });

  it('hang time counts at most the hot clock per ball', () => {
    const run = play(new Run(c, 9, 1), idle);
    expect(run.log[0]!.held).toBeGreaterThan(c.instinct.scoring.hot_clock);
    expect(run.hang).toBeCloseTo(c.instinct.scoring.hot_clock, 5);
  });

  it('a throw into a tight shadow is intercepted and ends the run', () => {
    const run = play(new Run(c, 11, 1), (r) => {
      const s = r.sim;
      const tight = s.snap.allies.find((a) => separation(c, a, s.t) < c.instinct.allies.pick_reach);
      return s.canThrow && tight ? { mx: 0, my: 0, action: { kind: 'throw', target: tight.id } } : idle();
    });
    expect(run.log.at(-1)!.result.kind).toBe('pick');
    expect(run.phase).toBe('over');
  });

  it('an incompletion or a throwaway keeps the run going but resets the multiplier', () => {
    let thrown = false;
    const run = play(new Run(c, 13, 1), (r) => {
      // after two completions, throw one away (from inside the pocket: grounding)
      if (r.completions >= 2 && !thrown && r.sim.canThrow) { thrown = true; return { mx: 0, my: 0, action: { kind: 'throw-away' } }; }
      return ideal(r);
    }, 40);
    const k = run.log.findIndex((l) => l.result.kind === 'grounding' || l.result.kind === 'throw-away');
    expect(k).toBe(2);
    expect(run.log.length).toBeGreaterThan(k + 1);
    // the multiplier restarted from 1 after the throwaway
    expect(run.multiplier).toBeCloseTo(1 + (run.completions - 2) * c.instinct.scoring.multiplier_step, 5);
  });

  it('a throwaway is legal only from outside the free-blocking zone (NFHS 7-5-2 exception)', () => {
    const snap = snapOf('clean', 1);
    const inside = runSnap(c, snap, (s) => (s.canThrow && s.t > 1 ? { mx: 0, my: 0, action: { kind: 'throw-away' } } : idle()));
    expect(inside.result!.kind).toBe('grounding');
    const outside = runSnap(c, snap, (s) => (Math.abs(s.qb.x) < 5 ? { mx: 1, my: 0.2 } : s.canThrow ? { mx: 0, my: 0, action: { kind: 'throw-away' } } : idle()));
    expect(outside.result!.kind).toBe('throw-away');
  });

  it('each pressure needs its move: standing and throwing on the first window gets him hit', () => {
    for (const p of ['edge', 'push', 'collapse']) {
      const snap = snapOf(p);
      const stand = runSnap(c, snap, (s) => {
        const a = s.canThrow ? snap.allies.find((x) => separation(c, x, s.t + c.drills.ball.release_delay) >= c.drills.reads.open_separation + 0.3) : undefined;
        return a ? { mx: 0, my: 0, action: { kind: 'throw', target: a.id } } : idle();
      });
      expect(stand.result!.kind, p).toBe('hit');
      expect(runSnap(c, snap, idealPolicy(c, snap)).result!.kind, p).toBe('complete');
    }
  });

  it('moving toward his off-hand side costs the reset before the ball comes out', () => {
    const snap = snapOf('clean', 1), off = c.quarterback.throwing_hand === 'left' ? 1 : -1;
    const release = (dir: number) => {
      const s = new SnapSim(c, snap);
      while (s.t < 1.2) s.step(s.t > 0.6 ? { mx: dir, my: 0 } : idle());
      s.act({ kind: 'throw', target: snap.allies[0]!.id });
      return s.pending!.release - s.t;
    };
    expect(release(off) - release(-off)).toBeCloseTo(c.pocket.movement.offhand_reset.seconds, 5);
    expect(STEP).toBeGreaterThan(0);
  });
});
