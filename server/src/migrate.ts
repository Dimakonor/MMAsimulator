import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())`;
for (const f of files) {
  const [done] = await sql`select 1 from schema_migrations where name = ${f}`;
  if (done) continue;
  const body = await readFile(path.join(dir, f), 'utf8');
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`insert into schema_migrations (name) values (${f})`;
  });
  console.log('applied', f);
}
await sql.end();
