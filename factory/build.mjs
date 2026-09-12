// Usage: npm run build -- <slug>        -> places/<slug>/build/  (+ preview-mobile.png / preview-desktop.png)
// Runs the verify.mjs config checks first (fails fast before astro), astro build, then screenshots.
// The build job (factory/jobs/index.mjs) calls build() with a job logger so astro's output streams into the job log.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDir, configPath } from './lib/paths.mjs';
import { run } from './lib/proc.mjs';
import { checkConfig, loadConfig, reportChecks, takeScreenshots } from './verify.mjs';

// Throws with a plain message on any failure. Returns the build directory.
export async function build(slug, { screenshots = true, log = console.log } = {}) {
  const config = loadConfig(slug); // throws if places/<slug>/config.json is missing
  const result = checkConfig(config);
  if (!reportChecks(result, log)) throw new Error(`${configPath(slug)}: ${result.errors.length} problem(s), fix them before building`);

  const outDir = path.resolve(buildDir(slug));
  const code = await run('npx', ['astro', 'build', '--outDir', outDir], { cwd: 'template', env: { ...process.env, CLIENT: slug }, log });
  if (code !== 0) throw new Error(`astro build failed for ${slug} (exit ${code})`);

  if (screenshots) {
    const shots = await takeScreenshots(slug); // throws with the install command if chromium is missing
    for (const p of Object.values(shots)) log(`-> ${p}`);
  }
  return outDir;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const slug = process.argv[2];
  if (!slug) { console.error('usage: build <slug> (places/<slug>/config.json must exist)'); process.exit(1); }
  try { await build(slug); } catch (e) { console.error(e.message); process.exit(1); }
}
