// Сборка автономного превью без npm и бандлера (нужен Node 22.7+).
// TS -> JS через node:module.stripTypeScriptTypes, модули склеиваются через import map.
// Использование: node tools/build-preview.mjs [artDir] > preview.html
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const artDir = process.argv[2] ?? path.join(root, 'web/public/art');

const CDN = {
  preact: 'https://cdn.jsdelivr.net/npm/preact@10.24.3/dist/preact.module.js',
  'preact/hooks': 'https://cdn.jsdelivr.net/npm/preact@10.24.3/hooks/dist/hooks.module.js',
  htm: 'https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.module.js',
};

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const modules = {};
function specFor(file) {
  const rel = path.relative(root, file).replace(/\\/g, '/').replace(/\.ts$/, '');
  if (rel.startsWith('shared/src/')) return '@shared/' + rel.slice('shared/src/'.length);
  if (rel.startsWith('web/src/')) return '@web/' + rel.slice('web/src/'.length);
  throw new Error('unknown ' + rel);
}
for (const file of [...walk(path.join(root, 'shared/src')), ...walk(path.join(root, 'web/src'))]) {
  let src = readFileSync(file, 'utf8');
  src = src.replace(/^import\s+['"]\.\/styles\.css['"];?\s*$/m, '');
  let js = stripTypeScriptTypes(src);
  js = js.replace(/(from\s+|import\s+)(['"])([^'"]+)\2/g, (m, kw, q, spec) => {
    if (spec === '@mma/shared') return `${kw}${q}@shared/index${q}`;
    if (spec.startsWith('.')) {
      const abs = path.resolve(path.dirname(file), spec.replace(/\.js$/, '')) + '.ts';
      return `${kw}${q}${specFor(abs)}${q}`;
    }
    return m;
  });
  modules[specFor(file)] = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
}

const art = {};
for (const f of readdirSync(artDir).filter((f) => f.endsWith('.webp'))) {
  art[f] = 'data:image/webp;base64,' + readFileSync(path.join(artDir, f)).toString('base64');
}

const css = readFileSync(path.join(root, 'web/src/styles.css'), 'utf8');
const importmap = JSON.stringify({ imports: { ...CDN, ...modules } });

process.stdout.write(`<!doctype html>
<html lang="ru" data-theme="basement">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<title>MMA Simulator — превью</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=Press+Start+2P&family=Rubik+Mono+One&family=Rubik:wght@500;700;900&family=Oswald:wght@500;600;700&family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
<style>${css}</style>
<script>
  // Арт встроен в страницу: подменяем пути /art/x.webp на data:-URL
  window.__ART__ = ${JSON.stringify(art)};
  window.__ART_BASE__ = 'art:';
  const _set = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;
  Object.defineProperty(HTMLImageElement.prototype, 'src', { set(v) { _set.call(this, typeof v === 'string' && v.startsWith('art:') ? window.__ART__[v.slice(4)] : v); }, get() { return this.getAttribute('src'); } });
  const _sp = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (k, v, p) { if (typeof v === 'string') v = v.replace(/art:([\\w.]+)/g, (_, n) => window.__ART__[n]); return _sp.call(this, k, v, p); };
</script>
<script type="importmap">${importmap}</script>
</head>
<body>
<div id="root"></div>
<script type="module">import '@web/main';</script>
</body>
</html>`);
