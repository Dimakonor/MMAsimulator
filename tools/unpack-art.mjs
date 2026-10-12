// Арт хранится в git как base64 (web/art-src/*.webp.b64), чтобы не зависеть от LFS.
// Этот скрипт раскладывает его в web/public/art/*.webp. Запускается перед dev/build.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'web/art-src');
const out = path.join(root, 'web/public/art');
mkdirSync(out, { recursive: true });
let n = 0;
for (const f of readdirSync(src).filter((f) => f.endsWith('.webp.b64'))) {
  const dst = path.join(out, f.replace(/\.b64$/, ''));
  if (existsSync(dst)) continue;
  writeFileSync(dst, Buffer.from(readFileSync(path.join(src, f), 'utf8'), 'base64'));
  n++;
}
console.log(`art: распаковано ${n} файлов в web/public/art`);
