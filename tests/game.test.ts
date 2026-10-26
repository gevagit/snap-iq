import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { parsePlayContent } from '../src/play/content';
import { blitzers, callReviewed, emptyAnswers, finishWorkout, grade, makeRep, newProgress, progression, rank, recommendedReads, recordRep, rng, routeMenu, withChanges, withReads, type Answers, type Rep } from '../src/game/drill';
import { buildPlay } from '../src/play';
import { explain } from '../src/game/explain';
import { callSheet } from '../src/game/call';

const raw = loadRawContent();
const c = parsePlayContent(raw);
const terms = new Map((raw.glossary as { terms: { id: string; term: string; definition: string }[] }).terms.map((t) => [t.id, t]));

/** The same content with every entry set to reviewed (or not), to test the review gate. */
function withReview(reviewed: boolean) {
  const r = structuredClone(raw) as Record<string, unknown>;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('reviewed' in o) {
        if (reviewed) Object.assign(o, { reviewed: true, reviewer: 'owner', reviewed_at: '2026-10-26' });
        else { o.reviewed = false; delete o.reviewer; delete o.reviewed_at; }
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(r);
  return parsePlayContent(r as never);
}

/** His answers when every step of the routine and the decision are right. */
function perfect(rep: Rep): Answers {
  const k = rep.routine;
  return {
    ...emptyAnswers(),
    alignment: k.alignment, shell: k.shell, box: k.box, corners: k.corners.map((cn) => cn.look), tells: k.tells,
    threats: { more: k.threats.more, hot: k.threats.more ? k.threats.hot[0] ?? null : null },
    key: k.key, keyAnswered: true, escape: k.escape, reads: k.reads, routineTime: 10,
    drop: k.drop, coverage: rep.post.coverage, blitz: rep.post.blitz, lookOff: false, decision: rep.post.decision,
  };
}

describe('Pre-snap routine game', () => {
  it('uses only signed-off content unless playtest is on (CLAUDE.md review gate)', () => {
    const unsigned = withReview(false);
    expect(makeRep(unsigned, 'youth', 1, 0, false)).toBeNull();
    expect(makeRep(unsigned, 'youth', 1, 0, true)!.reviewed).toBe(false);
    const ok = makeRep(withReview(true), 'youth', 1, 0, false)!;
    expect(ok.reviewed).toBe(true);
    expect(callReviewed(withReview(true), ok.call)).toBe(true);
  });

  it('runs on the signed-off Football Bible without playtest', () => {
    expect(makeRep(c, 'youth', 1, 0, false)!.reviewed).toBe(true);
  });

  it('is deterministic: the same seed gives the same workout', () => {
    for (let i = 0; i < 6; i++) {
      const a = makeRep(c, 'jv', 42, i, true)!;
      const b = makeRep(c, 'jv', 42, i, true)!;
      expect(a.call).toEqual(b.call);
      expect(a.fault).toEqual(b.fault);
      expect(a.routine).toEqual(b.routine);
      expect(a.post).toEqual(b.post);
    }
    expect(rng(7)()).toBe(rng(7)());
  });

  it('builds tier reps from tier content, each a legitimate play with a full answer key', () => {
    const tier = c.drills.routine.tiers.youth;
    let faults = 0;
    for (let i = 0; i < 20; i++) {
      const rep = makeRep(c, 'youth', 2026, i, true)!;
      expect(tier.coverages).toContain(rep.call.coverage);
      expect(tier.fronts).toContain(rep.call.front);
      expect(rep.play.checks.every((ch) => ch.ok)).toBe(true);
      expect(rep.clock).toBe(tier.clock);
      const k = rep.routine;
      expect(k.alignment).toBe(rep.fault ? rep.fault.id : 'ok');
      if (rep.fault) faults++;
      expect(k.corners.length).toBeGreaterThan(0);
      expect(['none', 'blitz-tell', 'rotation-tell']).toContain(k.tells);
      expect(k.reads.length).toBeGreaterThan(0);
      expect(k.reads.length).toBeLessThanOrEqual(c.drills.routine.max_reads);
      expect(k.reads).toEqual(recommendedReads(c, rep.play));
      expect(rep.freeze1).toBe(c.drills.routine.post.snap_freeze);
      expect(rep.freeze2).toBeCloseTo(rep.freeze1 + c.drills.routine.post.decision_after);
      expect(k.drop).toBe(c.quarterback.drops[rep.call.concept]![rep.play.offense.formation.qb]);
      expect(['left', 'right']).toContain(k.escape);
    }
    expect(faults).toBeGreaterThan(0);
  });

  it('the ball goes to the first open receiver in HIS reads; otherwise run, roll out or throw it away', () => {
    let open = 0, other = 0;
    for (let i = 0; i < 30; i++) {
      const rep = makeRep(c, 'jv', 99, i, true)!;
      expect(rep.post.options.map((o) => o.id)).toEqual(progression(c, rep.play));
      expect(rep.post.coverage).toBe(rep.play.defense.coverage.answer);
      const first = rep.post.reads.map((id) => rep.post.options.find((o) => o.id === id)).find((o) => o?.open);
      if (first) { expect(rep.post.decision).toBe(first.id); open++; }
      else { expect(['run', 'roll-out', 'throw-away']).toContain(rep.post.decision); other++; }
      // reversing his reads changes the answer only to another of his reads (or the same fallback)
      const mine = withReads(c, rep, [...rep.routine.reads].reverse());
      expect([...mine.post.reads, 'run', 'roll-out', 'throw-away']).toContain(mine.post.decision);
    }
    expect(open).toBeGreaterThan(0);
    expect(other + open).toBe(30);
  });

  it('a blitz is a linebacker or defensive back rushing by the call, never a lineman', () => {
    let seen = 0;
    for (let i = 0; i < 30; i++) {
      const rep = makeRep(c, 'jv', 7, i, true)!;
      const b = blitzers(rep.play);
      expect(rep.post.blitz).toEqual(b);
      for (const role of b) expect(rep.play.defense.players.find((d) => d.role === role)!.group).not.toBe('dl');
      if (rep.call.coverage === 'cover-0' || rep.call.coverage === 'fire-zone') { expect(b.length).toBeGreaterThan(0); seen++; }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('lets him change up to two routes, from the menu for each receiver', () => {
    const rep = makeRep(c, 'youth', 5, 0, true)!;
    const [a, b, d] = rep.play.sim.routes.map((r) => r.id);
    const pickNew = (id: string) => routeMenu(c, rep.play, id).find((r) => r !== rep.play.sim.routes.find((x) => x.id === id)!.route)!;
    const two = { [a!]: pickNew(a!), [b!]: pickNew(b!) };
    const changed = withChanges(c, rep, two);
    expect(changed.play.sim.routes.find((r) => r.id === a)!.route).toBe(two[a!]);
    expect(changed.call.overrides).toEqual(two);
    if (d) expect(buildPlay(c, { ...rep.call, overrides: { ...two, [d]: pickNew(d) } }).ok).toBe(false);
    expect(withChanges(c, rep, {})).toBe(rep);
  });

  it('grades every step and the decision', () => {
    const rep = makeRep(c, 'youth', 5, 0, true)!;
    const p = c.drills.routine.points;
    const g = grade(c, rep, rep, perfect(rep));
    expect(Object.values(g.steps).every(Boolean)).toBe(true);
    expect(g.decision).toBe('read');
    const steps = ['alignment', 'shell', 'box', 'corners', 'tells', 'threats', 'adjust', 'key', 'escape', 'drop', 'coverage', 'blitz'] as const;
    expect(g.xp).toBe(steps.reduce((s, k) => s + p[k], 0) + p.decision + p.beat_the_clock);
    const none = grade(c, rep, rep, emptyAnswers());
    expect(none.steps.shell).toBe(false);
    expect(none.steps.adjust).toBe(true);
    expect(none.decision).toBe('miss');
  });

  it('explains every step in glossary words', () => {
    const rep = makeRep(c, 'youth', 8, 1, true)!;
    const a = perfect(rep);
    const parts = explain(c, terms, rep, rep, a, grade(c, rep, rep, a));
    expect(parts.map((x) => x.title.split(':')[0])).toEqual(['Know', 'See', 'See', 'See', 'See', 'Threats', 'Plan', 'Plan', 'Plan', 'Plan', 'At the snap', 'At the snap', 'At the snap', 'At the snap', 'The ball']);
    expect(parts.every((x) => x.ok !== false)).toBe(true);
    expect(parts[1]!.lines[0]).toBe(terms.get(rep.routine.shell)!.definition);
  });

  it('keeps XP, rank and the day streak', () => {
    let p = newProgress();
    const rep = makeRep(c, 'youth', 3, 0, true)!;
    const g = grade(c, rep, rep, perfect(rep));
    p = recordRep(p, rep.call, g);
    expect(p.xp).toBe(g.xp);
    expect(p.coverages[rep.call.coverage]).toEqual([1, 1]);
    expect(p.steps.decision).toEqual([1, 1]);
    p = finishWorkout(c, p, '2026-10-25');
    p = finishWorkout(c, p, '2026-10-26');
    expect(p.streak).toBe(2);
    p = finishWorkout(c, p, '2026-10-28');
    expect(p.streak).toBe(1);
    expect(rank(c, 0).name).toBe(c.drills.ranks[0]![1]);
    expect(rank(c, 1e6).next).toBeNull();
  });
});

describe('The play call (the huddle)', () => {
  it('gives every player a glossary position and a job from the call alone', () => {
    for (let i = 0; i < 24; i++) {
      const rep = makeRep(c, 'jv', 11, i, true)!;
      const sheet = callSheet(c, rep);
      expect(sheet.rows.map((r) => r.id).sort()).toEqual(rep.play.offense.players.map((p) => p.id).sort());
      for (const r of sheet.rows) {
        expect(terms.has(r.position), r.position).toBe(true);
        expect(terms.has(r.term), r.term).toBe(true);
      }
      const qb = sheet.rows.find((r) => r.id === 'QB')!;
      expect(qb.term).toBe(rep.routine.drop);
      for (const r of sheet.rows.filter((x) => x.job === 'route')) expect(r.term).toBe(rep.play.jobs.routes.find((j) => j.id === r.id)!.route);
      for (const id of ['LT', 'LG', 'C', 'RG', 'RT']) expect(sheet.rows.find((r) => r.id === id)!.job).toBe('block');
    }
  });

  it('numbers his reads in the order of the concept progression, from 1', () => {
    for (let i = 0; i < 24; i++) {
      const rep = makeRep(c, 'youth', 12, i, true)!;
      const sheet = callSheet(c, rep);
      const concept = c.concepts.concepts.find((x) => x.id === rep.call.concept)!;
      const reads = sheet.rows.filter((r) => r.read).sort((a, b) => a.read! - b.read!);
      expect(reads.map((r) => r.read)).toEqual(reads.map((_, k) => k + 1));
      const routeOf = (r: (typeof reads)[number]) => (r.job === 'check' ? 'check-release' : r.term);
      const idx = reads.map((r) => concept.read.progression.indexOf(routeOf(r)));
      expect(idx.every((v) => v >= 0)).toBe(true);
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    }
  });
});
