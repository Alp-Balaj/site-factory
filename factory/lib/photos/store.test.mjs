import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { fileNames, localPath, localUrls, measure, orientationOf, publicUrl, r2Config, r2Key, r2Urls, resize, saveOriginal, upload } from './store.mjs';

let tmp;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-store-'));
  process.env.PLACES_DIR = path.join(tmp, 'places');
});
after(() => { delete process.env.PLACES_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

const jpeg = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#c86432' } }).jpeg().toBuffer();
const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#3264c8' } }).png().toBuffer();

test('file names and keys follow the contract', () => {
  assert.deepEqual(fileNames('g01'), { orig: 'g01.orig.jpg', web: 'g01-1600.webp', thumb: 'g01-800.webp' });
  assert.equal(r2Key('la-tarte', 'g01-800.webp'), 'la-tarte/g01-800.webp');
  assert.equal(publicUrl('https://pub.r2.dev/', 'la-tarte/g01.orig.jpg'), 'https://pub.r2.dev/la-tarte/g01.orig.jpg');
  assert.deepEqual(localUrls('i02'), { original: 'photos/i02.orig.jpg', web: 'photos/i02-1600.webp', thumb: 'photos/i02-800.webp' });
  assert.deepEqual(r2Urls('la-tarte', 'i02', 'https://pub.r2.dev'), {
    original: 'https://pub.r2.dev/la-tarte/i02.orig.jpg', web: 'https://pub.r2.dev/la-tarte/i02-1600.webp', thumb: 'https://pub.r2.dev/la-tarte/i02-800.webp',
  });
});

test('r2Config is null without a bucket and loud with a half-filled env', () => {
  assert.equal(r2Config({}), null);
  assert.throws(() => r2Config({ R2_BUCKET: 'b', R2_ACCOUNT_ID: 'acc' }), /R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL are missing/);
  const cfg = r2Config({ R2_BUCKET: 'b', R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_PUBLIC_URL: 'https://pub.r2.dev' });
  assert.equal(cfg.endpoint, 'https://acc.r2.cloudflarestorage.com');
  assert.equal(cfg.bucket, 'b');
});

test('orientation', () => {
  assert.equal(orientationOf(4032, 3024), 'landscape');
  assert.equal(orientationOf(3024, 4032), 'portrait');
  assert.equal(orientationOf(1000, 1000), 'square');
  assert.equal(orientationOf(null, null), 'landscape');
});

test('saveOriginal keeps JPEG bytes, re-encodes PNG, never overwrites; resize makes both webp sizes once', async () => {
  const slug = 'p1';
  const src = await jpeg(2400, 1600);
  const file = await saveOriginal(slug, 'g01', src, 'image/jpeg');
  assert.equal(file, localPath(slug, 'g01.orig.jpg'));
  assert.ok(fs.readFileSync(file).equals(src));
  await saveOriginal(slug, 'g01', await jpeg(10, 10), 'image/jpeg'); // second call is a no-op
  assert.ok(fs.readFileSync(file).equals(src));

  await saveOriginal(slug, 'g02', await png(600, 900), 'image/png');
  const meta = await sharp(localPath(slug, 'g02.orig.jpg')).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.deepEqual(await measure(slug, 'g02'), { width: 600, height: 900, orientation: 'portrait' });

  assert.equal(await resize(slug, 'g01'), 2);
  assert.equal(await resize(slug, 'g01'), 0);
  const web = await sharp(localPath(slug, 'g01-1600.webp')).metadata();
  const thumb = await sharp(localPath(slug, 'g01-800.webp')).metadata();
  assert.equal(web.format, 'webp'); assert.equal(web.width, 1600); assert.equal(web.height, 1067);
  assert.equal(thumb.width, 800);
  await resize(slug, 'g02');
  assert.equal((await sharp(localPath(slug, 'g02-1600.webp')).metadata()).width, 600); // never upscales
  await assert.rejects(resize(slug, 'g99'), /missing/);
});

test('upload sends HEAD per file and PUTs only what differs', async () => {
  const slug = 'p2';
  await saveOriginal(slug, 'g01', await jpeg(1200, 800));
  await resize(slug, 'g01');
  const cfg = { bucket: 'b', publicUrl: 'https://pub.r2.dev' };
  const sizes = Object.fromEntries(Object.values(fileNames('g01')).map(f => [`${slug}/${f}`, fs.statSync(localPath(slug, f)).size]));
  const remote = new Map([[`${slug}/g01.orig.jpg`, sizes[`${slug}/g01.orig.jpg`]], [`${slug}/g01-800.webp`, 1]]); // thumb has a stale size
  const calls = [];
  const client = {
    async send(cmd) {
      const name = cmd.constructor.name;
      calls.push(`${name} ${cmd.input.Key}`);
      if (name === 'HeadObjectCommand') {
        if (!remote.has(cmd.input.Key)) throw Object.assign(new Error('nf'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
        return { ContentLength: remote.get(cmd.input.Key) };
      }
      assert.ok(Buffer.isBuffer(cmd.input.Body));
      assert.ok(['image/jpeg', 'image/webp'].includes(cmd.input.ContentType));
      remote.set(cmd.input.Key, cmd.input.Body.length);
      return {};
    },
  };
  assert.equal(await upload(slug, 'g01', cfg, client), 2);
  assert.deepEqual(calls.filter(c => c.startsWith('Put')).sort(), ['PutObjectCommand p2/g01-1600.webp', 'PutObjectCommand p2/g01-800.webp']);
  assert.equal(await upload(slug, 'g01', cfg, client), 0); // second run: every size matches
  const other = { async send() { throw Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }); } };
  await assert.rejects(upload(slug, 'g01', cfg, other), /denied/);
});
