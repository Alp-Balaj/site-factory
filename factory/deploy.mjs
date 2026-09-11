// Usage: npm run deploy -- <slug> [--domain restorant-x.com]
// Requires: npm i -g wrangler ; wrangler login (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in .env)
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const [slug, ...rest] = process.argv.slice(2);
if (!slug || !fs.existsSync(`clients/${slug}/build`)) { console.error('usage: deploy <slug>  (run build first)'); process.exit(1); }
const project = `sf-${slug}`.slice(0, 58);
const run = (args) => spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit', shell: true, env: process.env });
run(['pages', 'project', 'create', project, '--production-branch', 'main']); // no-op if exists
const r = run(['pages', 'deploy', `clients/${slug}/build`, '--project-name', project, '--branch', 'main', '--commit-dirty=true']);
if (r.status !== 0) process.exit(r.status);
console.log(`\nLive at https://${project}.pages.dev`);
const domain = rest[rest.indexOf('--domain') + 1];
if (rest.includes('--domain') && domain) {
  console.log(`Custom domain: add ${domain} in Cloudflare Pages -> ${project} -> Custom domains (needs the zone on the same account).`);
}
