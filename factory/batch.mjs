// Usage: npm run demo:batch -- [--limit N] [--dry-run]
// The generate-all job: one generate job for every Place that is `found` and has no real website
// (state.flags.hasRealWebsite false), oldest folder first, up to --limit. No deploy: demos are shown, not published.
// As a job (node factory/jobs/run.mjs generate-all --limit 5) it only queues; the CLI below also waits for the queue
// to drain and exits 1 when any generate failed. --dry-run lists what would be queued and writes nothing.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { current, events, queued, runJob, whenDone } from './lib/jobs.mjs';
import { listPlaces } from './lib/paths.mjs';
import { readState } from './lib/state.mjs';

// Slugs generate-all would pick: found, no real website, not a fixture.
export function candidates({ limit = Infinity } = {}) {
  const out = [];
  for (const slug of listPlaces()) {
    const s = readState(slug);
    if (!s || s.status !== 'found' || s.flags?.hasRealWebsite || s.flags?.fixture) continue;
    out.push(slug);
  }
  return out.slice(0, limit);
}

export async function run(ctx) {
  const limit = Number.isInteger(ctx.params.limit) && ctx.params.limit > 0 ? ctx.params.limit : Infinity;
  const dryRun = ctx.params.dryRun === true || ctx.params['dry-run'] === true;
  const todo = candidates({ limit });
  const all = listPlaces().length;
  ctx.log(`${all} Place(s), ${todo.length} to generate (found, no real website${limit !== Infinity ? `, limit ${limit}` : ''})${dryRun ? ' (dry run, nothing queued)' : ''}`);
  const jobs = [];
  for (const slug of todo) {
    if (dryRun) { ctx.log(`[dry-run] ${slug}: would queue generate (then build and qa)`); continue; }
    const job = ctx.enqueue('generate', { slug, params: {} });
    ctx.log(`queued generate ${job.id} for ${slug}`);
    jobs.push(job.id);
  }
  return { candidates: todo, jobs, dryRun };
}

// Resolves once nothing is running or queued (the generate jobs and their chained build/qa).
function whenIdle() {
  return new Promise(resolve => {
    const check = () => { if (!current() && !queued().length) { events.off('change', check); resolve(); } };
    events.on('change', check);
    setImmediate(check);
  });
}

function parseArgs(argv) {
  const params = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') params.dryRun = true;
    else if (a === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--limit needs a positive integer');
      params.limit = n;
    } else throw new Error(`unknown option: ${a} (usage: demo:batch [--limit N] [--dry-run])`);
  }
  return params;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let params;
  try { params = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
  events.on('log', ({ line }) => console.log(line));
  let job;
  try { job = await runJob('generate-all', { params }); } catch (e) { console.error(`-> failed: ${e.message}`); process.exit(1); }
  const ids = job.result?.jobs ?? [];
  const results = await Promise.all(ids.map(whenDone));
  await whenIdle();
  const failed = results.filter(j => j.status !== 'done');
  if (job.result?.dryRun) console.log(`dry run: would generate ${job.result.candidates.length} Place(s), nothing written`);
  else console.log(`done: ${results.length} generated, ${failed.length} failed${failed.length ? ` (${failed.map(j => `${j.slug}: ${j.error}`).join('; ')})` : ''}`);
  process.exit(failed.length ? 1 : 0);
}
