import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasPlace, hasRealWebsite, photoUrl, readPlace, writePlace } from './place.mjs';

test('hasRealWebsite is false for nothing and for profile pages', () => {
  assert.equal(hasRealWebsite(null), false);
  assert.equal(hasRealWebsite(undefined), false);
  assert.equal(hasRealWebsite(''), false);
  assert.equal(hasRealWebsite('   '), false);
  assert.equal(hasRealWebsite('https://www.facebook.com/latarte.ks'), false);
  assert.equal(hasRealWebsite('https://m.facebook.com/p/Restaurant-Liburnia-100063539/'), false);
  assert.equal(hasRealWebsite('http://facebook.com/x'), false);
  assert.equal(hasRealWebsite('https://www.instagram.com/latarte.ks'), false);
  assert.equal(hasRealWebsite('https://instagram.com/latarte.ks/'), false);
  assert.equal(hasRealWebsite('https://fb.me/abc'), false);
  assert.equal(hasRealWebsite('https://linktr.ee/latarte'), false);
  assert.equal(hasRealWebsite('https://wa.me/38345211888?text=Hello'), false);
  assert.equal(hasRealWebsite('https://api.whatsapp.com/send?phone=383'), false);
  assert.equal(hasRealWebsite('not a url'), false);
});

test('hasRealWebsite is true for a site of its own, including lookalike hosts', () => {
  assert.equal(hasRealWebsite('https://restaurantgresa-ks.com/'), true);
  assert.equal(hasRealWebsite('https://la-tarte.com/'), true);
  assert.equal(hasRealWebsite('http://www.liburnia-ks.com/menu'), true);
  assert.equal(hasRealWebsite('restaurantgresa-ks.com'), true); // Google sometimes omits the scheme
  assert.equal(hasRealWebsite('https://myfacebook.company.com/'), true); // a host that merely ends in facebook.com-ish text is not the profile host
  assert.equal(hasRealWebsite('https://instagram.company.com/'), true);
});

test('photoUrl builds the Places media URL with the key from the environment, at call time', () => {
  const prev = process.env.GOOGLE_PLACES_KEY;
  process.env.GOOGLE_PLACES_KEY = 'KEY-ONE';
  try {
    const name = 'places/ChIJbd7VBgCfVBMRvgjTEHIkyII/photos/AVoNoXTENtGZ2wzz';
    assert.equal(photoUrl(name, 1600), `https://places.googleapis.com/v1/${name}/media?maxWidthPx=1600&key=KEY-ONE`);
    assert.equal(photoUrl(name), `https://places.googleapis.com/v1/${name}/media?maxWidthPx=1600&key=KEY-ONE`);
    assert.equal(photoUrl(name, 800), `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=KEY-ONE`);
    assert.equal(photoUrl(`/${name}`, 800), photoUrl(name, 800));
    process.env.GOOGLE_PLACES_KEY = 'KEY-TWO';
    assert.match(photoUrl(name, 800), /key=KEY-TWO$/); // the key is read when called, not when imported
    assert.equal(photoUrl(name, 800, 'EXPLICIT'), `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=EXPLICIT`);
  } finally {
    if (prev === undefined) delete process.env.GOOGLE_PLACES_KEY; else process.env.GOOGLE_PLACES_KEY = prev;
  }
});

test('photoUrl refuses to run without a key or a name', () => {
  const prev = process.env.GOOGLE_PLACES_KEY;
  delete process.env.GOOGLE_PLACES_KEY;
  try {
    assert.throws(() => photoUrl('places/x/photos/y', 800), /GOOGLE_PLACES_KEY/);
    assert.throws(() => photoUrl('', 800, 'k'), /photo name/);
  } finally {
    if (prev !== undefined) process.env.GOOGLE_PLACES_KEY = prev;
  }
});

let tmp;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-place-'));
  process.env.PLACES_DIR = path.join(tmp, 'places');
  delete process.env.AUTO_COMMIT;
});
after(() => { delete process.env.PLACES_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

test('readPlace and writePlace round-trip place.json under PLACES_DIR', () => {
  assert.equal(hasPlace('la-tarte'), false);
  assert.equal(readPlace('la-tarte'), null);
  const place = { place_id: 'ChIJ1', name: 'La Tarté', photos: [{ name: 'places/ChIJ1/photos/a', width: 1, height: 1, author: null }] };
  writePlace('la-tarte', place);
  assert.equal(hasPlace('la-tarte'), true);
  assert.deepEqual(readPlace('la-tarte'), place);
  assert.ok(fs.existsSync(path.join(tmp, 'places', 'la-tarte', 'place.json')));
});
