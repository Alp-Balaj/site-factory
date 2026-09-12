import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsBuild, reasonsOf, run } from './qa.mjs';
import { ensureState, readState, transition, updateState } from '../lib/state.mjs';
import { buildDir, configPath, previewPath, readJson } from '../lib/paths.mjs';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'qa', 'fixtures');

let tmp;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-qa-job-'));
  process.env.PLACES_DIR = path.join(tmp, 'places');
  delete process.env.AUTO_COMMIT;
});
after(() => { delete process.env.PLACES_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

const config = (patch = {}) => ({
  business: { name: 'Te Ymeri', phone: '+383 44 000 000', whatsapp: '' },
  hero: { headline: 'Skara e vërtetë.', sub: 'Çdo ditë nga ora 8.' },
  about: { title: 'Për ne', text: 'Familje, skarë, bukë të ngrohtë.' },
  items: Array.from({ length: 6 }, (_, i) => ({ group: 'Skara', name: `Pjata ${i + 1}`, desc: 'Me bukë.', price: '4 €' })),
  theme: { bg: '#F3F4EF', ink: '#1A1D18', primary: '#1D4A2F', accent: '#B2860F', muted: '#E6E8E0' },
  ...patch,
});

// A Place folder with config.json, state.json (status), and optionally a fixture build and previews.
function place(slug, { status = 'generating', cfg = config(), built = true, previews = true } = {}) {
  fs.mkdirSync(buildDir(slug), { recursive: true });
  fs.writeFileSync(configPath(slug), JSON.stringify(cfg));
  ensureState(slug, 'found', 'test');
  if (status !== 'found') transition(slug, 'generating', 'test');
  if (status !== 'found' && status !== 'generating') transition(slug, status, 'test');
  if (built) { fs.copyFileSync(path.join(fixtures, 'hero-ok.html'), path.join(buildDir(slug), 'index.html')); fs.copyFileSync(path.join(fixtures, 'pixel.png'), path.join(buildDir(slug), 'pixel.png')); }
  if (previews) for (const v of ['mobile', 'desktop']) fs.writeFileSync(previewPath(slug, v), '');
}

// The job context the queue would build (factory/lib/jobs.mjs makeContext), minus the queue.
function ctxFor(slug, params = {}) {
  const lines = [];
  return {
    id: 'test', slug, params, lines,
    state: readState(slug), config: readJson(configPath(slug)),
    log: (l) => lines.push(String(l)),
    setStatus(to, reason) { this.state = transition(slug, to, reason); return this.state; },
    writeState(patch) { this.state = updateState(slug, patch); return this.state; },
    reloadState() { this.state = readState(slug); return this.state; },
  };
}

const okSoft = async () => [
  { id: 'first-viewport', score: 5, reason: 'name and room photo' }, { id: 'hero-suits', score: 4, reason: 'the grill' },
  { id: 'nothing-cut-off', score: 5, reason: '' }, { id: 'menu-reads', score: 4, reason: 'prices line up' }, { id: 'theme-fits', score: 4, reason: 'greens' },
];

test('a built Place with a good config passes: state.qa written, generating -> qa_passed', async () => {
  place('good');
  const ctx = ctxFor('good');
  const soft = []; // vision on: the fake soft runner records that it was called with the config
  const r = await run(ctx, { soft: async (slug, o) => { soft.push(o.config.business.name); return okSoft(); } });
  assert.deepEqual(r, { passed: true, status: 'qa_passed', reasons: [] });
  assert.deepEqual(soft, ['Te Ymeri']);
  const s = readState('good');
  assert.equal(s.status, 'qa_passed');
  assert.equal(s.qa.passed, true);
  assert.equal(s.qa.vision, true);
  assert.deepEqual(s.qa.hard.map(h => h.id), ['build', 'images', 'phone', 'items', 'contrast', 'hero-overflow-390', 'copy-dash', 'copy-language']);
  assert.equal(s.qa.soft.length, 5);
  assert.deepEqual(s.qa.reasons, []);
  assert.equal(s.log.at(-1).to, 'qa_passed');
});

test('no phone fails with the reason "no phone"; a long dash in the hero quotes the text', async () => {
  place('nophone', { cfg: config({ business: { name: 'Te Ymeri', phone: '', whatsapp: '' }, hero: { headline: 'Skara — e vërtetë', sub: 'x' } }) });
  const r = await run(ctxFor('nophone', { vision: false }));
  assert.equal(r.passed, false);
  assert.equal(r.status, 'qa_failed');
  assert.deepEqual(r.reasons, ['phone: no phone', 'copy-dash: long dash in hero.headline "Skara — e vërtetë"']);
  const s = readState('nophone');
  assert.equal(s.qa.vision, false);
  assert.deepEqual(s.qa.soft, []);
  assert.match(s.log.at(-1).reason, /qa failed: phone: no phone/);
});

test('--no-vision runs hard checks only; with vision a score below 3 fails with the reason', async () => {
  place('low');
  let called = 0;
  await run(ctxFor('low', { vision: false }), { soft: async () => { called++; return okSoft(); } });
  assert.equal(called, 0);
  assert.equal(readState('low').status, 'qa_passed');

  place('low2');
  const r = await run(ctxFor('low2'), { soft: async () => { const s = await okSoft(); s[1] = { id: 'hero-suits', score: 2, reason: 'Hero shows a parking lot' }; return s; } });
  assert.deepEqual(r.reasons, ['hero-suits: 2/5 Hero shows a parking lot']);
  assert.equal(readState('low2').status, 'qa_failed');
  assert.equal(readState('low2').qa.soft[1].score, 2);
});

test('builds when the build is missing or older than config.json, and a failed build is the "build" hard failure', async () => {
  place('stale', { built: false, previews: false });
  assert.equal(needsBuild('stale'), true);
  const calls = [];
  const fakeBuild = async (slug) => {
    calls.push(slug);
    fs.copyFileSync(path.join(fixtures, 'hero-ok.html'), path.join(buildDir(slug), 'index.html'));
    fs.copyFileSync(path.join(fixtures, 'pixel.png'), path.join(buildDir(slug), 'pixel.png'));
    for (const v of ['mobile', 'desktop']) fs.writeFileSync(previewPath(slug, v), '');
  };
  const r = await run(ctxFor('stale', { vision: false }), { build: fakeBuild });
  assert.deepEqual(calls, ['stale']);
  assert.equal(r.passed, true);
  assert.equal(needsBuild('stale'), false);

  // config edited after the build -> builds again
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(configPath('stale'), later, later);
  assert.equal(needsBuild('stale'), true);

  place('broken', { built: false, previews: false });
  const r2 = await run(ctxFor('broken', { vision: false }), { build: async () => { throw new Error('astro build failed for broken (exit 1)'); } });
  assert.equal(r2.passed, false);
  assert.equal(r2.status, 'qa_failed');
  assert.match(r2.reasons[0], /^build: build failed: astro build failed/);
  assert.ok(r2.reasons.some(x => x.startsWith('images: no build')));
});

test('takes screenshots when the build is fresh but the previews are missing', async () => {
  place('noprev', { previews: false });
  let shots = 0;
  const screenshots = async (slug) => { shots++; for (const v of ['mobile', 'desktop']) fs.writeFileSync(previewPath(slug, v), ''); return { mobile: previewPath(slug, 'mobile') }; };
  await run(ctxFor('noprev', { vision: false }), { screenshots });
  assert.equal(shots, 1);
});

test('a rerun on a qa_passed Place that now fails goes through generating; a shown Place keeps its status', async () => {
  place('rerun', { status: 'qa_passed' });
  fs.writeFileSync(configPath('rerun'), JSON.stringify(config({ business: { name: 'x', phone: '' } })));
  fs.utimesSync(path.join(buildDir('rerun'), 'index.html'), new Date(Date.now() + 5000), new Date(Date.now() + 5000)); // keep the build "fresh"
  const r = await run(ctxFor('rerun', { vision: false }));
  assert.equal(r.status, 'qa_failed');
  assert.deepEqual(readState('rerun').log.slice(-2).map(e => e.to), ['generating', 'qa_failed']);

  place('shown', { status: 'qa_passed' });
  transition('shown', 'ready'); transition('shown', 'shown');
  const ctx = ctxFor('shown', { vision: false });
  const r2 = await run(ctx);
  assert.equal(r2.passed, true);
  assert.equal(r2.status, 'shown');
  assert.equal(readState('shown').qa.passed, true);
  assert.ok(ctx.lines.some(l => /status stays shown/.test(l)));
});

test('reasonsOf lists hard failures then low soft scores', () => {
  assert.deepEqual(reasonsOf([{ id: 'build', ok: true }, { id: 'images', ok: false, detail: '2 of 6 images failed' }, { id: 'x', ok: false }], [{ id: 'hero-suits', score: 2, reason: 'parking lot' }, { id: 'menu-reads', score: 3, reason: 'fine' }]),
    ['images: 2 of 6 images failed', 'x: failed', 'hero-suits: 2/5 parking lot']);
});

test('the job refuses a Place without config.json', async () => {
  fs.mkdirSync(path.join(process.env.PLACES_DIR, 'empty'), { recursive: true });
  ensureState('empty', 'found', 'test');
  await assert.rejects(run(ctxFor('empty')), /config\.json not found/);
});
