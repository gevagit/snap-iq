import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { build } from 'esbuild';
import { ROOT, loadRawContent } from '../src/content/load';

/** Builds the game into dist/game: a static, installable web app (Netlify publishes this folder). */
const out = join(ROOT, 'dist/game');
mkdirSync(join(out, 'icons'), { recursive: true });
const raw = loadRawContent();
const result = await build({
  entryPoints: [join(ROOT, 'src/game/main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020', 'safari15'], // a 2020 iPad runs iPadOS 15 or later
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
const app = result.outputFiles[0]!.text;
writeFileSync(join(out, 'app.js'), app);
const version = createHash('sha1').update(app).update(readFileSync(join(ROOT, 'src/game/index.html'))).digest('hex').slice(0, 10);
copyFileSync(join(ROOT, 'src/game/index.html'), join(out, 'index.html'));
copyFileSync(join(ROOT, 'src/game/manifest.webmanifest'), join(out, 'manifest.webmanifest'));
writeFileSync(join(out, 'sw.js'), readFileSync(join(ROOT, 'src/game/sw.js'), 'utf8').replace('__VERSION__', `snapiq-${version}`));
for (const f of readdirSync(join(ROOT, 'assets/icons'))) copyFileSync(join(ROOT, 'assets/icons', f), join(out, 'icons', f));
// the same game as one self-contained page (published as an artifact for playtesting before Netlify is set up)
const html = readFileSync(join(ROOT, 'src/game/index.html'), 'utf8');
const head = html
  .slice(html.indexOf('<title>'), html.indexOf('</head>'))
  .replace(/<link rel="(manifest|apple-touch-icon|icon)"[^>]*>\n/g, '')
  .replace(/<meta name="(theme-color|apple-[^"]*)"[^>]*>\n/g, '');
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace('<script src="app.js"></script>', () => `<script>${app.replace(/<\/script/gi, '<\\/script')}</script>`);
writeFileSync(join(ROOT, 'dist/snap-iq-game.html'), `${head}\n${body}`);
console.log(`Game: dist/game (app.js ${(app.length / 1024).toFixed(0)} KB, version ${version})`);
