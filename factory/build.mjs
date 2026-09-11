// Usage: npm run build -- <slug>        -> clients/<slug>/build/
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const slug = process.argv[2];
if (!slug || !fs.existsSync(`clients/${slug}/config.json`)) { console.error('usage: build <slug> (clients/<slug>/config.json must exist)'); process.exit(1); }
const outDir = path.resolve(`clients/${slug}/build`);
const r = spawnSync('npx', ['astro', 'build', '--outDir', outDir], {
  cwd: 'template', stdio: 'inherit', shell: true,
  env: { ...process.env, CLIENT: slug },
});
process.exit(r.status ?? 1);
