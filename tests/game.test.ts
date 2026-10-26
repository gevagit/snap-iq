import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { parsePlayContent } from '../src/play/content';
import { answerKey, callReviewed, finishWorkout, grade, makeRep, newProgress, rank, recordRep, rng } from '../src/game/drill';
import { explain } from '../src/game/explain';

const raw = loadRawContent();
const c = parsePlayContent(raw);
const terms = new Map((raw.glossary as { terms: { id: string; term: string; definition: string }[] }).terms.map((t) => [t.id, t]));

/** Content with every entry signed off, to test the review gate. */
function signedOff() {
  const r = structuredClone(raw) as Record<string, unknown>;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('reviewed' in o) Object.assign(o, { reviewed: true, reviewer: 'owner', reviewed_at: '2026-10-26' });
      Object.values(o).forEach(walk);
    }
  };
  walk(r);
  return parsePlayContent(r as never);
}

describe('Shell Game drill', () => {
  it('uses only signed-off content unless playtest is on (CLAUDE.md review gate)', () => {
    expect(makeRep(c, 'youth', 1, 0, false)).toBeNull();
    const rep = makeRep(c, 'youth', 1, 0, true)!;
    expect(rep.reviewed).toBe(false);
    const ok = makeRep(signedOff(), 'youth', 1, 0, false)!;
    expect(ok.reviewed).toBe(true);
    expect(callReviewed(signedOff(), ok.call)).toBe(true);
  });

  it('is deterministic: the same seed gives the same workout', () => {
    for (let i = 0; i < 8; i++) {
      const a = makeRep(c, 'jv', 42, i, true)!;
      const b = makeRep(c, 'jv', 42, i, true)!;
      expect(a.call).toEqual(b.call);
      expect(a.key).toEqual(b.key);
    }
    expect(rng(7)()).toBe(rng(7)());
  });

  it('builds youth reps from youth content only, every one a legitimate play with an answer', () => {
    const tier = c.drills.shell_game.tiers.youth;
    for (let i = 0; i < 24; i++) {
      const rep = makeRep(c, 'youth', 2026, i, true)!;
      expect(tier.coverages).toContain(rep.call.coverage);
      expect(tier.fronts).toContain(rep.call.front);
      expect(rep.play.checks.every((ch) => ch.ok)).toBe(true);
      expect(tier.answers.shell).toContain(rep.key.shell);
      expect(tier.answers.coverage).toContain(rep.key.coverage);
      expect(rep.key.options.map((o) => o.id)).toContain(rep.key.throwTo);
      expect(rep.start).toBeLessThan(0);
    }
  });

  it('the answer is the first open receiver in his progression', () => {
    let checked = 0;
    for (let i = 0; i < 30; i++) {
      const rep = makeRep(c, 'jv', 99, i, true)!;
      const k = answerKey(c, rep.play, rep.decision);
      const first = k.options.find((o) => o.open);
      if (first) { expect(k.throwTo).toBe(first.id); checked++; }
      else expect(k.options.find((o) => o.id === k.throwTo)!.separation).toBe(Math.max(...k.options.map((o) => o.separation)));
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('grades shell, coverage and throw, with part credit for another open receiver', () => {
    const rep = makeRep(c, 'youth', 5, 0, true)!;
    const s = c.drills.scoring;
    const perfect = grade(c, rep.key, { shell: rep.key.shell, coverage: rep.key.coverage, throwTo: rep.key.throwTo });
    expect(perfect).toEqual({ shell: true, coverage: true, throw: 'read', xp: s.shell + s.coverage + s.throw });
    const other = rep.key.options.find((o) => o.id !== rep.key.throwTo && o.open);
    if (other) expect(grade(c, rep.key, { shell: null, coverage: null, throwTo: other.id }).throw).toBe('open');
    expect(grade(c, rep.key, { shell: 'zero-high', coverage: null, throwTo: null }).xp).toBe(rep.key.shell === 'zero-high' ? s.shell : 0);
  });

  it('explains the rep in glossary words', () => {
    const rep = makeRep(c, 'youth', 8, 1, true)!;
    const a = { shell: rep.key.shell, coverage: 'cover-0', throwTo: rep.key.throwTo };
    const parts = explain(c, terms, rep, a, grade(c, rep.key, a));
    expect(parts).toHaveLength(3);
    expect(parts[0]!.lines[0]).toBe(terms.get(rep.key.shell)!.definition);
    expect(parts[2]!.lines.join(' ')).toContain(`The ball goes to ${rep.key.throwTo}`);
  });

  it('keeps XP, rank and the day streak', () => {
    let p = newProgress();
    const rep = makeRep(c, 'youth', 3, 0, true)!;
    p = recordRep(p, rep.call, { shell: true, coverage: true, throw: 'read', xp: 40 });
    expect(p.xp).toBe(40);
    expect(p.concepts[rep.call.concept]).toEqual([1, 1]);
    p = finishWorkout(c, p, '2026-10-25');
    p = finishWorkout(c, p, '2026-10-26');
    expect(p.streak).toBe(2);
    p = finishWorkout(c, p, '2026-10-28');
    expect(p.streak).toBe(1);
    expect(rank(c, 0).name).toBe(c.drills.ranks[0]![1]);
    expect(rank(c, 1e6).next).toBeNull();
  });
});
