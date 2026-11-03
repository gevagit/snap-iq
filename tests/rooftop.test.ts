import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { parsePlayContent } from '../src/play/content';
import {
  Run, RoundSim, STEP, checkRules, draftRound, friendNumber, friendsOf, idealPolicy, idealRb, isLit, makeGame, makeRound,
  report, runRound, separation, sweepRooftop, tossKeys, unlocked, RB_ID,
  type Action, type Input, type Round,
} from '../src/rooftop';

const raw = loadRawContent();
const g = makeGame(raw.rooftop, parsePlayContent(raw).quarterback.throwing_hand);
const still = (): Input => ({});
const UP = { x: 0, z: 1 }, RIGHT = { x: 1, z: 0 }, LEFT = { x: -1, z: 0 };

/** Play a run with a controller until it is over (or a time limit); it calls the RB and snaps each play. */
function play(run: Run, policy: (r: Run) => Input & { action?: Action }, limit = 120, rb: (r: Round) => string | null = idealRb) {
  while (run.phase !== 'over' && run.clock < limit) {
    if (run.phase === 'pre') { run.callRb(rb(run.round)); run.snap(); }
    const u: Input & { action?: Action } = run.phase === 'live' ? policy(run) : still();
    if (u.action) run.act(u.action);
    run.step(u);
  }
  return run;
}
function ideal() {
  let sim: RoundSim | null = null, p: ReturnType<typeof idealPolicy> | null = null;
  return (r: Run) => { if (r.sim !== sim) { sim = r.sim; p = idealPolicy(g, { react: g.r.drones.react }); } return p!(r.sim); };
}
/** A dealt play matching a test, searched over seeds. */
function find(level: number, ok: (r: Round) => boolean, fair = true): Round {
  for (let i = 0; i < 2000; i++) { const r = fair ? makeRound(g, level, 50 + i) : draftRound(g, level, 50 + i); if (ok(r)) return r; }
  throw new Error('no such play');
}
/** A copy of a play where only one drone ever breaks free (the rest held all play). */
function alone(r: Round, pick: (s: RoundSim) => string) {
  const s = new RoundSim(g, r, null), id = pick(s);
  for (const d of s.drones) if (d.id !== id) d.freeT = Infinity; // the rest drop out
  return { s, id };
}
/** Run a copy to the moment that drone is past him (or a hit), tapping once after he sees it lock on (if `when` says). */
function through(base: RoundSim, id: string, tap: Input['tap'] | null, when: (s: RoundSim) => boolean = (s) => { const d = s.drones.find((x) => x.id === id)!; return d.committed && s.t - d.commitT! >= g.r.drones.react; }) {
  const s = base.clone();
  let done = false;
  while (!s.result && s.t < 8 && !s.drones.find((d) => d.id === id)!.passed) s.step(tap && !done && when(s) ? ((done = true), { tap }) : still());
  return s;
}

describe('Rooftop Run: the protection', () => {
  it('has settings that make sense', () => {
    expect(checkRules(g.r)).toEqual([]);
  });

  it('every play at every level is fair whatever the RB call: a person who reacts a beat late gets through', () => {
    const s = sweepRooftop(g, 4);
    expect(s.failures).toEqual([]);
    expect(s.rounds).toBe(4 * g.r.ramp.levels);
  });

  it('is deterministic: the same seed, RB calls and inputs give the same run (golden replay)', () => {
    const script = () => { const i = ideal(); return (r: Run) => (r.sim.t >= 0.5 && r.sim.t < 0.5 + STEP ? { tap: RIGHT } : i(r)); };
    const a = play(new Run(g, 4242, 3), script(), 40), b = play(new Run(g, 4242, 3), script(), 40);
    expect(b.score).toBe(a.score);
    expect(b.log.map((l) => [l.rb, l.result.kind, l.result.t])).toEqual(a.log.map((l) => [l.rb, l.result.kind, l.result.t]));
  });

  it('waits for GO before every play, then the right play keeps a run going level after level', () => {
    const run = new Run(g, 7, 1);
    for (let k = 0; k < 240; k++) run.step(still());
    expect(run.phase).toBe('pre');
    expect(run.sim.t).toBe(0);
    play(run, ideal(), 120);
    expect(run.log.length).toBeGreaterThan(8);
    expect(run.log.every((l) => l.result.kind === 'catch')).toBe(true);
    expect(run.level).toBeGreaterThan(1);
  });

  it('a stronger protector holds his drone longer, never more than 4 s', () => {
    for (let i = 0; i < 40; i++) {
      const s = new RoundSim(g, draftRound(g, 6, 900 + i), null);
      for (const d of s.drones) if (d.blocker && d.freeT !== Infinity) expect(d.freeT).toBeLessThanOrEqual(g.r.protection.engage + g.r.protection.hold_max + 1e-9);
    }
    // the same play with one lineman made stronger: his drone breaks free later
    const r = find(4, (x) => !x.bust && x.rushers.length >= 4, false);
    const d0 = new RoundSim(g, r, null).drones.find((d) => d.blocker && d.blocker !== 'RB' && d.freeT < g.r.protection.engage + 3)!;
    const stronger: Round = { ...r, protectors: r.protectors.map((p) => (p.id === d0.blocker ? { ...p, strength: Math.min(99, p.strength + 30) } : p)) };
    expect(new RoundSim(g, stronger, null).drones.find((d) => d.id === d0.id)!.freeT).toBeGreaterThan(d0.freeT);
  });

  it('a drone nobody blocks comes free at the snap and gets there in about a second', () => {
    const r = find(12, (x) => new RoundSim(g, x, null).drones.some((d) => d.freeT === 0), false);
    const s = runRound(g, r, () => still(), null, 6);
    expect(s.result?.kind).toBe('hit');
    expect((s.result as { t: number }).t).toBeLessThan(1.8);
  });

  it('an edge goes around him: standing still or sliding gets him hit, a step up makes it overrun behind him', () => {
    const r = find(12, (x) => new RoundSim(g, x, null).drones.some((d) => d.edge && d.blocker && d.freeT !== Infinity), false);
    const { s, id } = alone(r, (x) => x.drones.find((d) => d.edge && d.blocker && d.freeT !== Infinity)!.id);
    expect(through(s, id, null).result?.kind).toBe('hit');
    expect(through(s, id, RIGHT).result?.kind).toBe('hit');
    expect(through(s, id, LEFT).result?.kind).toBe('hit');
    const up = through(s, id, UP);
    expect(up.result).toBeNull();
    expect(up.drones.find((d) => d.id === id)!.passed).toBe(true);
  });

  it('an inside drone that breaks free locks on and flies straight: one tap after the lock-on beats it', () => {
    const r = find(6, (x) => new RoundSim(g, x, null).drones.some((d) => !d.edge && d.blocker && d.freeT !== Infinity), false);
    const { s, id } = alone(r, (x) => x.drones.find((d) => !d.edge && d.blocker && d.freeT !== Infinity)!.id);
    expect(through(s, id, null).result?.kind).toBe('hit');
    expect(through(s, id, RIGHT).result).toBeNull();
  });

  it('the RB: kept in on a blitzer he picks it up; on a threat that drops out he runs a route; sent out, he is a receiver', () => {
    const r = find(12, (x) => x.threats.some((t) => t.blitz) && x.threats.some((t) => !t.blitz), false);
    const blitzer = r.threats.find((t) => t.blitz)!, dropper = r.threats.find((t) => !t.blitz)!;
    const on = new RoundSim(g, r, blitzer.id);
    expect(on.drones.find((d) => d.id === blitzer.id)!.blocker).toBe('RB');
    expect(on.friends.some((f) => f.id === RB_ID)).toBe(false);
    const wrong = new RoundSim(g, r, dropper.id);
    expect(wrong.drones.find((d) => d.id === blitzer.id)!.blocker).not.toBe('RB');
    expect(wrong.friends.some((f) => f.id === RB_ID)).toBe(true);
    expect(friendsOf(r, null).some((f) => f.id === RB_ID)).toBe(true);
    // picking up the blitzer (the rest of the box drops out, so nothing else gets him first)
    for (const d of on.drones) if (d.id !== blitzer.id) d.freeT = Infinity;
    let picked = false;
    for (let k = 0; k < 600 && !on.result && !picked; k++) { on.step(still()); if (on.events.some((e) => e.kind === 'pickup')) picked = true; }
    expect(picked).toBe(true);
  });

  it('front and back rows: every set-up by level, 3 to 8 drones, front-row drones coming, back-row drones coming or hanging back, some late', () => {
    const seen = new Set<string>();
    let late = 0, onTime = 0;
    for (let i = 0; i < 1200; i++) {
      const r = draftRound(g, 12, 11000 + i), spec = g.r.rush.boxes.find((b) => b.id === r.box)!;
      seen.add(r.box);
      expect(r.rushers.length).toBe(spec.front);
      expect(r.threats.length).toBe(spec.back);
      expect(r.rushers.length + r.threats.length).toBeLessThanOrEqual(8);
      expect(r.rushers.every((d) => !d.threat && d.delay === 0)).toBe(true);
      const s = new RoundSim(g, r, null);
      for (const t of r.threats.filter((x) => x.blitz)) {
        const d = s.drones.find((x) => x.id === t.id)!;
        if (t.delay > 0) { late++; expect(d.freeT).toBeGreaterThanOrEqual(t.delay); } else onTime++;
      }
    }
    for (const b of g.r.rush.boxes) expect(seen.has(b.id), b.id).toBe(true);
    expect(late).toBeGreaterThan(20);
    expect(onTime).toBeGreaterThan(late);
  });

  it('threats that blitz creep in before the snap (a tell) more often than threats that drop out', () => {
    let blitzTell = 0, blitz = 0, dropTell = 0, drop = 0;
    for (let i = 0; i < 600; i++) for (const t of draftRound(g, 10, 3000 + i).threats) {
      if (t.blitz) { blitz++; if (t.tell) blitzTell++; } else { drop++; if (t.tell) dropTell++; }
    }
    expect(blitz).toBeGreaterThan(50);
    expect(blitzTell / blitz).toBeGreaterThan(dropTell / drop + 0.3);
  });

  it('lanterns: each stays lit 1 to 3 s, and they light sooner the more drones rush', () => {
    const few: number[] = [], many: number[] = [];
    for (let i = 0; i < 1500; i++) {
      const r = draftRound(g, 3 + (i % 10), 7000 + i), rushing = [...r.rushers, ...r.threats].filter((d) => d.blitz).length;
      for (const f of r.friends) for (const [a, b] of f.windows) {
        expect(b - a).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(b - a).toBeLessThanOrEqual(3 + 1e-9);
        if (f.route === 'quick') { if (rushing >= 6) many.push(a); if (rushing <= 4) few.push(a); }
      }
    }
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(many)).toBeLessThan(avg(few) - 0.2);
  });

  it('every lit lantern that goes out while he holds the package costs points; once the ball is out, the rest do not count', () => {
    const r = find(3, (x) => x.friends.filter((f) => f.windows.length).length >= 2);
    const run = new Run(g, 1, 3);
    run.round = r; run.callRb(null); run.snap();
    const wins = run.sim.friends.flatMap((f) => f.windows).sort((a, b) => a[1] - b[1]);
    let thrown = false;
    while (run.phase === 'live' && run.sim.t < 6) {
      const s = run.sim;
      let u: Input & { action?: Action } = still();
      // hold it past the first lantern going out (the feet keep him alive), then throw to one still lit
      if (!thrown && s.t > wins[0]![1] + 0.05) {
        const f = s.friends.find((ff) => isLit(g, ff, s.t + g.r.toss.release));
        if (f) { u = { action: { kind: 'toss', target: f.id } }; thrown = true; }
      }
      if (u.action) run.act(u.action);
      run.step(u);
    }
    const res = run.log.at(-1)?.result;
    if (res && 'release' in res) {
      expect(run.missed).toBe(wins.filter((w) => w[1] <= res.release).length);
      expect(run.missed).toBeGreaterThan(0);
    } else expect(res?.kind).toBe('hit'); // he stood still too long: the rush got him first
  });

  it('a toss into a watcher still on his friend is snatched and ends the run', () => {
    const run = play(new Run(g, 11, 1), (r) => {
      const s = r.sim, f = s.friends.find((ff) => separation(g, ff, s.t + g.r.toss.release) < g.r.friends.snatch);
      return s.holding && f && s.t > 0.2 ? { action: { kind: 'toss', target: f.id } } : still();
    });
    expect(run.log.at(-1)!.result.kind).toBe('snatch');
    expect(run.phase).toBe('over');
  });

  it('getting clear of a locked-on drone only at the last moment is a clutch dodge', () => {
    const r = find(6, (x) => new RoundSim(g, x, null).drones.some((d) => !d.edge && d.blocker && d.freeT !== Infinity), false);
    const { s, id } = alone(r, (x) => x.drones.find((d) => !d.edge && d.blocker && d.freeT !== Infinity)!.id);
    const late = through(s, id, { ...RIGHT, power: g.r.courier.power_max }, (x) => {
      const d = x.drones.find((y) => y.id === id)!;
      return d.committed && d.perp0 < g.r.drones.hit && Math.hypot(d.x - x.x, d.z - x.z) / d.speed < 0.2;
    });
    expect(late.result).toBeNull();
    expect(late.clutches).toBe(1);
  });

  it('he moves by taps: each tap is one step, a sharp flick a longer one', () => {
    const r = makeRound(g, 1, 5), c = g.r.courier;
    const soft = new RoundSim(g, r, null), sharp = new RoundSim(g, r, null);
    soft.step({ tap: RIGHT }); sharp.step({ tap: { ...RIGHT, power: c.power_max } });
    for (let k = 0; k < 60; k++) { soft.step(still()); sharp.step(still()); }
    expect(soft.x - c.start[0]).toBeCloseTo(c.step, 3);
    expect(sharp.x - c.start[0]).toBeCloseTo(c.step * c.power_max, 3);
  });

  it('friends are numbered 1, 2, 3... left to right across his view, the RB included when he runs a route', () => {
    for (let i = 0; i < 20; i++) {
      const r = makeRound(g, 1 + (i % 12), 300 + i), friends = friendsOf(r, null), keys = tossKeys(friends);
      expect([...keys.keys()].join('')).toBe('123456'.slice(0, friends.length));
      const angles = [...keys.values()].map((id) => { const f = friends.find((x) => x.id === id)!; return Math.atan2(f.x, f.z); });
      expect([...angles].sort((a, b) => a - b)).toEqual(angles);
      for (const [k, id] of keys) expect(friendNumber(friends, id)).toBe(Number(k));
    }
  });

  it('the run report counts the RB reads and the lanterns he missed', () => {
    const run = play(new Run(g, 21, 6), ideal(), 60);
    const rep = report(run);
    expect(rep.rounds).toBe(run.rounds);
    expect(rep.readsRight).toBeLessThanOrEqual(rep.reads);
    expect(rep.missed).toBe(run.missed);
  });

  it('the wingman comes open late (3 s or more) and only now and then, never first in most plays', () => {
    let open = 0, first = 0, n = 0;
    for (let lv = 1; lv <= 12; lv++) for (let i = 0; i < 25; i++) {
      const r = draftRound(g, lv, 900 + lv * 31 + i); n++;
      const w = r.rbRoute.windows[0];
      if (!w) continue;
      open++;
      expect(w[0]).toBeGreaterThanOrEqual(3);
      if (r.friends.every((f) => !f.windows.length || f.windows[0]![0] > w[0])) first++;
    }
    expect(open / n).toBeLessThan(0.45);
    expect(first / n).toBeLessThan(0.15);
  }, 30000);

  it('a play where he never tosses ends once every lantern is out and nothing is loose (no endless play)', () => {
    for (let lv = 1; lv <= 12; lv += 2) {
      const r = draftRound(g, lv, 700 + lv * 13), p = idealPolicy(g, { react: g.r.drones.react });
      const s = runRound(g, r, (sim) => ({ tap: p(sim).tap }), null, 20);
      expect(s.result).not.toBeNull();
      expect(['dead', 'hit']).toContain(s.result!.kind);
    }
    // and the run goes on to the next play, the streak reset
    const run = new Run(g, 5, 7), ip = ideal();
    play(run, (r) => ({ tap: ip(r).tap }), 12);
    expect(run.rounds).toBeGreaterThan(0);
  }, 60000);

  it('looks unlock with his best score, one of each from the start', () => {
    expect(unlocked(g, 0).jackets.length).toBe(1);
    expect(unlocked(g, 1e9).trails.length).toBe(g.r.unlocks.trails.length);
  });
});
