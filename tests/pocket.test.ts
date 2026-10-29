import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { parsePlayContent } from '../src/play/content';
import { PocketSim, gradePocket, idealPolicy, makePocketRep, runPolicy, type Input, type PocketRep } from '../src/pocket';

const raw = loadRawContent();
const c = parsePlayContent(raw);

/** The first rep of a type for a tier. */
function repOf(type: string, tier: 'youth' | 'jv' = 'jv', mode: 'good' | 'bad' | 'unpredictable' = 'good'): PocketRep {
  for (let i = 0; i < 400; i++) {
    const rep = makePocketRep(c, tier, mode, 7 + i, i, true);
    if (rep?.type.id === type) return rep;
  }
  throw new Error(`no ${type} rep`);
}
const idle = () => ({ mx: 0, my: 0 });
/** Hold the pad one way from `from` seconds until `until`, then stand. */
const hold = (from: number, until: number, u: Input) => (sim: PocketSim) => (sim.t >= from && sim.t < until ? u : idle());

describe('Bubble: the pocket engine', () => {
  it('runs on the signed-off Football Bible without playtest (batch 4 signed off)', () => {
    expect(makePocketRep(c, 'youth', 'good', 1, 0, false)!.reviewed).toBe(true);
  });

  it('is deterministic: the same rep and the same inputs give the same play (golden replay)', () => {
    const a = makePocketRep(c, 'jv', 'unpredictable', 42, 3, true)!;
    const b = makePocketRep(c, 'jv', 'unpredictable', 42, 3, true)!;
    expect(b.call).toEqual(a.call);
    expect(b.scripts).toEqual(a.scripts);
    const script = (sim: PocketSim) => (sim.t > 1.0 && sim.t < 1.8 ? { mx: 0.4, my: 0.5 } : sim.t > 2.2 && sim.canThrow ? { mx: 0, my: 0, action: { kind: 'throw-away' as const } } : idle());
    const r1 = runPolicy(c, a, script), r2 = runPolicy(c, b, script);
    expect(r2.result).toEqual(r1.result);
    expect(r2.hist.get('QB')).toEqual(r1.hist.get('QB'));
  });

  it('every rep type of each tier can be generated', () => {
    for (const tier of ['youth', 'jv'] as const) for (const id of c.pocket.tiers[tier].types) expect(repOf(id, tier).type.id).toBe(id);
  });

  it('edge speed rush: standing still is a sack, climbing beats it', () => {
    const rep = repOf('edge-speed-rush');
    expect(runPolicy(c, rep, idle).result!.kind).toBe('sack');
    const sim = runPolicy(c, rep, idealPolicy(c, rep));
    const g = gradePocket(c, sim);
    expect(g.sacked).toBe(false);
    expect(g.path.kind).toBe('climb');
    expect(g.move).toBe('best');
    expect(g.timing).toBe(true);
  });

  it('edge speed rush: stepping toward the rusher is not the right move', () => {
    const rep = repOf('edge-speed-rush');
    const sim = runPolicy(c, rep, hold(rep.real - 0.3, rep.real + 1.0, { mx: rep.side * 0.6, my: 0 }));
    expect(gradePocket(c, sim).move).not.toBe('best');
  });

  it('interior push: sliding away beats it, sliding into it does not', () => {
    const rep = repOf('interior-push');
    const away = runPolicy(c, rep, idealPolicy(c, rep));
    expect(gradePocket(c, away).move).toBe('best');
    const into = runPolicy(c, rep, hold(rep.real - 0.3, rep.real + 1.2, { mx: rep.side * 0.6, my: 0 }));
    expect(gradePocket(c, into).move).not.toBe('best');
  });

  it('full collapse: escaping to the open side is best; nothing is right standing still', () => {
    const rep = repOf('full-collapse');
    expect(runPolicy(c, rep, idle).result!.kind).toBe('sack');
    const g = gradePocket(c, runPolicy(c, rep, idealPolicy(c, rep)));
    expect(g.path.kind).toBe('pocket-escape');
    expect(g.path.side).toBe(rep.side);
    expect(g.move).toBe('best');
  });

  it('clean pocket: leaving it is happy feet', () => {
    const rep = repOf('clean-pocket', 'youth');
    expect(gradePocket(c, runPolicy(c, rep, idealPolicy(c, rep))).move).toBe('best');
    const fidget = runPolicy(c, rep, (sim) => (sim.t > 1.6 && sim.t < 2.6 ? { mx: 1, my: 0.2 } : sim.t > 2.7 && sim.canThrow ? { mx: 0, my: 0, action: { kind: 'throw-away' as const } } : idle()));
    expect(gradePocket(c, fidget).move).toBe('wrong');
  });

  it('a free rusher: the ball has to come out before he gets there', () => {
    const rep = repOf('blitz-not-picked-up');
    const g = gradePocket(c, runPolicy(c, rep, idealPolicy(c, rep)));
    expect(g.sacked).toBe(false);
    expect(g.onTime).toBe(true);
    const late = runPolicy(c, rep, (sim) => (sim.t > rep.arrive + 0.2 && sim.canThrow ? { mx: 0, my: 0, action: { kind: 'throw', target: rep.firstRead! } } : idle()));
    expect(gradePocket(c, late).sacked).toBe(true);
  });

  it('a throwaway is legal only from outside the free-blocking zone (NFHS 7-5-2 exception)', () => {
    const rep = repOf('clean-pocket', 'youth');
    const inside = runPolicy(c, rep, (sim) => (sim.t > 2 && sim.canThrow ? { mx: 0, my: 0, action: { kind: 'throw-away' as const } } : idle()));
    expect(inside.result!.kind).toBe('throw-away');
    expect(inside.result!.legal).toBe(false);
    expect(gradePocket(c, inside).ball).toBe('grounding');
    const outside = runPolicy(c, rep, (sim) => (Math.abs(sim.qb.x) < 5.5 && sim.t > 1.6 ? { mx: rep.side, my: 0.2 } : sim.t > 1.6 && sim.canThrow ? { mx: 0, my: 0, action: { kind: 'throw-away' as const } } : idle()));
    expect(outside.result!.legal).toBe(true);
  });

  it('moving to his off-hand side, he resets before the ball comes out', () => {
    const rep = repOf('clean-pocket', 'youth');
    const off = c.quarterback.throwing_hand === 'left' ? 1 : -1;
    const release = (dir: number) => {
      const sim = new PocketSim(c, rep);
      while (sim.t < 2.2) sim.step(sim.t > 1.5 ? { mx: dir, my: 0 } : idle());
      sim.act({ kind: 'throw', target: rep.firstRead! });
      return sim.pending!.release - sim.t;
    };
    expect(release(off) - release(-off)).toBeCloseTo(c.pocket.movement.offhand_reset.seconds, 5);
  });
});
