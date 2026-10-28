import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { validateContent } from '../src/validate';

const clone = <T>(v: T): T => structuredClone(v);

describe('Football Bible content (batch 1)', () => {
  const raw = loadRawContent();

  it('passes every invariant', () => {
    const r = validateContent(raw);
    expect(r.errors).toEqual([]);
    expect(r.counts.terms).toBeGreaterThan(50);
    expect(r.counts.rules).toBeGreaterThan(15);
  });

  it('records the owner sign-off on batch 1 (defaults accepted)', () => {
    const r = validateContent(raw);
    const g = raw.glossary as { terms: { reviewed: boolean; reviewer?: string; batch?: number }[] };
    expect(g.terms.filter((t) => (t.batch ?? 1) === 1).every((t) => t.reviewed && t.reviewer === 'owner')).toBe(true);
    expect(r.counts.batch1NeedsReview).toBe(0);
    expect(r.counts.toConfirm).toBe(0);
  });

  it('keeps the batch 1-3 sign-off; only batch 4 (the pocket) waits for review', () => {
    const r = validateContent(raw);
    const g = raw.glossary as { terms: { reviewed: boolean; reviewer?: string; batch?: number }[] };
    expect(g.terms.filter((t) => (t.batch ?? 1) < 4).every((t) => t.reviewed && t.reviewer === 'owner')).toBe(true);
    expect(g.terms.filter((t) => t.batch === 4).every((t) => !t.reviewed)).toBe(true);
    expect((raw.pocket as { reviewed: boolean }).reviewed).toBe(false);
    expect(r.counts.batch2.needsReview).toBe(1);
  });

  it('rejects a duplicate glossary id', () => {
    const bad = clone(raw);
    const g = bad.glossary as { terms: { id: string }[] };
    g.terms.push({ ...g.terms[0]!, id: g.terms[0]!.id } as never);
    expect(validateContent(bad).errors.some((e) => e.includes('duplicate id'))).toBe(true);
  });

  it('rejects an alias that collides with another term', () => {
    const bad = clone(raw);
    const g = bad.glossary as { terms: { id: string; aliases: string[] }[] };
    g.terms.find((t) => t.id === 'sideline')!.aliases.push('End zone');
    expect(validateContent(bad).errors.some((e) => e.includes('already used by'))).toBe(true);
  });

  it('rejects a rule that uses a term missing from the glossary', () => {
    const bad = clone(raw);
    const r = bad.rules as { rules: { terms: string[] }[] };
    r.rules[0]!.terms.push('cover-9');
    expect(validateContent(bad).errors.some((e) => e.includes('not in the glossary'))).toBe(true);
  });

  it('rejects a reviewed entry with no reviewer', () => {
    const bad = clone(raw);
    const g = bad.glossary as { terms: { reviewed: boolean; reviewer?: string }[] };
    delete g.terms[0]!.reviewer;
    expect(validateContent(bad).errors.some((e) => e.includes('reviewer'))).toBe(true);
  });

  it('catches a definition cut short by a YAML comment', () => {
    const bad = clone(raw);
    const g = bad.glossary as { terms: { id: string; definition: string }[] };
    g.terms.find((t) => t.id === 'receiver-numbering')!.definition = 'Counting the receivers on each side of the ball from the sideline in -';
    expect(validateContent(bad).errors.some((e) => e.includes('does not end as a sentence'))).toBe(true);
  });

  it('rejects NFL or college hash marks', () => {
    const bad = clone(raw);
    const geo = bad.geometry as { field: { hash_from_sideline: number } };
    geo.field.hash_from_sideline = 23.583; // NFL: 70 ft 9 in from each sideline
    expect(validateContent(bad).errors.some((e) => e.includes('53 ft 4 in'))).toBe(true);
  });
});
