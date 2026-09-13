import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverHandle, fetchPosts, handleFromWebsite, matchesPlace, normalizeHandle, postFromItem } from './instagram.mjs';

const place = { name: 'La Tarté', city: 'Prishtinë', website: null };

test('normalizeHandle strips @ and rejects what cannot be a handle', () => {
  assert.equal(normalizeHandle(' @La.Tarte_KS '), 'la.tarte_ks');
  assert.equal(normalizeHandle('la tarte'), null);
  assert.equal(normalizeHandle(''), null);
  assert.equal(normalizeHandle(null), null);
});

test('handleFromWebsite reads a profile link and ignores everything else', () => {
  assert.equal(handleFromWebsite('https://www.instagram.com/latarte.ks/'), 'latarte.ks');
  assert.equal(handleFromWebsite('instagram.com/LaTarte?igshid=abc'), 'latarte');
  assert.equal(handleFromWebsite('https://www.instagram.com/p/CxYz123/'), null);
  assert.equal(handleFromWebsite('https://www.instagram.com/reel/CxYz123/'), null);
  assert.equal(handleFromWebsite('https://la-tarte.com/'), null);
  assert.equal(handleFromWebsite('https://www.facebook.com/latarte'), null);
  assert.equal(handleFromWebsite(null), null);
});

test('matchesPlace accepts a profile name that slugifies to the Place name', () => {
  assert.equal(matchesPlace({ handle: 'latarte.ks', profileName: 'LA TARTE', confidence: 0.4, bio: '' }, place).ok, true);
  assert.equal(matchesPlace({ handle: 'latarte.ks', profileName: 'La Tarté', confidence: 0, bio: '' }, place).ok, true);
});

test('matchesPlace accepts high confidence only with the city in the bio', () => {
  assert.equal(matchesPlace({ handle: 'latarteks', profileName: 'La Tarté Bakery & Café', confidence: 0.9, bio: 'Bakery in Prishtinë since 2015' }, place).ok, true);
  assert.equal(matchesPlace({ handle: 'latarteks', profileName: 'La Tarté Bakery & Café', confidence: 0.9, bio: 'Bakery since 2015' }, place).ok, false);
  assert.equal(matchesPlace({ handle: 'latarteks', profileName: 'La Tarté Bakery & Café', confidence: 0.7, bio: 'Prishtinë' }, place).ok, false);
});

test('matchesPlace rejects a wrong name and a missing handle', () => {
  const wrong = matchesPlace({ handle: 'latarte_paris', profileName: 'La Tarte Tropézienne', confidence: 0.95, bio: 'Paris' }, place);
  assert.equal(wrong.ok, false);
  assert.match(wrong.why, /not "La Tarté"/);
  assert.equal(matchesPlace({ handle: '', profileName: 'La Tarté', confidence: 1 }, place).ok, false);
  assert.equal(matchesPlace(null, place).ok, false);
});

test('discoverHandle: a manual handle in state wins over the website and the search', async () => {
  let searched = false;
  const state = { instagram: { handle: '@ByHand', how: 'manual' } };
  const r = await discoverHandle({ ...place, website: 'https://www.instagram.com/fromsite/' }, state, { search: async () => { searched = true; return null; } });
  assert.deepEqual(r, { handle: 'byhand', how: 'manual' });
  assert.equal(searched, false);
  // a handle with no `how` (typed in before the Portal stamped it) counts as manual too
  assert.deepEqual(await discoverHandle(place, { instagram: { handle: 'byhand', how: '' } }, { search: async () => null }), { handle: 'byhand', how: 'manual' });
});

test('discoverHandle: the Google website link comes before the search', async () => {
  let searched = false;
  const r = await discoverHandle({ ...place, website: 'https://www.instagram.com/latarte.ks/' }, null, { search: async () => { searched = true; return null; } });
  assert.deepEqual(r, { handle: 'latarte.ks', how: 'google' });
  assert.equal(searched, false);
});

test('discoverHandle: the search result is accepted only when it matches, and a failing search is not fatal', async () => {
  const logs = [];
  const log = (l) => logs.push(l);
  const good = await discoverHandle(place, null, { search: async () => ({ handle: 'latarte.ks', profileName: 'La Tarte', confidence: 0.5, bio: '' }), log });
  assert.deepEqual(good, { handle: 'latarte.ks', how: 'search' });
  const bad = await discoverHandle(place, null, { search: async () => ({ handle: 'tarte_paris', profileName: 'Tarte Paris', confidence: 0.99, bio: 'Paris' }), log });
  assert.equal(bad, null);
  assert.ok(logs.some(l => /rejected/.test(l)));
  const none = await discoverHandle(place, null, { search: async () => { throw new Error('offline'); }, log });
  assert.equal(none, null);
  assert.ok(logs.some(l => /search failed: offline/.test(l)));
  // a previously discovered (non-manual) handle does not short-circuit discovery
  const redo = await discoverHandle({ ...place, website: 'https://www.instagram.com/newsite/' }, { instagram: { handle: 'old', how: 'search' } }, { search: async () => null });
  assert.deepEqual(redo, { handle: 'newsite', how: 'google' });
});

test('fetchPosts posts the actor input and maps items; no token throws', async () => {
  await assert.rejects(fetchPosts('latarte.ks', 20, { token: '' }), /APIFY_TOKEN/);
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, body: JSON.parse(init.body) };
    return {
      ok: true,
      json: async () => [
        { type: 'Image', url: 'https://www.instagram.com/p/AAA/', displayUrl: 'https://cdn/aaa.jpg', caption: ' Tarta e mollës ', timestamp: '2026-09-01T10:00:00.000Z' },
        { type: 'Video', shortCode: 'VVV', displayUrl: null },
        { type: 'Sidecar', shortCode: 'SSS', images: ['https://cdn/sss1.jpg'], caption: '' },
        { error: 'not_found' },
      ],
    };
  };
  const posts = await fetchPosts('@LaTarte.ks', 20, { token: 't0k', fetchImpl });
  assert.match(seen.url, /apify~instagram-scraper\/run-sync-get-dataset-items\?token=t0k/);
  assert.deepEqual(seen.body.directUrls, ['https://www.instagram.com/latarte.ks/']);
  assert.equal(seen.body.resultsLimit, 20);
  assert.deepEqual(posts, [
    { url: 'https://www.instagram.com/p/AAA/', image: 'https://cdn/aaa.jpg', caption: 'Tarta e mollës', timestamp: '2026-09-01T10:00:00.000Z' },
    { url: 'https://www.instagram.com/p/SSS/', image: 'https://cdn/sss1.jpg', caption: '', timestamp: null },
  ]);
  assert.equal(postFromItem({ type: 'Image', url: 'x' }), null);
});
