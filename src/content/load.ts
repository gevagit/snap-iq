import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/** Repository root, found from this file's location (src/content). */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const CONTENT_FILES = {
  glossary: 'content/glossary.yaml',
  rules: 'content/rules/nfhs.yaml',
  geometry: 'content/field/geometry.yaml',
  personnel: 'content/offense/personnel.yaml',
  formations: 'content/offense/formations.yaml',
  motions: 'content/offense/motions.yaml',
  routes: 'content/offense/routes.yaml',
  concepts: 'content/offense/concepts.yaml',
  protections: 'content/offense/protections.yaml',
  fronts: 'content/defense/fronts.yaml',
  coverages: 'content/defense/coverages.yaml',
  speeds: 'content/tuning/speeds.yaml',
  drills: 'content/tuning/drills.yaml',
  adjustments: 'content/offense/adjustments.yaml',
  quarterback: 'content/offense/quarterback.yaml',
  pocket: 'content/pocket/rules.yaml',
} as const;
export type ContentKey = keyof typeof CONTENT_FILES;

/** Raw parsed YAML for every content file; validation happens in src/validate. */
export function loadRawContent(root: string = ROOT): Record<ContentKey, unknown> {
  const read = (rel: string) => parse(readFileSync(join(root, rel), 'utf8')) as unknown;
  const out = {} as Record<ContentKey, unknown>;
  for (const key of Object.keys(CONTENT_FILES) as ContentKey[]) out[key] = read(CONTENT_FILES[key]);
  return out;
}
