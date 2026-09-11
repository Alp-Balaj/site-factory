// Usage: npm run demo:batch -- <leads.json> [--limit N] [--dry-run] [--no-deploy]
// For every lead with status "new": demo (Claude copy -> clients/<slug>/config.json), build, deploy.
// Writes status/slug/demo_url/error back into the leads file after EACH lead, so a crash loses nothing.
// Statuses written: demo_deployed | demo_built (--no-deploy) | failed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDemo, slugify } from './demo.mjs';
import { build } from './build.mjs';
import { deploy, pagesUrl } from './deploy.mjs';

function parseArgs(argv) {
  const [leadsFile, ...rest] = argv;
  const flags = { dryRun: rest.includes('--dry-run'), noDeploy: rest.includes('--no-deploy'), limit: Infinity };
  if (rest.includes('--limit')) {
    const n = Number(rest[rest.indexOf('--limit') + 1]);
    if (!Number.isInteger(n) || n < 1) throw new Error('--limit needs a positive integer');
    flags.limit = n;
  }
  const unknown = rest.filter((a, i) => a.startsWith('--') && !['--dry-run', '--no-deploy', '--limit'].includes(a) && !(rest[i - 1] === '--limit'));
  if (unknown.length) throw new Error(`unknown option(s): ${unknown.join(' ')}`);
  return { leadsFile, ...flags };
}

function loadLeads(leadsFile) {
  if (!leadsFile) throw new Error('usage: demo:batch <leads.json> [--limit N] [--dry-run] [--no-deploy]');
  if (!fs.existsSync(leadsFile)) throw new Error(`${leadsFile} not found`);
  let data;
  try { data = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); } catch (e) { throw new Error(`${leadsFile} is not valid JSON: ${e.message}`); }
  if (!Array.isArray(data)) {
    const shape = data && typeof data === 'object' ? `an object with keys: ${Object.keys(data).slice(0, 8).join(', ')}` : `a ${typeof data}`;
    throw new Error(`${leadsFile} is not a leads file: expected a JSON array of lead objects (as written by leads:api / leads:scrape), got ${shape}`);
  }
  const bad = data.findIndex(l => !l || typeof l !== 'object' || Array.isArray(l));
  if (bad !== -1) throw new Error(`${leadsFile} is not a leads file: entry ${bad} is not an object`);
  return data;
}

const saveLeads = (leadsFile, leads) => fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));
const label = (lead, i) => lead.name || lead.place_id || `lead #${i}`;

export async function runBatch({ leadsFile, limit = Infinity, dryRun = false, noDeploy = false }) {
  const leads = loadLeads(leadsFile);
  const todo = leads.map((lead, i) => ({ lead, i })).filter(({ lead }) => lead.status === 'new').slice(0, limit);
  const skipped = leads.length - leads.filter(l => l.status === 'new').length;
  const totals = { demo_deployed: 0, demo_built: 0, failed: 0 };

  console.log(`${leadsFile}: ${leads.length} lead(s), ${leads.length - skipped} new, processing ${todo.length}${dryRun ? ' (dry run, nothing will be written)' : ''}`);
  if (dryRun) {
    for (const { lead, i } of todo) {
      const slug = slugify(lead.name);
      const steps = [`generate ${path.join('clients', slug || '?', 'config.json')} via Claude`, 'build'];
      steps.push(noDeploy ? `mark demo_built` : `deploy -> ${pagesUrl(slug)}`);
      console.log(`[dry-run] ${label(lead, i)} -> ${slug ? steps.join(', then ') : 'FAIL: lead has no name to derive a slug from'}`);
    }
    return { totals, processed: todo.length, skipped, dryRun: true };
  }

  for (const [n, { lead, i }] of todo.entries()) {
    const tag = `[${n + 1}/${todo.length}] ${label(lead, i)}`;
    let stage = 'demo';
    try {
      const { slug } = await generateDemo(lead);
      lead.slug = slug;
      stage = 'build';
      await build(slug);
      if (noDeploy) {
        lead.status = 'demo_built';
        delete lead.demo_url;
      } else {
        stage = 'deploy';
        lead.demo_url = deploy(slug);
        lead.status = 'demo_deployed';
      }
      delete lead.error;
      totals[lead.status]++;
      console.log(`${tag} -> ${lead.status}${lead.demo_url ? ` ${lead.demo_url}` : ` (${path.join('clients', slug, 'build')})`}`);
    } catch (e) {
      lead.status = 'failed';
      lead.error = `${stage}: ${e.message}`;
      totals.failed++;
      console.error(`${tag} -> failed at ${stage}: ${e.message}`);
    }
    saveLeads(leadsFile, leads); // after every lead, on purpose
  }

  return { totals, processed: todo.length, skipped };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let result;
  try {
    result = await runBatch(parseArgs(process.argv.slice(2)));
  } catch (e) { console.error(e.message); process.exit(1); }
  const { totals: t, processed, skipped } = result;
  if (result.dryRun) console.log(`dry run: would process ${processed} lead(s), ${skipped} skipped (status != "new"), nothing written`);
  else console.log(`done: ${processed} processed, ${t.demo_deployed} deployed, ${t.demo_built} built, ${t.failed} failed, ${skipped} skipped (status != "new")`);
  process.exit(result.dryRun || t.failed === 0 ? 0 : 1);
}
