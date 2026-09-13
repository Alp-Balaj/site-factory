import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STATUSES, TRANSITIONS, allowedFrom, canTransition, emptyState, ensureState, readState, transition } from './state.mjs';

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-state-')); process.env.PLACES_DIR = tmp; delete process.env.AUTO_COMMIT; });
after(() => { delete process.env.PLACES_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

// The table from the build plan, verbatim, plus found -> declined (Integration: a duplicate listing is dropped in the Portal).
const PLAN = [
  ['found', 'generating'], ['found', 'declined'],
  ['generating', 'qa_passed'], ['generating', 'qa_failed'], ['generating', 'failed'],
  ['failed', 'found'],
  ['qa_failed', 'generating'], ['qa_failed', 'declined'],
  ['qa_passed', 'ready'], ['qa_passed', 'generating'],
  ['ready', 'shown'], ['ready', 'generating'],
  ['shown', 'interested'], ['shown', 'declined'],
  ['interested', 'intake_received'], ['interested', 'declined'],
  ['intake_received', 'generating'], ['intake_received', 'paid'], ['intake_received', 'declined'],
  ['paid', 'live'],
  ['live', 'churned'], ['live', 'generating'],
  ['declined', 'found'],
];

test('every status in the table is a known status', () => {
  for (const [from, tos] of Object.entries(TRANSITIONS)) {
    assert.ok(STATUSES.includes(from), from);
    for (const to of tos) assert.ok(STATUSES.includes(to), to);
  }
  for (const s of STATUSES) assert.ok(s in TRANSITIONS, `${s} has a row`);
});

test('every allowed transition in the plan is allowed, and nothing else', () => {
  for (const [from, to] of PLAN) assert.ok(canTransition(from, to), `${from} -> ${to}`);
  const listed = new Set(PLAN.map(([a, b]) => `${a}>${b}`));
  for (const from of STATUSES) for (const to of STATUSES) {
    assert.equal(canTransition(from, to), listed.has(`${from}>${to}`), `${from} -> ${to}`);
  }
});

test('a few moves the table forbids', () => {
  assert.equal(canTransition('found', 'ready'), false);      // no skipping QA
  assert.equal(canTransition('qa_failed', 'ready'), false);  // approval needs qa_passed
  assert.equal(canTransition('ready', 'paid'), false);       // money comes after interest and intake
  assert.equal(canTransition('paid', 'found'), false);
  assert.equal(canTransition('churned', 'live'), false);     // churned is final
  assert.equal(canTransition('found', 'found'), false);
  assert.deepEqual(allowedFrom('churned'), []);
});

test('emptyState carries every contract field', () => {
  const s = emptyState();
  assert.equal(s.status, 'found');
  for (const k of ['flags', 'archetype', 'instagram', 'contact', 'feedback', 'followUp', 'priceAgreed', 'paidAt', 'domain', 'pagesUrl', 'notes', 'qa', 'log']) assert.ok(k in s, k);
  assert.deepEqual(s.flags, { hasRealWebsite: false, fixture: false });
  assert.throws(() => emptyState('nope'), /unknown status/);
});

test('transition writes the new status and appends to the log; a forbidden move throws and changes nothing', () => {
  ensureState('test-place', 'found', 'test');
  assert.equal(readState('test-place').status, 'found');
  transition('test-place', 'generating', 'generate job');
  transition('test-place', 'qa_passed', 'qa ok');
  const s = readState('test-place');
  assert.equal(s.status, 'qa_passed');
  assert.deepEqual(s.log.map(l => [l.from, l.to]), [[null, 'found'], ['found', 'generating'], ['generating', 'qa_passed']]);
  assert.equal(s.log.at(-1).reason, 'qa ok');
  assert.throws(() => transition('test-place', 'paid'), /cannot go from qa_passed to paid/);
  assert.equal(readState('test-place').status, 'qa_passed');
  assert.throws(() => transition('test-place', 'bogus'), /unknown status/);
  assert.throws(() => transition('missing-place', 'generating'), /not found/);
});

test('the full happy path from found to live', () => {
  ensureState('happy', 'found', 'test');
  for (const to of ['generating', 'qa_passed', 'ready', 'shown', 'interested', 'intake_received', 'paid', 'live']) transition('happy', to);
  assert.equal(readState('happy').status, 'live');
});
