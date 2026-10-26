import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { ROOT, loadRawContent } from '../src/content/load';

/**
 * Builds the Play Lab: one self-contained page with the play engine and all content inlined, for reviewing
 * batch 2 by eye. Writes dist/play-lab.html (a full page) and dist/play-lab.fragment.html (page content only,
 * for publishing as an artifact, which adds its own document skeleton).
 */
const raw = loadRawContent();
const result = await build({
  entryPoints: [join(ROOT, 'src/lab/entry.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'SnapLab',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  write: false,
  plugins: [
    {
      name: 'content',
      setup(b) {
        b.onResolve({ filter: /^virtual:content$/ }, () => ({ path: 'content', namespace: 'virtual' }));
        b.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({ contents: JSON.stringify(raw), loader: 'json' }));
      },
    },
  ],
});
const engine = result.outputFiles[0]!.text.replace(/<\/script/gi, '<\\/script');
const template = readFileSync(join(ROOT, 'src/lab/play-lab.html'), 'utf8');
const fragment = template.replace('/*__ENGINE__*/', () => engine);
mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/play-lab.fragment.html'), fragment);
writeFileSync(
  join(ROOT, 'dist/play-lab.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${fragment}\n</body>\n</html>\n`,
);
console.log(`Play Lab: dist/play-lab.html (${(fragment.length / 1024).toFixed(0)} KB)`);
