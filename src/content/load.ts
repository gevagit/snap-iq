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
} as const;
export type ContentKey = keyof typeof CONTENT_FILES;

/** Raw parsed YAML for every content file; validation happens in src/validate. */
export function loadRawContent(root: string = ROOT): Record<ContentKey, unknown> {
  const read = (rel: string) => parse(readFileSync(join(root, rel), 'utf8')) as unknown;
  return {
    glossary: read(CONTENT_FILES.glossary),
    rules: read(CONTENT_FILES.rules),
    geometry: read(CONTENT_FILES.geometry),
  };
}
