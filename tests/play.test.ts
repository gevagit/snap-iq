import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { parsePlayContent } from '../src/play/content';
import { allCalls, buildPlay, type Play, type PlayCall } from '../src/play';
import { validateContent } from '../src/validate';
import { profileDistance } from '../src/play/movement';

const raw = loadRawContent();
const content = parsePlayContent(raw);
const clone = <T>(v: T): T => structuredClone(v);

const base: PlayCall = {
  formation: 'gun-trips-te', strength: 'right', motion: 'none', concept: 'stick-concept', protection: 'half-slide',
  front: 'four-two-five-over', coverage: 'cover-3-sky', spot: 'left_hash',
};
function play(call: Partial<PlayCall>, c = content): Play {
  const r = buildPlay(c, { ...base, ...call });
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}
const failed = (p: Play) => p.checks.filter((ch) => !ch.ok).map((ch) => ch.id);
const track = (p: Play, id: string) => p.sim.tracks.find((t) => t.id === id)!;
const at = (p: Play, id: string, seconds: number) => {
  const t = track(p, id);
  const k = p.sim.snapIndex + Math.round(seconds / p.sim.dt);
  return { x: t.xs[k]!, y: t.ys[k]! };
};

describe('play generator', () => {
  it('builds legitimate plays that pass every invariant (sample of all calls)', () => {
    const calls = allCalls(content).filter((_, i) => i % 41 === 0);
    let built = 0;
    for (const call of calls) {
      const r = buildPlay(content, call);
      if (!r.ok) continue;
      built++;
      expect({ call, failed: failed(r.value) }).toEqual({ call, failed: [] });
    }
    expect(built).toBeGreaterThan(400);
  });

  it('is deterministic: same call, same play', () => {
    const a = play({ motion: 'short-motion', coverage: 'cover-1-robber' });
    const b = play({ motion: 'short-motion', coverage: 'cover-1-robber' });
    expect(a.sim.tracks.map((t) => [...t.xs, ...t.ys])).toEqual(b.sim.tracks.map((t) => [...t.xs, ...t.ys]));
  });

  it('mirrors exactly when the strength and ball spot flip', () => {
    const calls = allCalls(content, ['left_hash', 'middle']).filter((_, i) => i % 97 === 0);
    let compared = 0;
    for (const call of calls) {
      const r = buildPlay(content, call);
      const m = buildPlay(content, { ...call, strength: 'left', spot: call.spot === 'left_hash' ? 'right_hash' : 'middle' });
      expect(m.ok).toBe(r.ok);
      if (!r.ok || !m.ok) continue;
      compared++;
      // the left tackle stays the left tackle when the formation flips
      const twin: Record<string, string> = { LT: 'RT', RT: 'LT', LG: 'RG', RG: 'LG' };
      for (const t of r.value.sim.tracks) {
        const u = m.value.sim.tracks.find((q) => q.id === (t.team === 'O' ? twin[t.id] ?? t.id : t.id))!;
        for (let k = 0; k <= r.value.sim.steps; k += 7) {
          // content values are rounded to 0.0001 yd, so the two hashes mirror to about 1e-4
          expect(u.xs[k]).toBeCloseTo(-t.xs[k]!, 3);
          expect(u.ys[k]).toBeCloseTo(t.ys[k]!, 3);
        }
      }
    }
    expect(compared).toBeGreaterThan(50);
  });
});

describe('football scenarios', () => {
  it('Stick vs Cover 3 Sky: two-high before the snap, the strong safety spins down to the curl-flat', () => {
    const p = play({});
    expect(p.analysis.shellPre).toBe('two-high');
    expect(p.analysis.shellPost).toBe('one-high');
    expect(p.analysis.rotation).toBe('sky-rotation');
    expect(p.analysis.readDefenders).toEqual(['ss']);
    const lm = p.sim.landmarks.find((l) => l.role === 'ss')!;
    expect(lm.zone).toBe('curl-flat');
    const ss = at(p, 'ss', lm.by);
    expect(Math.hypot(ss.x - lm.at.x, ss.y - lm.at.y)).toBeLessThan(1);
    expect(at(p, 'ss', 0).y).toBeGreaterThan(9.5); // still high at the snap (the creep is the tell)
  });

  it('a receiver is where his route and speed profile put him (PRD §6.13 timing)', () => {
    const p = play({ coverage: 'cover-3', front: 'four-three-over' });
    const z = track(p, 'Z');
    const start = { x: z.xs[p.sim.snapIndex]!, y: z.ys[p.sim.snapIndex]! };
    // go route: about 4 yards at 1.0 s and 9.5 at 1.75 s (PRD §6.13); samples every 1/30 s
    const gained = (s: number) => Math.hypot(at(p, 'Z', s).x - start.x, at(p, 'Z', s).y - start.y);
    expect(gained(1.0)).toBeCloseTo(profileDistance(content.speeds.profiles.WR!, 1.0), 6);
    expect(gained(1.0)).toBeCloseTo(4, 0);
    expect(gained(1.8)).toBeCloseTo(profileDistance(content.speeds.profiles.WR!, 1.8), 6);
    expect(gained(1.8)).toBeGreaterThan(9.5);
  });

  it('Cover 0 against five-man protection with no hot route is not a legitimate play', () => {
    const r = buildPlay(content, { ...base, formation: 'gun-empty', concept: 'four-verticals', protection: 'five-man', front: 'four-two-five-even', coverage: 'cover-0' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('no hot route');
    const hot = play({ formation: 'gun-empty', concept: 'slant-flat', protection: 'five-man', front: 'four-two-five-even', coverage: 'cover-0' });
    expect(hot.analysis.rushers).toBeGreaterThan(hot.analysis.blockers);
    expect(hot.analysis.hot.length).toBeGreaterThan(0);
    expect(hot.analysis.freeRushers.length).toBe(hot.analysis.rushers - hot.analysis.blockers);
  });

  it('motion shows man or zone: the man defender travels, zone defenders only bump', () => {
    const man = play({ formation: 'gun-trips', motion: 'jet-motion', front: 'four-two-five-over', coverage: 'cover-1-robber', protection: 'five-man' });
    const zone = play({ formation: 'gun-trips', motion: 'jet-motion', front: 'four-two-five-over', coverage: 'cover-3-sky', protection: 'five-man' });
    expect(man.analysis.motionResponse).toBe('travel');
    expect(zone.analysis.motionResponse).toBe('bump');
    // before the snap the man defender on the jet man (Mike, on #3) runs with him; in zone no one does
    const lateral = (p: Play, id: string) => Math.abs(track(p, id).xs[p.sim.snapIndex]! - track(p, id).xs[0]!);
    const traveler = man.sim.man.find((m) => m.target === man.plan!.mover)!.role;
    const zoneMost = Math.max(...zone.sim.tracks.filter((t) => t.team === 'D').map((t) => lateral(zone, t.id)));
    expect(lateral(man, traveler)).toBeGreaterThan(1);
    expect(lateral(man, traveler)).toBeGreaterThan(zoneMost + 0.5);
    // ... and keeps chasing him across after it
    expect(Math.sign(at(man, traveler, 1.0).x - at(man, traveler, 0).x)).toBe(man.plan!.destination);
    expect(Math.abs(at(man, traveler, 1.0).x - at(man, traveler, 0).x)).toBeGreaterThan(2);
  });

  it('back motion to empty needs a protection without the back', () => {
    expect(buildPlay(content, { ...base, formation: 'gun-doubles-te', motion: 'back-motion', protection: 'half-slide' }).ok).toBe(false);
    const p = play({ formation: 'gun-doubles-te', motion: 'back-motion', protection: 'five-man' });
    expect(p.checks.find((ch) => ch.id === 'set-one-second')!.ok).toBe(true);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- these tests reach into raw YAML to break it on purpose */
describe('invariants catch bad football', () => {
  const mutate = (fn: (r: Record<string, any>) => void) => {
    const bad = clone(raw) as Record<string, any>;
    fn(bad);
    return bad;
  };

  it('a motion that reaches the line is illegal', () => {
    const bad = mutate((r) => {
      const jet = r.motions.motions.find((m: any) => m.id === 'jet-motion');
      jet.path.snap.depth = 0.6;
      delete jet.needs.clear_of_teammates;
    });
    const p = play({ formation: 'gun-trips', motion: 'jet-motion', protection: 'five-man' }, parsePlayContent(bad as never));
    expect(failed(p)).toContain('motion');
  });

  it('six on the line is an illegal formation', () => {
    const bad = mutate((r) => { r.formations.formations.find((f: any) => f.id === 'gun-trips').players.Z.on_line = false; });
    expect(validateContent(bad as never).errors.some((e) => e.includes('on the line; NFHS needs at least 7'))).toBe(true);
    const p = play({ formation: 'gun-trips', protection: 'five-man' }, parsePlayContent(bad as never));
    expect(failed(p)).toContain('legal-formation');
  });

  it('a lineman in the neutral zone is caught', () => {
    const bad = mutate((r) => { r.fronts.alignment.dl_depth = 0.4; });
    expect(failed(play({}, parsePlayContent(bad as never)))).toContain('neutral-zone');
  });

  it('a rotation the safety cannot reach in time is caught', () => {
    const bad = mutate((r) => { r.coverages.zones['curl-flat'].by = 0.6; });
    expect(failed(play({}, parsePlayContent(bad as never)))).toContain('landmarks');
  });

  it('man coverage that leaves a receiver uncovered is caught', () => {
    const bad = mutate((r) => { r.coverages.coverages.find((c: any) => c.id === 'cover-1').fronts['four-three-over'].sam.job = { zone: 'hook', side: 'strong' }; });
    const p = play({ front: 'four-three-over', coverage: 'cover-1' }, parsePlayContent(bad as never));
    expect(failed(p)).toContain('coverage-complete');
  });

  it('a shell label that does not match the safeties is caught', () => {
    const bad = mutate((r) => { r.coverages.coverages.find((c: any) => c.id === 'cover-3').fronts['four-three-over'].fs.align = 'down'; });
    expect(failed(play({ front: 'four-three-over', coverage: 'cover-3' }, parsePlayContent(bad as never)))).toContain('shell');
  });

  it('content cross-references are checked', () => {
    const bad = mutate((r) => {
      r.formations.formations[0].terms.push('cover-9');
      r.coverages.coverages.find((c: any) => c.id === 'cover-3-sky').rotation = undefined;
      r.coverages.coverages.find((c: any) => c.id === 'cover-2').fronts['four-three-over'].nickel = { job: { zone: 'hook', side: 'strong' } };
    });
    const errors = validateContent(bad as never).errors;
    expect(errors.some((e) => e.includes('cover-9'))).toBe(true);
    expect(errors.some((e) => e.includes('needs a rotation tag'))).toBe(true);
    expect(errors.some((e) => e.includes('nickel, who is not in the front'))).toBe(true);
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
