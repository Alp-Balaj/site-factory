import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SOFT_IDS, buildPrompt, parseSoft, runSoft, schema, softFailures } from './soft.mjs';

test('the schema demands all five ids, each with an integer score 1–5 and a reason', () => {
  assert.deepEqual(schema.required, SOFT_IDS);
  for (const id of SOFT_IDS) {
    assert.equal(schema.properties[id].properties.score.minimum, 1);
    assert.equal(schema.properties[id].properties.score.maximum, 5);
  }
});

test('parseSoft returns the five checks in contract order, clamped and rounded', () => {
  const out = parseSoft({
    'theme-fits': { score: 4, reason: 'green and amber echo the menu mats' },
    'first-viewport': { score: 9, reason: 'name and room photo' },
    'hero-suits': { score: 2.4, reason: 'parking lot' },
    'nothing-cut-off': { score: 0, reason: 'price column wraps' },
    'menu-reads': { score: '5', reason: '  groups and prices line up ' },
  });
  assert.deepEqual(out.map(s => s.id), SOFT_IDS);
  assert.deepEqual(out.map(s => s.score), [5, 2, 1, 5, 4]);
  assert.equal(out[3].reason, 'groups and prices line up');
  assert.deepEqual(softFailures(out).map(s => s.id), ['hero-suits', 'nothing-cut-off']);
});

test('parseSoft refuses an answer with a check missing', () => {
  assert.throws(() => parseSoft({ 'first-viewport': { score: 3, reason: '' } }), /"hero-suits" missing/);
  assert.throws(() => parseSoft(null), /no structured output/);
});

test('the prompt names the place, the archetype and every check', () => {
  const p = buildPrompt({ name: 'La Tarté', archetype: 'patisserie-bakery', city: 'Prishtinë' });
  assert.match(p, /La Tarté in Prishtinë \(archetype: patisserie-bakery\)/);
  for (const id of SOFT_IDS) assert.ok(p.includes(`${id}:`), id);
  assert.match(buildPrompt({ name: 'X' }), /for X\.\n/);
});

test('runSoft refuses to call Claude when a preview is missing', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-qa-soft-'));
  const prev = process.env.PLACES_DIR;
  process.env.PLACES_DIR = tmp;
  try {
    fs.mkdirSync(path.join(tmp, 'p1'));
    fs.writeFileSync(path.join(tmp, 'p1', 'preview-mobile.png'), '');
    await assert.rejects(runSoft('p1', { config: {} }), /missing .*preview-desktop\.png/);
  } finally {
    if (prev === undefined) delete process.env.PLACES_DIR; else process.env.PLACES_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
