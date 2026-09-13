// The job queue: in-process, one worker, FIFO. Generation, QA, build, deploy and lead search all run through it, from
// the Portal or from the CLI (factory/jobs/run.mjs). Job types live in factory/jobs/index.mjs; each exports run(ctx).
//
//   enqueue(type, { slug, params }) -> job record   { id, type, slug, params, status, createdAt, startedAt, endedAt, error, logPath }
//   list({ slug })                  -> job[]        records on disk (plus whatever is queued or running)
//   whenDone(id)                    -> Promise<job> resolves when the job ends, whatever the outcome
//   whenIdle()                      -> Promise<void> resolves once nothing is running or queued (chained jobs included)
//   events.on('log', ({ id, line }) => …)  every log line, as written to the .log file
//   events.on('change', job => …)          queued -> running -> done | failed
//
// Records are places/<slug>/jobs/<id>.json (committed), logs places/<slug>/jobs/<id>.log (gitignored); without a slug
// both go under jobs/ at the repo root. A thrown error marks the job failed and, when params.markPlaceFailed is true,
// moves the Place to failed (only from a status the table allows).
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { commit } from './git.mjs';
import { configPath, jobsDir, listPlaces, placePath, readJson, writeJson } from './paths.mjs';
import { canTransition, readState, transition, updateState } from './state.mjs';

export const events = new EventEmitter();
events.setMaxListeners(100);

const queue = [];        // job records waiting
const live = new Map();  // id -> job record (queued or running)
const waiters = new Map(); // id -> [resolve]
let running = null;
let registryPromise = null;

const loadRegistry = () => (registryPromise ??= import('../jobs/index.mjs').then(m => m.jobs));

// Job types the registry knows. Async because the registry is imported lazily (it imports build/deploy).
export async function registeredTypes() { return Object.keys(await loadRegistry()); }
export async function isRegistered(type) { return type in (await loadRegistry()); }

function newId(type) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${type}-${rand}`;
}

const recordPath = (job) => path.join(jobsDir(job.slug), `${job.id}.json`);

function save(job) {
  writeJson(recordPath(job), job);
  events.emit('change', { ...job });
}

export function enqueue(type, { slug = null, params = {} } = {}) {
  if (!type) throw new Error('enqueue: job type is required');
  const job = {
    id: newId(type), type, slug, params,
    status: 'queued', createdAt: new Date().toISOString(), startedAt: null, endedAt: null, error: null, logPath: null,
  };
  job.logPath = path.join(jobsDir(slug), `${job.id}.log`);
  fs.mkdirSync(jobsDir(slug), { recursive: true });
  save(job);
  queue.push(job);
  live.set(job.id, job);
  setImmediate(work);
  return { ...job };
}
export function whenDone(id) {
  const job = live.get(id);
  if (!job) {
    const found = findRecord(id);
    if (found) return Promise.resolve(found);
    return Promise.reject(new Error(`job ${id} not found`));
  }
  return new Promise(resolve => { waiters.set(id, [...(waiters.get(id) ?? []), resolve]); });
}

function settle(job) {
  live.delete(job.id);
  for (const resolve of waiters.get(job.id) ?? []) resolve({ ...job });
  waiters.delete(job.id);
}

export const current = () => (running ? { ...running } : null);
export const queued = () => queue.map(j => ({ ...j }));

// Resolves once nothing is running or queued: a job's chained jobs (photos -> generate -> build -> qa) included.
export function whenIdle() {
  return new Promise(resolve => {
    const check = () => { if (!running && !queue.length) { events.off('change', check); resolve(); } };
    events.on('change', check);
    setImmediate(check);
  });
}

// Records on disk for one Place, or every Place plus the root jobs/ folder, newest first.
export function list({ slug } = {}) {
  const dirs = slug !== undefined ? [jobsDir(slug)] : allJobDirs();
  const out = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) out.push(readJson(path.join(dir, f)));
  }
  return out.filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

const allJobDirs = () => [jobsDir(null), ...listPlaces().map(jobsDir)];

function findRecord(id) {
  return list().find(j => j.id === id) ?? null;
}

function appendLog(job, line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  fs.appendFileSync(job.logPath, stamped + '\n');
  events.emit('log', { id: job.id, slug: job.slug, line: stamped });
}

// What a job sees: files of its Place (may be null), a logger, and the state and queue helpers from the contract.
function makeContext(job) {
  const slug = job.slug;
  const log = (line) => appendLog(job, String(line));
  return {
    id: job.id, slug, params: job.params,
    place: slug ? readJson(placePath(slug), null) : null,
    state: slug ? readState(slug) : null,
    config: slug ? readJson(configPath(slug), null) : null,
    log,
    setStatus(to, reason) {
      if (!slug) throw new Error('setStatus needs a Place');
      const state = transition(slug, to, reason ?? `job ${job.type} ${job.id}`);
      this.state = state;
      log(`status -> ${to}${reason ? ` (${reason})` : ''}`);
      return state;
    },
    writeState(patch) {
      if (!slug) throw new Error('writeState needs a Place');
      this.state = updateState(slug, patch, `state(${slug}): ${job.type}`);
      return this.state;
    },
    writeConfig(patch) {
      if (!slug) throw new Error('writeConfig needs a Place');
      const next = { ...(readJson(configPath(slug), {}) ?? {}), ...patch };
      writeJson(configPath(slug), next);
      commit([configPath(slug)], `config(${slug}): ${job.type}`);
      this.config = next;
      return next;
    },
    enqueue: (type, opts) => enqueue(type, opts),
    reloadState() { this.state = slug ? readState(slug) : null; return this.state; },
  };
}

async function work() {
  if (running || !queue.length) return;
  const job = queue.shift();
  running = job;
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  save(job);
  appendLog(job, `start ${job.type}${job.slug ? ` ${job.slug}` : ''}${Object.keys(job.params).length ? ` ${JSON.stringify(job.params)}` : ''}`);
  const ctx = makeContext(job);
  try {
    const registry = await loadRegistry();
    const def = registry[job.type];
    if (!def) throw new Error(`job "${job.type}" is not registered (known: ${Object.keys(registry).join(', ')})`);
    if (typeof def.run !== 'function') throw new Error(`job "${job.type}" has no run(ctx)`);
    const result = await def.run(ctx);
    job.status = 'done';
    if (result !== undefined) job.result = result;
    appendLog(job, 'done');
  } catch (e) {
    job.status = 'failed';
    job.error = e?.message ?? String(e);
    appendLog(job, `failed: ${job.error}`);
    if (job.params?.markPlaceFailed && job.slug) markPlaceFailed(job, ctx);
  } finally {
    job.endedAt = new Date().toISOString();
    save(job);
    commit([recordPath(job)], `job(${job.slug ?? 'root'}): ${job.type} ${job.status}`);
    running = null;
    settle(job);
    setImmediate(work);
  }
}

function markPlaceFailed(job, ctx) {
  try {
    const state = readState(job.slug);
    if (!state) return;
    if (canTransition(state.status, 'failed')) transition(job.slug, 'failed', `${job.type}: ${job.error}`);
    else ctx.log(`place stays ${state.status} (failed is not reachable from there)`);
  } catch (e) { ctx.log(`could not mark the place failed: ${e.message}`); }
}

// Convenience for CLIs: enqueue and wait. Resolves with the finished record; rejects when it failed.
export async function runJob(type, opts) {
  const job = enqueue(type, opts);
  const done = await whenDone(job.id);
  if (done.status !== 'done') throw Object.assign(new Error(done.error ?? `job ${type} ${done.status}`), { job: done });
  return done;
}
