// Usage: npm run deploy -- <slug> [--domain restorant-x.com]
// Requires: npm i -g wrangler ; wrangler login (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in .env)
// batch.mjs imports deploy() from here.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectName = (slug) => `sf-${slug}`.slice(0, 58);
export const pagesUrl = (slug) => `https://${projectName(slug)}.pages.dev`;

// Deploys clients/<slug>/build to Cloudflare Pages. Throws with a plain message on failure; returns the pages.dev URL.
export function deploy(slug) {
  const dir = path.join('clients', slug, 'build');
  if (!slug || !fs.existsSync(dir)) throw new Error(`${dir} not found (run: npm run build -- ${slug})`);
  const project = projectName(slug);
  const run = (args) => spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit', shell: true, env: process.env });
  run(['pages', 'project', 'create', project, '--production-branch', 'main']); // no-op if exists
  const r = run(['pages', 'deploy', dir, '--project-name', project, '--branch', 'main', '--commit-dirty=true']);
  if (r.status !== 0) throw new Error(`wrangler pages deploy failed for ${slug} (exit ${r.status ?? 'signal'})`);
  return pagesUrl(slug);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [slug, ...rest] = process.argv.slice(2);
  if (!slug) { console.error('usage: deploy <slug> [--domain x.com]  (run build first)'); process.exit(1); }
  let url;
  try { url = deploy(slug); } catch (e) { console.error(e.message); process.exit(1); }
  console.log(`\nLive at ${url}`);
  const domain = rest[rest.indexOf('--domain') + 1];
  if (rest.includes('--domain') && domain) {
    console.log(`Custom domain: add ${domain} in Cloudflare Pages -> ${projectName(slug)} -> Custom domains (needs the zone on the same account).`);
  }
}
