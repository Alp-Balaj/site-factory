import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { allowedTypesFor, cachePath, firstName, guessVertical, rejectReason, toPlace } from './lead-search.mjs';
import { runJob } from '../lib/jobs.mjs';
import { readPlace } from '../lib/place.mjs';
import { readState, transition } from '../lib/state.mjs';

const KEY = 'TEST-KEY-abc123';

// A Places API (v1) result the way searchText returns it, with the maximum of 10 photos and 5 reviews.
function apiPlace(over = {}) {
  const photos = Array.from({ length: 10 }, (_, i) => ({
    name: `places/ChIJgresa/photos/AVo${i}`, widthPx: 4032 + i, heightPx: 3024,
    authorAttributions: [{ displayName: `Author ${i}`, uri: `https://maps.google.com/maps/contrib/${i}`, photoUri: 'https://lh3.googleusercontent.com/x' }],
  }));
  const reviews = Array.from({ length: 5 }, (_, i) => ({
    rating: 5 - (i % 2), text: { text: `Review ${i}` }, authorAttribution: { displayName: `Arta Berisha ${i}`, uri: 'https://maps.google.com/maps/contrib/9' },
  }));
  return {
    id: 'ChIJgresa', displayName: { text: 'Princesha Gresa Restaurant' }, formattedAddress: 'Rr. X, Prishtinë',
    internationalPhoneNumber: '+383 44 111 222', websiteUri: 'https://restaurantgresa-ks.com/', rating: 4.6, userRatingCount: 1200,
    location: { latitude: 42.66, longitude: 21.16 }, googleMapsUri: 'https://maps.google.com/?cid=1',
    primaryType: 'restaurant', types: ['restaurant', 'food', 'point_of_interest', 'establishment'], businessStatus: 'OPERATIONAL',
    regularOpeningHours: { weekdayDescriptions: ['e hënë: 8:00 p.d. – 11:00 m.d.'] },
    photos, reviews, ...over,
  };
}

test('guessVertical and allowedTypesFor', () => {
  assert.equal(guessVertical('restorant'), 'restaurant');
  assert.equal(guessVertical('Kafe'), 'restaurant');
  assert.equal(guessVertical('dentist'), 'dentist');
  assert.equal(guessVertical('bujtina'), 'guesthouse');
  assert.equal(guessVertical('autoservis'), 'auto');
  assert.equal(guessVertical('floktore'), null);
  assert.ok(allowedTypesFor({ vertical: 'restaurant' }).has('cafe'));
  assert.deepEqual([...allowedTypesFor({ types: 'cafe, bar', vertical: 'restaurant' })], ['cafe', 'bar']);
  assert.deepEqual([...allowedTypesFor({ types: ['pub'], vertical: null })], ['pub']);
  assert.equal(allowedTypesFor({ types: '', vertical: null }), null);
});

test('rejectReason drops addresses, closed places and wrong types, keeps *_restaurant', () => {
  const allowedTypes = allowedTypesFor({ vertical: 'restaurant' });
  const opts = { allowedTypes, vertical: 'restaurant' };
  assert.equal(rejectReason({ type: null, types: ['street_address', 'point_of_interest'] }, opts), 'not a business (address/home/area)');
  assert.equal(rejectReason({ type: 'restaurant', types: ['restaurant'], business_status: 'CLOSED_PERMANENTLY' }, opts), 'not operating (CLOSED_PERMANENTLY)');
  assert.equal(rejectReason({ type: 'hair_salon', types: ['hair_salon', 'establishment'], business_status: 'OPERATIONAL' }, opts), 'wrong type (hair_salon)');
  assert.equal(rejectReason({ type: 'brunch_restaurant', types: ['brunch_restaurant', 'food'], business_status: 'OPERATIONAL' }, opts), null);
  assert.equal(rejectReason({ type: 'cafe', types: ['cafe'], business_status: 'OPERATIONAL' }, opts), null);
  assert.equal(rejectReason({ type: 'hair_salon', types: ['hair_salon'], business_status: 'OPERATIONAL' }, { allowedTypes: null }), null);
});

test('toPlace keeps all 10 photos as names with attribution and up to 5 reviews with first names, no key anywhere', () => {
  const place = toPlace(apiPlace(), { query: 'restorant', city: 'Prishtinë', vertical: 'restaurant', fetchedAt: '2026-09-12T10:00:00Z' });
  assert.equal(place.place_id, 'ChIJgresa');
  assert.equal(place.name, 'Princesha Gresa Restaurant');
  assert.equal(place.city, 'Prishtinë');
  assert.equal(place.phone, '+383 44 111 222');
  assert.equal(place.website, 'https://restaurantgresa-ks.com/');
  assert.equal(place.vertical, 'restaurant');
  assert.equal(place.query, 'restorant');
  assert.equal(place.source, 'places-api');
  assert.equal(place.fetched_at, '2026-09-12T10:00:00Z');
  assert.equal(place.photos.length, 10);
  assert.deepEqual(place.photos[3], {
    name: 'places/ChIJgresa/photos/AVo3', width: 4035, height: 3024,
    author: { name: 'Author 3', uri: 'https://maps.google.com/maps/contrib/3' },
  });
  assert.equal(place.review_snippets.length, 5);
  assert.deepEqual(place.review_snippets[0], { text: 'Review 0', author: 'Arta', rating: 5 });
  assert.deepEqual(place.review_snippets[1], { text: 'Review 1', author: 'Arta', rating: 4 });
  const json = JSON.stringify(place);
  assert.ok(!/key=/.test(json) && !json.includes('/media?'), 'no media URL in the record');
});

test('toPlace tolerates missing optional fields and caps at 10 photos and 5 reviews', () => {
  const many = apiPlace({ photos: Array.from({ length: 14 }, (_, i) => ({ name: `places/x/photos/${i}` })), reviews: Array.from({ length: 8 }, () => ({ text: { text: 'ok' } })) });
  const place = toPlace(many, { query: 'kafe', city: 'Pejë', vertical: null });
  assert.equal(place.photos.length, 10);
  assert.deepEqual(place.photos[0], { name: 'places/x/photos/0', width: null, height: null, author: null });
  assert.equal(place.review_snippets.length, 5);
  assert.deepEqual(place.review_snippets[0], { text: 'ok', author: '', rating: null });
  assert.equal(place.vertical, 'kafe'); // unknown vertical: the keyword itself
  const bare = toPlace({ id: 'x' }, { query: 'kafe', city: 'Pejë', vertical: 'restaurant' });
  assert.equal(bare.name, '');
  assert.deepEqual(bare.photos, []);
  assert.deepEqual(bare.review_snippets, []);
  assert.equal(bare.phone, null);
  assert.equal(bare.website, null);
  assert.equal(firstName('  Arta B. '), 'Arta');
  assert.equal(firstName(undefined), '');
});

test('cachePath slugifies query and city', () => {
  assert.equal(cachePath('restorant', 'Prishtinë'), path.join('leads/out', 'restorant-prishtine.json'));
});

// --- the job through the queue, with Google stubbed -------------------------------------------------------------

let tmp, cwd, realFetch, prevKey;
const calls = [];
// Two pages: page 1 has a real-website restaurant, an Instagram-only cafe, a home address and a closed place;
// page 2 has a second place with the same name as the cafe (slug collision) and a wrong-type hit.
const pages = {
  undefined: {
    places: [
      apiPlace(),
      apiPlace({ id: 'ChIJcafe1', displayName: { text: 'Kafe Kosova' }, websiteUri: 'https://www.instagram.com/kafekosova', primaryType: 'cafe', types: ['cafe', 'food'], reviews: [] }),
      apiPlace({ id: 'ChIJhome', displayName: { text: 'Rruga B' }, primaryType: undefined, types: ['street_address'], photos: [], reviews: [] }),
      apiPlace({ id: 'ChIJclosed', displayName: { text: 'Old Place' }, businessStatus: 'CLOSED_PERMANENTLY' }),
    ],
    nextPageToken: 'p2',
  },
  p2: {
    places: [
      apiPlace({ id: 'ChIJcafe2XYZ', displayName: { text: 'Kafe Kosova' }, websiteUri: undefined, primaryType: 'cafe', types: ['cafe'] }),
      apiPlace({ id: 'ChIJsalon', displayName: { text: 'Salon Ana' }, primaryType: 'hair_salon', types: ['hair_salon', 'establishment'] }),
    ],
  },
};

before(() => {
  cwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-lead-search-'));
  process.env.PLACES_DIR = path.join(tmp, 'places');
  delete process.env.AUTO_COMMIT;
  prevKey = process.env.GOOGLE_PLACES_KEY;
  process.env.GOOGLE_PLACES_KEY = KEY;
  process.chdir(tmp); // leads/out and the root jobs/ folder land here
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const page = pages[body.pageToken];
    return { ok: true, status: 200, json: async () => page, text: async () => JSON.stringify(page) };
  };
});
after(() => {
  globalThis.fetch = realFetch;
  if (prevKey === undefined) delete process.env.GOOGLE_PLACES_KEY; else process.env.GOOGLE_PLACES_KEY = prevKey;
  delete process.env.PLACES_DIR;
  process.chdir(cwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Every file under a folder, as text, for "no key on disk" checks.
function allText(dir) {
  let out = '';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    out += entry.isDirectory() ? allText(p) : fs.readFileSync(p, 'utf8');
  }
  return out;
}

test('lead-search writes each kept result as a found Place, drops the rest with a reason, caches the batch', async () => {
  const job = await runJob('lead-search', { params: { query: 'restorant', city: 'Prishtinë', pages: 3 } });
  assert.equal(job.status, 'done');
  assert.deepEqual(job.result, { found: 6, kept: 3, created: 3, updated: 0, dropped: 3, cache: path.join('leads/out', 'restorant-prishtine.json') });
  assert.equal(calls.length, 2, 'stops when there is no next page token');
  assert.equal(calls[0].headers['X-Goog-Api-Key'], KEY);
  assert.equal(calls[0].body.textQuery, 'restorant Prishtinë Kosovo');
  assert.equal(calls[1].body.pageToken, 'p2');

  const gresa = readPlace('princesha-gresa-restaurant');
  assert.equal(gresa.place_id, 'ChIJgresa');
  assert.equal(gresa.photos.length, 10);
  assert.equal(readState('princesha-gresa-restaurant').status, 'found');
  assert.equal(readState('princesha-gresa-restaurant').flags.hasRealWebsite, true);
  assert.match(readState('princesha-gresa-restaurant').log[0].reason, /lead search restorant Prishtinë/);

  assert.equal(readPlace('kafe-kosova').place_id, 'ChIJcafe1');
  assert.equal(readState('kafe-kosova').flags.hasRealWebsite, false, 'Instagram link is not a real website');
  assert.equal(readPlace('kafe-kosova-fe2xyz').place_id, 'ChIJcafe2XYZ', 'same name, other place: slug gets the place ID tail');
  assert.equal(readState('kafe-kosova-fe2xyz').flags.hasRealWebsite, false);

  assert.ok(!fs.existsSync(path.join(process.env.PLACES_DIR, 'rruga-b')));
  assert.ok(!fs.existsSync(path.join(process.env.PLACES_DIR, 'old-place')));
  assert.ok(!fs.existsSync(path.join(process.env.PLACES_DIR, 'salon-ana')));

  const log = fs.readFileSync(job.logPath, 'utf8');
  assert.match(log, /kept Princesha Gresa Restaurant -> princesha-gresa-restaurant \(found; real website/);
  assert.match(log, /kept Kafe Kosova -> kafe-kosova \(found; no real website \(https:\/\/www\.instagram\.com\/kafekosova\)/);
  assert.match(log, /kept Kafe Kosova -> kafe-kosova-fe2xyz \(found; no website/);
  assert.match(log, /dropped Rruga B: not a business/);
  assert.match(log, /dropped Old Place: not operating \(CLOSED_PERMANENTLY\)/);
  assert.match(log, /dropped Salon Ana: wrong type \(hair_salon\)/);
  assert.match(log, /6 found, 3 kept \(3 new, 0 known\), 3 dropped/);

  const cache = JSON.parse(fs.readFileSync(path.join(tmp, 'leads/out/restorant-prishtine.json'), 'utf8'));
  assert.equal(cache.length, 6);
  assert.equal(cache.find(c => c.place_id === 'ChIJgresa').slug, 'princesha-gresa-restaurant');
  assert.equal(cache.find(c => c.place_id === 'ChIJsalon').dropped, 'wrong type (hair_salon)');

  const everything = allText(tmp);
  assert.ok(!everything.includes(KEY), 'the API key is nowhere on disk');
  assert.ok(!everything.includes('/media?'), 'no photo media URL on disk');
});

test('rerunning refreshes place.json and never touches state.json of a known Place', async () => {
  transition('kafe-kosova', 'generating', 'test');
  const stateBefore = fs.readFileSync(path.join(process.env.PLACES_DIR, 'kafe-kosova', 'state.json'), 'utf8');
  const gresaState = fs.readFileSync(path.join(process.env.PLACES_DIR, 'princesha-gresa-restaurant', 'state.json'), 'utf8');
  pages.undefined.places[1].rating = 4.9; // Google changed its mind about the cafe

  const job = await runJob('lead-search', { params: { query: 'restorant', city: 'Prishtinë' } });
  assert.deepEqual({ kept: job.result.kept, created: job.result.created, updated: job.result.updated }, { kept: 3, created: 0, updated: 3 });
  assert.equal(readPlace('kafe-kosova').rating, 4.9);
  assert.equal(fs.readFileSync(path.join(process.env.PLACES_DIR, 'kafe-kosova', 'state.json'), 'utf8'), stateBefore);
  assert.equal(fs.readFileSync(path.join(process.env.PLACES_DIR, 'princesha-gresa-restaurant', 'state.json'), 'utf8'), gresaState);
  assert.equal(readState('kafe-kosova').status, 'generating');
  assert.match(fs.readFileSync(job.logPath, 'utf8'), /updated Kafe Kosova -> kafe-kosova \(place.json refreshed, state.json untouched/);
});

test('all=true keeps everything, types= narrows, and missing params fail the job', async () => {
  const all = await runJob('lead-search', { params: { query: 'restorant', city: 'Prishtinë', pages: 1, all: true } });
  assert.equal(all.result.dropped, 0);
  assert.equal(all.result.kept, 4);
  assert.equal(readState('salon-ana'), null, 'page 1 only');
  assert.equal(readState('old-place').status, 'found');

  const narrow = await runJob('lead-search', { params: { query: 'restorant', city: 'Prishtinë', pages: 1, types: 'cafe' } });
  assert.match(fs.readFileSync(narrow.logPath, 'utf8'), /dropped Princesha Gresa Restaurant: wrong type \(restaurant\)/);

  await assert.rejects(runJob('lead-search', { params: { query: 'restorant' } }), /params\.query and params\.city/);
  await assert.rejects(runJob('lead-search', { params: { query: 'restorant', city: 'Pejë', pages: 0 } }), /pages must be/);
  const saved = process.env.GOOGLE_PLACES_KEY;
  delete process.env.GOOGLE_PLACES_KEY;
  try { await assert.rejects(runJob('lead-search', { params: { query: 'restorant', city: 'Pejë' } }), /GOOGLE_PLACES_KEY/); }
  finally { process.env.GOOGLE_PLACES_KEY = saved; }
});
