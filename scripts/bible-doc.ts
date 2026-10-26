/**
 * Generates the Football Bible review material for the current batch from /content:
 *   docs/bible/batch-1.md        (the sections pasted into the Claude Doc for owner review)
 *   docs/bible/field-left-hash.svg (top-down field diagram)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadRawContent } from '../src/content/load';
import { Geometry, Glossary, Rules } from '../src/content/schemas';
import { renderFieldSvg } from '../src/diagram/fieldSvg';
import { box, fieldFrame, freeBlockingZone } from '../src/field/geometry';

const raw = loadRawContent();
const glossary = Glossary.parse(raw.glossary);
const rules = Rules.parse(raw.rules);
const geometry = Geometry.parse(raw.geometry);
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const md: string[] = [];
for (const [cat, title] of Object.entries(glossary.categories)) {
  const terms = glossary.terms.filter((t) => t.category === cat);
  md.push(`### ${title} (${terms.length})`, '', '| Term | Meaning | Also called |', '| --- | --- | --- |');
  for (const t of terms) md.push(`| **${cell(t.term)}** | ${cell(t.definition)}${t.confirm ? ` *To confirm: ${cell(t.confirm)}*` : ''} | ${cell(t.aliases.join(', '))} |`);
  md.push('');
}
md.push('---', '', '| Rule | NFHS | What it says | Penalty | What it means for Sahar | Check |', '| --- | --- | --- | --- | --- | --- |');
for (const r of rules.rules) {
  const src = r.check.sources.map((s) => `[${cell(s.title)}](${s.url})`).join('; ');
  const status = r.check.status === 'needs-confirm' ? `To confirm: ${cell(r.check.note ?? '')}` : 'Search summary';
  md.push(`| **${cell(r.title)}** | ${cell(r.nfhs_ref)}${r.nfhs_ref_seen_in_source ? '' : ' (number from memory)'} | ${cell(r.rule)} | ${cell(r.penalty ?? '')} | ${cell(r.qb_meaning)} | ${status}. ${src} |`);
}
const dir = join(ROOT, 'docs', 'bible');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'batch-1.md'), md.join('\n') + '\n');

const fr = fieldFrame(geometry, 'left_hash');
const svg = renderFieldSvg(geometry, {
  spot: 'left_hash', losOwnYardLine: 42, toGo: 6, yFrom: -8, yTo: 16,
  overlays: [{ rect: freeBlockingZone(geometry), label: 'Free-blocking zone' }, { rect: box(geometry, -2.8, 4.2), label: 'Box' }],
  marks: [
    { x: 0, y: -5, label: '4', kind: 'qb' }, { x: 4.2, y: -0.7, label: 'Y', kind: 'offense' }, { x: 9, y: -1.2, label: 'H', kind: 'offense' },
    { x: 24, y: -1.2, label: 'Z', kind: 'offense' }, { x: -12, y: -0.6, label: 'X', kind: 'offense' },
    { x: (4.2 + 9) / 2, y: 4.5, label: 'apex', kind: 'landmark' },
  ],
});
writeFileSync(join(dir, 'field-left-hash.svg'), svg + '\n');
console.log(`Wrote docs/bible/batch-1.md and docs/bible/field-left-hash.svg (sidelines at x = ${fr.leftSideline.toFixed(2)} and ${fr.rightSideline.toFixed(2)}).`);
