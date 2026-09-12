// Usage: npm run leads:api -- "restorant" "Prishtinë" [--pages 3] [--types cafe,bar] [--all]
// A thin CLI over the lead-search job (factory/jobs/lead-search.mjs): parses the arguments, runs the job in the
// foreground through the same queue the Portal uses, prints its log and exits with the job's outcome.
// Writes places/<slug>/place.json + state.json (found) per new Place and leads/out/<vertical>-<city>.json as a cache.
import 'dotenv/config';
import { events, runJob } from '../factory/lib/jobs.mjs';

const usage = 'usage: leads:api <vertical-keyword> <city> [--pages N] [--types a,b] [--all]';

export function parseArgs(argv) {
  const positional = [];
  const params = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pages') params.pages = Number(argv[++i]);
    else if (a === '--types') params.types = argv[++i] ?? '';
    else if (a === '--all') params.all = true;
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}\n${usage}`);
    else positional.push(a);
  }
  const [query, city] = positional;
  if (!query || !city || /^\d+$/.test(city)) throw new Error(usage);
  if (params.pages !== undefined && (!Number.isInteger(params.pages) || params.pages < 1)) throw new Error(usage);
  return { query, city, ...params };
}

let params;
try { params = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }

events.on('log', ({ line }) => console.log(line));
try {
  const job = await runJob('lead-search', { params });
  console.log(`-> ${job.status} ${job.id} (record: ${job.logPath.replace(/\.log$/, '.json')})`);
} catch (e) {
  console.error(`-> failed: ${e.message}`);
  process.exit(1);
}
