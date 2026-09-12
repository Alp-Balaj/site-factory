import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkBuild, checkContrast, checkHeroOverflow, checkImages, checkItems, checkPhone, imageSources, runHard,
} from './hard.mjs';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name) => path.join(fixtures, name);
const read = (name) => fs.readFileSync(fixture(name), 'utf8');

const theme = { bg: '#F3F4EF', ink: '#1A1D18', primary: '#1D4A2F', accent: '#B2860F', muted: '#E6E8E0' };
const config = (patch = {}) => ({
  business: { name: 'Te Ymeri', phone: '+383 44 000 000', whatsapp: '' },
  hero: { headline: 'Skara e vërtetë.', sub: 'Çdo ditë nga ora 8.' },
  about: { title: 'Për ne', text: 'Familje, skarë, bukë të ngrohtë.' },
  items: Array.from({ length: 6 }, (_, i) => ({ group: 'Skara', name: `Pjata ${i + 1}`, desc: 'Me bukë.', price: '4 €' })),
  theme,
  ...patch,
});

// ---- images ----

test('imageSources reads every <img src> once, in order, with entities decoded', () => {
  assert.deepEqual(imageSources(read('images.html')), ['pixel.png', '/pixel.png', 'missing.jpg', 'pixel.png?v=2', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=']);
  assert.deepEqual(imageSources('<img src="a.jpg?x=1&amp;y=2"><IMG SRC=b.jpg><img alt="no src">'), ['a.jpg?x=1&y=2', 'b.jpg']);
  assert.deepEqual(imageSources(''), []);
});

test('local images: existing files pass (root-relative and with a query), a missing file fails and is named', async () => {
  const r = await checkImages(read('images.html'), fixtures);
  assert.equal(r.ok, false);
  assert.equal(r.detail, '1 of 5 images failed: missing.jpg (missing file)');
  const ok = await checkImages('<img src="pixel.png">', fixtures);
  assert.deepEqual(ok, { id: 'images', ok: true, detail: '1 images' });
  assert.deepEqual(await checkImages('<p>no pictures</p>', fixtures), { id: 'images', ok: true, detail: 'no images' });
});

let server, base;
const hits = [];
before(async () => {
  server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    if (req.url === '/head-only.jpg' && req.method === 'HEAD') { res.writeHead(405); res.end(); return; } // HEAD refused, GET fine
    if (req.url === '/gone.jpg') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(fs.readFileSync(fixture('pixel.png')));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

test('HTTP images: 200 passes, HEAD 405 falls back to GET, 404 fails with the status, an unreachable host fails', async () => {
  const html = `<img src="${base}/ok.png"><img src="${base}/head-only.jpg"><img src="${base}/gone.jpg">`;
  const r = await checkImages(html, fixtures);
  assert.equal(r.ok, false);
  assert.equal(r.detail, '1 of 3 images failed: gone.jpg (404)');
  assert.ok(hits.includes('HEAD /ok.png') && !hits.includes('GET /ok.png'), 'a 200 on HEAD needs no GET');
  assert.ok(hits.includes('HEAD /head-only.jpg') && hits.includes('GET /head-only.jpg'));

  const closed = http.createServer(); // listen then close: a port nothing answers on
  await new Promise(r => closed.listen(0, '127.0.0.1', r));
  const port = closed.address().port;
  await new Promise(r => closed.close(r));
  const dead = await checkImages(`<img src="http://127.0.0.1:${port}/x.png">`, fixtures);
  assert.equal(dead.ok, false);
  assert.match(dead.detail, /x\.png \(ECONNREFUSED\)/);
});

// ---- config checks ----

test('phone: business.phone or whatsapp; neither gives the reason "no phone"', () => {
  assert.deepEqual(checkPhone(config()), { id: 'phone', ok: true });
  assert.deepEqual(checkPhone(config({ business: { name: 'x', phone: '', whatsapp: '38344000000' } })), { id: 'phone', ok: true });
  assert.deepEqual(checkPhone(config({ business: { name: 'x', phone: '  ' } })), { id: 'phone', ok: false, detail: 'no phone' });
  assert.deepEqual(checkPhone({}), { id: 'phone', ok: false, detail: 'no phone' });
});

test('items: six is the floor', () => {
  assert.deepEqual(checkItems(config()), { id: 'items', ok: true, detail: '6 items' });
  assert.deepEqual(checkItems(config({ items: config().items.slice(0, 5) })), { id: 'items', ok: false, detail: '5 items, need at least 6' });
  assert.deepEqual(checkItems({}), { id: 'items', ok: false, detail: '0 items, need at least 6' });
});

test('contrast: a repaired theme passes, weak ink, a mid-tone surface or a faint accent fails, a bad hex fails', () => {
  assert.deepEqual(checkContrast(theme), { id: 'contrast', ok: true });
  const weakInk = checkContrast({ ...theme, ink: '#777777' });
  assert.equal(weakInk.ok, false);
  assert.match(weakInk.detail, /ink on bg \d+\.\d:1 < 7/);
  const midtone = checkContrast({ ...theme, primary: '#7A7A7A' });
  assert.equal(midtone.ok, false);
  assert.match(midtone.detail, /no readable text on primary/);
  const faint = checkContrast({ ...theme, accent: '#E0E2DA' });
  assert.equal(faint.ok, false);
  assert.match(faint.detail, /accent on bg \d+\.\d:1 < 3/);
  const bad = checkContrast({ ...theme, muted: 'beige' });
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /not a hex colour: muted="beige"/);
  assert.equal(checkContrast(undefined).ok, false);
});

// ---- Playwright ----

test('hero overflow at 390px: the fitting fixture passes', async () => {
  assert.deepEqual(await checkHeroOverflow(fixture('hero-ok.html')), { id: 'hero-overflow-390', ok: true });
});

test('hero overflow at 390px: a nowrap headline and a 600px figure are both reported', async () => {
  const r = await checkHeroOverflow(fixture('hero-overflow.html'));
  assert.equal(r.ok, false);
  assert.match(r.detail, /wider than 390px: .*figure\.wide-photo/);
  assert.match(r.detail, /headline outside its box: h1 text/);
});

test('hero overflow without a build reports "no build" instead of throwing', async () => {
  assert.deepEqual(await checkHeroOverflow(path.join(fixtures, 'nope.html')), { id: 'hero-overflow-390', ok: false, detail: 'no build' });
});

// ---- runHard over a Place folder ----

test('runHard: every check in contract order against a temp Place, with and without a build', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-qa-hard-'));
  const prev = process.env.PLACES_DIR;
  process.env.PLACES_DIR = tmp;
  try {
    const dir = path.join(tmp, 'p1');
    fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config({ business: { name: 'x', phone: '' } })));

    const noBuild = await runHard('p1');
    assert.deepEqual(noBuild.map(r => r.id), ['build', 'images', 'phone', 'items', 'contrast', 'hero-overflow-390', 'copy-dash', 'copy-language']);
    assert.deepEqual(noBuild.filter(r => !r.ok).map(r => r.id), ['build', 'images', 'phone', 'hero-overflow-390']);
    assert.equal(noBuild.find(r => r.id === 'phone').detail, 'no phone');

    fs.copyFileSync(fixture('hero-ok.html'), path.join(dir, 'build', 'index.html'));
    fs.copyFileSync(fixture('pixel.png'), path.join(dir, 'build', 'pixel.png'));
    const lines = [];
    const built = await runHard('p1', { config: config({ hero: { headline: 'Skara — e vërtetë', sub: 'x' } }), log: l => lines.push(l) });
    assert.deepEqual(built.filter(r => !r.ok).map(r => r.id), ['copy-dash']);
    assert.match(built.find(r => r.id === 'copy-dash').detail, /hero\.headline "Skara — e vërtetë"/);
    assert.equal(lines.length, 8);
    assert.ok(lines.some(l => l.startsWith('FAIL copy-dash')));
  } finally {
    if (prev === undefined) delete process.env.PLACES_DIR; else process.env.PLACES_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
