// Usage: npm run build -- <slug>        -> places/<slug>/build/  (+ preview-mobile.png / preview-desktop.png)
// Runs the verify.mjs config checks first (fails fast before astro), astro build, copies the local photo store into the
// build when the config points at it, then screenshots.
// The build job (factory/jobs/index.mjs) calls build() with a job logger so astro's output streams into the job log.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDir, configPath, placeDir } from './lib/paths.mjs';
import { run } from './lib/proc.mjs';
import { checkConfig, loadConfig, reportChecks, takeScreenshots } from './verify.mjs';

// Photo paths in a config that point at the local store (photos.json with store "local" writes "photos/<file>").
export function localPhotoPaths(config) {
  const srcOf = (p) => (typeof p === 'string' ? p : p?.src) ?? '';
  const all = [srcOf(config?.hero?.image), ...(Array.isArray(config?.gallery) ? config.gallery.map(srcOf) : [])];
  return [...new Set(all.filter(s => /^photos\/[^/]+$/.test(s)))];
}

// Without R2 the pool URLs are relative to places/<slug>/, so the referenced files are copied next to index.html
// (places/<slug>/build/photos/). Only what the page uses goes in; originals stay out. Returns the copied paths.
export function copyLocalPhotos(slug, config, { log = console.log } = {}) {
  const wanted = localPhotoPaths(config);
  if (!wanted.length) return [];
  const copied = [];
  for (const rel of wanted) {
    const from = path.join(placeDir(slug), rel);
    if (!fs.existsSync(from)) { log(`photo missing in the local store, not copied: ${from}`); continue; }
    const to = path.join(buildDir(slug), rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.push(rel);
  }
  log(`copied ${copied.length} of ${wanted.length} local photo(s) into the build`);
  return copied;
}

// Throws with a plain message on any failure. Returns the build directory.
export async function build(slug, { screenshots = true, log = console.log } = {}) {
  const config = loadConfig(slug); // throws if places/<slug>/config.json is missing
  const result = checkConfig(config);
  if (!reportChecks(result, log)) throw new Error(`${configPath(slug)}: ${result.errors.length} problem(s), fix them before building`);

  const outDir = path.resolve(buildDir(slug));
  const code = await run('npx', ['astro', 'build', '--outDir', outDir], { cwd: 'template', env: { ...process.env, CLIENT: slug }, log });
  if (code !== 0) throw new Error(`astro build failed for ${slug} (exit ${code})`);
  copyLocalPhotos(slug, config, { log });

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
