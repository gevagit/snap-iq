import type { ZodType } from 'zod';
import { Geometry, Glossary, Rules } from '../content/schemas';
import type { ContentKey } from '../content/load';
import { type Batch2Counts, validateBatch2 } from './batch2';

export interface Report {
  errors: string[];
  counts: { terms: number; rules: number; landmarks: number; needsReview: number; toConfirm: number; batch1NeedsReview: number; batch2: Batch2Counts };
}

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
/** Text fields must end as a sentence; an unquoted " #" in YAML silently cuts a value short. */
const fullSentence = (s: string) => /[.?!)"]$/.test(s.trim());

function parse<T>(schema: ZodType<T>, data: unknown, file: string, errors: string[]): T | null {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  for (const issue of r.error.issues) errors.push(`${file}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  return null;
}

/** Football invariants for the content files (PRD §6.11 grows with each batch); plays are checked in ./plays. */
export function validateContent(raw: Record<ContentKey, unknown>): Report {
  const errors: string[] = [];
  const glossary = parse(Glossary, raw.glossary, 'glossary.yaml', errors);
  const rules = parse(Rules, raw.rules, 'rules/nfhs.yaml', errors);
  const geometry = parse(Geometry, raw.geometry, 'field/geometry.yaml', errors);

  const termIds = new Set<string>();
  if (glossary) {
    const names = new Map<string, string>();
    const claim = (word: string, owner: string, what: string) => {
      const key = word.trim().toLowerCase();
      const prev = names.get(key);
      if (prev && prev !== owner) errors.push(`glossary.yaml: ${what} "${word}" of ${owner} is already used by ${prev}`);
      else names.set(key, owner);
    };
    for (const t of glossary.terms) {
      if (termIds.has(t.id)) errors.push(`glossary.yaml: duplicate id ${t.id}`);
      termIds.add(t.id);
      if (!(t.category in glossary.categories)) errors.push(`glossary.yaml: ${t.id} uses undeclared category ${t.category}`);
      claim(t.term, t.id, 'term');
      for (const a of t.aliases) claim(a, t.id, 'alias');
    }
    for (const t of glossary.terms) {
      for (const s of t.see ?? []) if (!termIds.has(s)) errors.push(`glossary.yaml: ${t.id} refers to unknown term ${s}`);
      for (const [field, text] of [['definition', t.definition], ['confirm', t.confirm]] as const)
        if (text && !fullSentence(text)) errors.push(`glossary.yaml: ${t.id} ${field} does not end as a sentence (cut off by a YAML comment?)`);
    }
  }

  if (rules) {
    const ids = new Set<string>();
    for (const r of rules.rules) {
      if (ids.has(r.id)) errors.push(`rules/nfhs.yaml: duplicate id ${r.id}`);
      ids.add(r.id);
      if (glossary) for (const t of r.terms) if (!termIds.has(t)) errors.push(`rules/nfhs.yaml: ${r.id} uses term ${t}, which is not in the glossary`);
      for (const [field, text] of [['rule', r.rule], ['qb_meaning', r.qb_meaning], ['penalty', r.penalty], ['note', r.check.note]] as const)
        if (text && !fullSentence(text)) errors.push(`rules/nfhs.yaml: ${r.id} ${field} does not end as a sentence (cut off by a YAML comment?)`);
    }
  }

  if (geometry) {
    const f = geometry.field;
    const spots = geometry.ball_spots;
    if (!near(f.width, 160 / 3)) errors.push('field/geometry.yaml: field width must be 160 ft (53.33 yd)');
    if (!near(f.hash_from_sideline, 160 / 9)) errors.push('field/geometry.yaml: NFHS hashes are 53 ft 4 in (17.78 yd) from each sideline');
    if (!near(f.width - 2 * f.hash_from_sideline, f.width / 3)) errors.push('field/geometry.yaml: NFHS hashes split the field into thirds (53 ft 4 in apart)');
    if (f.numbers.top_from_sideline >= f.hash_from_sideline) errors.push('field/geometry.yaml: numbers must sit outside the hashes');
    if (!near(spots.left_hash.x_from_left_sideline, f.hash_from_sideline)) errors.push('field/geometry.yaml: left_hash must sit on the left hash');
    if (!near(spots.middle.x_from_left_sideline, f.width / 2)) errors.push('field/geometry.yaml: middle must be the centre of the field');
    if (!near(spots.right_hash.x_from_left_sideline, f.width - f.hash_from_sideline)) errors.push('field/geometry.yaml: right_hash must sit on the right hash');
    for (const id of ['free-blocking-zone', 'box', 'apex', 'receiver-numbering'])
      if (!geometry.landmarks.some((l) => l.id === id)) errors.push(`field/geometry.yaml: landmark ${id} is missing`);
  }

  const batch2 = validateBatch2(raw, errors);
  const batch1 = [
    ...(glossary?.terms.filter((t) => (t.batch ?? 1) === 1) ?? []),
    ...(rules?.rules ?? []),
    ...(geometry ? [geometry.field, geometry.ball_spots, ...geometry.landmarks] : []),
  ];
  const entries = [
    ...(glossary?.terms ?? []),
    ...(rules?.rules ?? []),
    ...(geometry ? [geometry.field, geometry.ball_spots, ...geometry.landmarks] : []),
  ];
  const toConfirm =
    (glossary?.terms.filter((t) => t.confirm).length ?? 0) +
    (rules?.rules.filter((r) => r.check.status === 'needs-confirm').length ?? 0) +
    (geometry ? geometry.landmarks.filter((l) => l.confirm).length + (geometry.field.numbers.confirm ? 1 : 0) : 0);
  return {
    errors,
    counts: {
      terms: glossary?.terms.length ?? 0,
      rules: rules?.rules.length ?? 0,
      landmarks: geometry?.landmarks.length ?? 0,
      needsReview: entries.filter((e) => !e.reviewed).length + batch2.needsReview,
      toConfirm,
      batch1NeedsReview: batch1.filter((e) => !e.reviewed).length,
      batch2,
    },
  };
}
