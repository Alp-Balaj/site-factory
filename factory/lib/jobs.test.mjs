import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enqueue, events, list, runJob, whenDone } from './jobs.mjs';
import { ensureState, readState } from './state.mjs';

let tmp, cwd;
before(() => {
  cwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-jobs-'));
  process.env.PLACES_DIR = path.join(tmp, 'places');
  delete process.env.AUTO_COMMIT;
  process.chdir(tmp); // jobs without a Place write under ./jobs
});
after(() => { delete process.env.PLACES_DIR; process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); });

test('noop runs through the queue, logs and leaves a record and a log file', async () => {
  ensureState('p1', 'found', 'test');
  const lines = [];
  const onLog = (e) => lines.push(e.line);
  events.on('log', onLog);
  const job = await runJob('noop', { slug: 'p1', params: { lines: 2, delayMs: 5 } });
  events.off('log', onLog);
  assert.equal(job.status, 'done');
  assert.ok(lines.some(l => /noop 1\/2 for p1/.test(l)));
  assert.ok(fs.existsSync(job.logPath));
  assert.ok(fs.existsSync(job.logPath.replace(/\.log$/, '.json')));
  assert.equal(list({ slug: 'p1' })[0].id, job.id);
});

test('a throwing job is failed and marks the Place failed only from a status the table allows', async () => {
  ensureState('p2', 'found', 'test');
  const failed = enqueue('noop', { slug: 'p2', params: { lines: 1, delayMs: 1, fail: 'boom', markPlaceFailed: true } });
  const done = await whenDone(failed.id);
  assert.equal(done.status, 'failed');
  assert.equal(done.error, 'boom');
  assert.equal(readState('p2').status, 'found'); // found -> failed is not in the table

  ensureState('p3', 'found', 'test');
  const { transition } = await import('./state.mjs');
  transition('p3', 'generating');
  await assert.rejects(runJob('noop', { slug: 'p3', params: { lines: 1, delayMs: 1, fail: true, markPlaceFailed: true } }), /asked to fail/);
  assert.equal(readState('p3').status, 'failed');
});

test('an unregistered type fails with the known types in the message', async () => {
  await assert.rejects(runJob('does-not-exist', { params: {} }), /not registered/);
});

test('jobs run one at a time in order', async () => {
  const order = [];
  const onChange = (j) => { if (j.status === 'running') order.push(j.params.tag); };
  events.on('change', onChange);
  const a = enqueue('noop', { params: { lines: 1, delayMs: 1, tag: 'a' } });
  const b = enqueue('noop', { params: { lines: 1, delayMs: 1, tag: 'b' } });
  await Promise.all([whenDone(a.id), whenDone(b.id)]);
  events.off('change', onChange);
  assert.deepEqual(order, ['a', 'b']);
});
