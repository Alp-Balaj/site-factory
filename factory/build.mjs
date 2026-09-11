// Usage: npm run build -- <slug>        -> clients/<slug>/build/  (+ preview-mobile.png / preview-desktop.png)
// Runs the verify.mjs config checks first (fails fast before astro), astro build, then screenshots.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDir, checkConfig, configPath, loadConfig, reportChecks, takeScreenshots } from './verify.mjs';

// Throws with a plain message on any failure. Returns the build directory.
export async function build(slug, { screenshots = true } = {}) {
  const config = loadConfig(slug); // throws if clients/<slug>/config.json is missing
  const result = checkConfig(config);
  if (!reportChecks(result)) throw new Error(`${configPath(slug)}: ${result.errors.length} problem(s), fix them before building`);

  const outDir = path.resolve(buildDir(slug));
  const r = spawnSync('npx', ['astro', 'build', '--outDir', outDir], {
    cwd: 'template', stdio: 'inherit', shell: true,
    env: { ...process.env, CLIENT: slug },
  });
  if (r.status !== 0) throw new Error(`astro build failed for ${slug} (exit ${r.status ?? 'signal'})`);

  if (screenshots) {
    const shots = await takeScreenshots(slug); // throws with the install command if chromium is missing
    for (const p of Object.values(shots)) console.log(`-> ${p}`);
  }
  return outDir;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const slug = process.argv[2];
  if (!slug) { console.error('usage: build <slug> (clients/<slug>/config.json must exist)'); process.exit(1); }
  try { await build(slug); } catch (e) { console.error(e.message); process.exit(1); }
}
