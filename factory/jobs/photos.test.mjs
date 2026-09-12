// The photos job end to end, offline: Google and Apify are a stubbed global fetch, vision is off.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { runJob } from '../lib/jobs.mjs';
import { photosDir, photosPath, placePath, readJson } from '../lib/paths.mjs';
import { ensureState, readState } from '../lib/state.mjs';
import { parseStages } from './photos.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, '..', 'lib', 'photos', 'fixtures', 'place.json');

let tmp, cwd, realFetch;
const calls = [];
before(() => {
  cwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-photos-job-'));
  process.env.PLACES_DIR = path.join(tmp, 'places');
  process.env.GOOGLE_PLACES_KEY = 'test-key';
  process.env.APIFY_TOKEN = 'test-token';
  delete process.env.AUTO_COMMIT;
  delete process.env.R2_BUCKET;
  process.chdir(tmp);
  realFetch = globalThis.fetch;
  globalThis.fetch = stubFetch;
});
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.PLACES_DIR; delete process.env.GOOGLE_PLACES_KEY; delete process.env.APIFY_TOKEN;
  process.chdir(cwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const jpeg = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#a05030' } }).jpeg().toBuffer();

async function stubFetch(url, init) {
  const u = String(url);
  calls.push(u);
  if (u.startsWith('https://places.googleapis.com/v1/places/')) {
    assert.match(u, /maxWidthPx=1600&key=test-key$/);
    if (u.includes('AAA4')) return new Response('nope', { status: 403, headers: { 'content-type': 'text/html' } });
    const portrait = u.includes('AAA2');
    return new Response(await jpeg(portrait ? 900 : 1600, portrait ? 1600 : 1000), { headers: { 'content-type': 'image/jpeg' } });
  }
  if (u.startsWith('https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items')) {
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body).directUrls, ['https://www.instagram.com/latarte.ks/']);
    return Response.json([
      { type: 'Image', url: 'https://www.instagram.com/p/POST1/', displayUrl: 'https://cdn.test/post1.jpg', caption: 'Tarta e mollës sot', timestamp: '2026-09-01T10:00:00.000Z' },
      { type: 'Image', url: 'https://www.instagram.com/p/POST2/', displayUrl: 'https://cdn.test/post2.jpg', caption: '', timestamp: '2026-09-02T10:00:00.000Z' },
    ]);
  }
  if (u.startsWith('https://cdn.test/')) return new Response(await jpeg(1080, 1080), { headers: { 'content-type': 'image/jpeg' } });
  throw new Error(`unexpected fetch ${u}`);
}

function seed(slug) {
  fs.mkdirSync(path.dirname(placePath(slug)), { recursive: true });
  fs.copyFileSync(fixture, placePath(slug));
  ensureState(slug, 'found', 'test');
}

test('parseStages', () => {
  assert.deepEqual([...parseStages(undefined)], ['discover', 'fetch', 'store', 'curate']);
  assert.deepEqual([...parseStages('store,curate')], ['store', 'curate']);
  assert.throws(() => parseStages('upload'), /unknown stage upload/);
});

test('a full run without R2 leaves originals, both webp sizes and a local photos.json; a rerun downloads nothing', async () => {
  const slug = 'la-tarte';
  seed(slug);
  const job = await runJob('photos', { slug, params: { vision: false } });
  assert.equal(job.status, 'done');
  assert.deepEqual(job.result, { pool: 7, store: 'local', instagram: 'latarte.ks', hero: 'g01' });

  const photos = readJson(photosPath(slug));
  assert.equal(photos.store, 'local');
  assert.deepEqual(photos.instagram, { handle: 'latarte.ks', how: 'google', posts: 2 });
  assert.deepEqual(photos.pool.map(p => p.id), ['g01', 'g02', 'g03', 'g05', 'g06', 'i01', 'i02']); // AAA4 failed with 403 and is not in the pool
  const g01 = photos.pool[0];
  assert.equal(g01.ref, 'places/ChIJtest/photos/AAA1');
  assert.deepEqual(g01.author, { name: 'Arta B.', uri: 'https://maps.google.com/maps/contrib/1' });
  assert.deepEqual([g01.width, g01.height, g01.orientation], [1600, 1000, 'landscape']);
  assert.deepEqual([g01.original, g01.web, g01.thumb], ['photos/g01.orig.jpg', 'photos/g01-1600.webp', 'photos/g01-800.webp']);
  assert.equal(photos.pool[1].orientation, 'portrait');
  const i01 = photos.pool.find(p => p.id === 'i01');
  assert.equal(i01.ref, 'https://www.instagram.com/p/POST1/');
  assert.equal(i01.caption, 'Tarta e mollës sot');
  assert.equal(i01.orientation, 'square');
  assert.equal(i01.image, undefined); // the temporary CDN URL is not kept
  assert.deepEqual(photos.picks, { hero: 'g01', gallery: ['g02', 'g03', 'g05', 'g06'] });
  assert.match(photos.note, /without vision/);
  assert.ok(photos.curated_at);
  assert.deepEqual(readState(slug).instagram, { handle: 'latarte.ks', how: 'google' });

  const files = fs.readdirSync(photosDir(slug)).sort();
  for (const id of ['g01', 'g02', 'g03', 'g05', 'g06', 'i01', 'i02']) for (const f of [`${id}.orig.jpg`, `${id}-1600.webp`, `${id}-800.webp`]) assert.ok(files.includes(f), f);
  assert.equal(files.length, 21);
  assert.equal((await sharp(path.join(photosDir(slug), 'g01-800.webp')).metadata()).width, 800);

  const before = calls.length;
  const again = await runJob('photos', { slug, params: { vision: false } });
  assert.equal(again.status, 'done');
  const later = calls.slice(before);
  assert.equal(later.filter(u => u.includes('googleapis')).length, 1); // only the photo that failed before is retried
  assert.ok(later.some(u => u.includes('apify')));
  assert.deepEqual(readJson(photosPath(slug)).pool.map(p => p.id), ['g01', 'g02', 'g03', 'g05', 'g06', 'i01', 'i02']);
});

test('--stage discover alone writes state.instagram and nothing else; a manual handle is kept', async () => {
  const slug = 'only-discover';
  seed(slug);
  const job = await runJob('photos', { slug, params: { stage: 'discover' } });
  assert.equal(job.status, 'done');
  assert.deepEqual(readState(slug).instagram, { handle: 'latarte.ks', how: 'google' });
  assert.equal(readJson(photosPath(slug)).pool.length, 0);
  assert.ok(!fs.existsSync(photosDir(slug)));

  const manual = 'by-hand';
  seed(manual);
  const { updateState } = await import('../lib/state.mjs');
  updateState(manual, { instagram: { handle: 'typed.in', how: 'manual' } });
  await runJob('photos', { slug: manual, params: { stage: 'discover' } });
  assert.deepEqual(readState(manual).instagram, { handle: 'typed.in', how: 'manual' });
});

test('without APIFY_TOKEN the Instagram posts are skipped with a log line and the job still succeeds', async () => {
  const slug = 'no-apify';
  seed(slug);
  const saved = process.env.APIFY_TOKEN;
  delete process.env.APIFY_TOKEN;
  const { events } = await import('../lib/jobs.mjs');
  const lines = [];
  const onLog = (e) => lines.push(e.line);
  events.on('log', onLog);
  try {
    const job = await runJob('photos', { slug, params: { stage: 'discover,fetch' } });
    assert.equal(job.status, 'done');
  } finally { events.off('log', onLog); process.env.APIFY_TOKEN = saved; }
  assert.ok(lines.some(l => /APIFY_TOKEN not set, skipping Instagram posts of @latarte.ks/.test(l)));
  assert.deepEqual(readJson(photosPath(slug)).pool.map(p => p.source), ['google', 'google', 'google', 'google', 'google']);
});

test('the job fails plainly without place.json or with an unknown stage', async () => {
  ensureState('no-place', 'found', 'test');
  await assert.rejects(runJob('photos', { slug: 'no-place', params: {} }), /place\.json missing/);
  seed('bad-stage');
  await assert.rejects(runJob('photos', { slug: 'bad-stage', params: { stage: 'upload' } }), /unknown stage upload/);
});

// R2 through a mock S3 server: HEAD answers 404 or the stored size, PUT stores the body. The SDK signs against it
// happily (the mock does not verify signatures), so the whole store stage runs as it would against Cloudflare.
test('with R2 configured the store stage uploads once, writes public URLs, and a rerun uploads nothing', async () => {
  const http = await import('node:http');
  const objects = new Map();
  const hits = { HEAD: 0, PUT: 0 };
  const server = http.createServer((req, res) => {
    const key = decodeURIComponent(req.url.split('?')[0].replace(/^\/+/, ''));
    hits[req.method] = (hits[req.method] ?? 0) + 1;
    if (req.method === 'HEAD') {
      if (!objects.has(key)) { res.statusCode = 404; return res.end(); }
      res.setHeader('content-length', objects.get(key).length);
      res.setHeader('etag', '"x"');
      res.statusCode = 200; return res.end();
    }
    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => { objects.set(key, Buffer.concat(chunks)); res.setHeader('etag', '"x"'); res.statusCode = 200; res.end(); });
      return;
    }
    res.statusCode = 405; res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  Object.assign(process.env, {
    R2_BUCKET: 'site-factory-photos', R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
    R2_PUBLIC_URL: 'https://pub.r2.dev/', R2_ENDPOINT: `http://127.0.0.1:${port}`,
  });
  try {
    const slug = 'with-r2';
    seed(slug);
    const job = await runJob('photos', { slug, params: { vision: false } });
    assert.equal(job.status, 'done');
    assert.equal(job.result.store, 'r2');
    const photos = readJson(photosPath(slug));
    assert.equal(photos.store, 'r2');
    assert.equal(photos.pool.length, 7);
    assert.equal(photos.pool[0].web, 'https://pub.r2.dev/with-r2/g01-1600.webp');
    assert.equal(photos.pool[6].original, 'https://pub.r2.dev/with-r2/i02.orig.jpg');
    assert.equal(hits.PUT, 21);
    assert.deepEqual([...objects.keys()].filter(k => k.startsWith('site-factory-photos/with-r2/g01')).sort(),
      ['site-factory-photos/with-r2/g01-1600.webp', 'site-factory-photos/with-r2/g01-800.webp', 'site-factory-photos/with-r2/g01.orig.jpg']);
    assert.equal(objects.get('site-factory-photos/with-r2/g01.orig.jpg').length, fs.statSync(path.join(photosDir(slug), 'g01.orig.jpg')).size);

    const again = await runJob('photos', { slug, params: { stage: 'store' } });
    assert.equal(again.status, 'done');
    assert.equal(hits.PUT, 21); // every size matched, nothing uploaded
    assert.equal(hits.HEAD, 42);
  } finally {
    for (const k of ['R2_BUCKET', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL', 'R2_ENDPOINT']) delete process.env[k];
    server.close();
  }
});
