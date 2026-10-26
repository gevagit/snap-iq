import { loadRawContent } from '../src/content/load';
import { validateContent } from '../src/validate';

const report = validateContent(loadRawContent());
const c = report.counts;
console.log(`Content: ${c.terms} glossary terms, ${c.rules} NFHS rules, ${c.landmarks} field landmarks.`);
console.log(`Review: ${c.needsReview} entries not yet reviewed; ${c.toConfirm} items flagged for the owner or coach to confirm.`);
if (report.errors.length) {
  console.error(`\n${report.errors.length} problem(s):`);
  for (const e of report.errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('All football invariants pass.');
