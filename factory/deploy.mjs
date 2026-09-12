// Usage: npm run deploy -- <slug> [--domain restorant-x.com]
// Requires: npm i -g wrangler ; wrangler login (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in .env)
// The deploy job (factory/jobs/index.mjs) calls deploy() with a job logger; batch.mjs awaits it directly.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDir } from './lib/paths.mjs';
import { run } from './lib/proc.mjs';

export const projectName = (slug) => `sf-${slug}`.slice(0, 58);
export const pagesUrl = (slug) => `https://${projectName(slug)}.pages.dev`;

// Deploys places/<slug>/build to Cloudflare Pages. Throws with a plain message on failure; returns the pages.dev URL.
export async function deploy(slug, { log = console.log } = {}) {
  const dir = buildDir(slug);
  if (!slug || !fs.existsSync(dir)) throw new Error(`${dir} not found (run: npm run build -- ${slug})`);
  const project = projectName(slug);
  const wrangler = (args) => run('npx', ['wrangler', ...args], { env: process.env, log });
  await wrangler(['pages', 'project', 'create', project, '--production-branch', 'main']); // no-op if exists
  const code = await wrangler(['pages', 'deploy', dir, '--project-name', project, '--branch', 'main', '--commit-dirty=true']);
  if (code !== 0) throw new Error(`wrangler pages deploy failed for ${slug} (exit ${code})`);
  return pagesUrl(slug);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [slug, ...rest] = process.argv.slice(2);
  if (!slug) { console.error('usage: deploy <slug> [--domain x.com]  (run build first)'); process.exit(1); }
  let url;
  try { url = await deploy(slug); } catch (e) { console.error(e.message); process.exit(1); }
  console.log(`\nLive at ${url}`);
  const domain = rest[rest.indexOf('--domain') + 1];
  if (rest.includes('--domain') && domain) {
    console.log(`Custom domain: add ${domain} in Cloudflare Pages -> ${projectName(slug)} -> Custom domains (needs the zone on the same account).`);
  }
}
