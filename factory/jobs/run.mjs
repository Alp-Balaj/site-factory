// Usage: node factory/jobs/run.mjs <type> [slug] [--param key=value …] [--key value] [--no-key]
// Runs one job in the foreground through the same queue the Portal uses and prints its log, then stays until the jobs
// it chained (generate -> photos, build, qa) have run too. Exit code 1 when the job or any chained job fails.
// Examples: node factory/jobs/run.mjs noop la-tarte
//           node factory/jobs/run.mjs build la-tarte --param screenshots=false
import 'dotenv/config';
import { events, registeredTypes, runJob, whenIdle } from '../lib/jobs.mjs';

// "--param k=v", "--k=v", "--k v" and "--no-k" all land in params; "true"/"false"/numbers are typed.
export function parseArgs(argv) {
  const [type, ...rest] = argv;
  const params = {};
  let slug = null;
  const value = (v) => (v === 'true' ? true : v === 'false' ? false : v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);
  const set = (kv) => { const i = kv.indexOf('='); if (i === -1) params[kv] = true; else params[kv.slice(0, i)] = value(kv.slice(i + 1)); };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--param') set(rest[++i] ?? '');
    else if (a.startsWith('--no-')) params[a.slice(5)] = false;
    else if (a.startsWith('--')) {
      const body = a.slice(2);
      if (body.includes('=')) set(body);
      else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) params[body] = value(rest[++i]);
      else params[body] = true;
    } else if (slug === null) slug = a;
  }
  return { type, slug, params };
}

const { type, slug, params } = parseArgs(process.argv.slice(2));
if (!type) {
  console.error('usage: node factory/jobs/run.mjs <type> [slug] [--param key=value …]');
  console.error(`types: ${(await registeredTypes()).join(', ')}`);
  process.exit(1);
}
if (!(await registeredTypes()).includes(type)) {
  console.error(`job "${type}" is not registered (known: ${(await registeredTypes()).join(', ')})`);
  process.exit(1);
}

events.on('log', ({ line }) => console.log(line));
const outcomes = [];
events.on('change', job => { if (job.status === 'done' || job.status === 'failed') outcomes.push(job); });
try {
  const job = await runJob(type, { slug, params });
  console.log(`-> ${job.status} ${job.id} (record: ${job.logPath.replace(/\.log$/, '.json')})`);
} catch (e) {
  console.error(`-> failed: ${e.message}`);
  process.exit(1);
}
await whenIdle();
const chained = outcomes.slice(1);
for (const j of chained) console.log(`-> ${j.status} ${j.id}${j.error ? ` (${j.error})` : ''}`);
process.exit(chained.some(j => j.status === 'failed') ? 1 : 0);
