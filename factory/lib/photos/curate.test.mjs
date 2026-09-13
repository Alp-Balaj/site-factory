import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { applyVision, curate, fallbackPicks } from './curate.mjs';
import { mergePool, normalizeEntry } from './pool.mjs';
import { saveOriginal, resize } from './store.mjs';

const entry = (id, source, orientation) => ({ id, source, ref: `${source}:${id}`, orientation });

test('fallbackPicks: first landscape Google photo is the hero, the next four the gallery', () => {
  const pool = [entry('g01', 'google', 'portrait'), entry('g02', 'google', 'landscape'), entry('g03', 'google', 'landscape'),
    entry('i01', 'instagram', 'square'), entry('i02', 'instagram', 'landscape'), entry('g04', 'google', 'landscape'), entry('g05', 'google', 'landscape')];
  assert.deepEqual(fallbackPicks(pool), { hero: 'g02', gallery: ['g01', 'g03', 'i01', 'i02'] });
});

test('fallbackPicks degrades: any Google photo, then any landscape, then anything; empty pool gives nulls', () => {
  assert.equal(fallbackPicks([entry('g01', 'google', 'portrait'), entry('i01', 'instagram', 'landscape')]).hero, 'g01');
  assert.equal(fallbackPicks([entry('i01', 'instagram', 'portrait'), entry('i02', 'instagram', 'landscape')]).hero, 'i02');
  assert.deepEqual(fallbackPicks([entry('i01', 'instagram', 'portrait')]), { hero: 'i01', gallery: [] });
  assert.deepEqual(fallbackPicks([]), { hero: null, gallery: [] });
});

test('applyVision writes clamped scores onto the pool and repairs the picks', () => {
  const pool = ['g01', 'g02', 'g03', 'g04', 'g05', 'g06'].map(id => entry(id, 'google', 'landscape'));
  const result = {
    photos: [
      { id: 'g01', food: 9, room: -1, exterior: 2.6, people: 0, textHeavy: 0, dark: 0, orientation: 'portrait' },
      { id: 'zzz', food: 1, room: 1, exterior: 1, people: 1, textHeavy: 1, dark: 1, orientation: 'landscape' },
    ],
    hero: 'g03',
    gallery: ['g03', 'g01', 'nope', 'g05', 'g05'],
    note: '  Room shot in daylight.  ',
  };
  const picks = applyVision(pool, result);
  assert.deepEqual(pool[0].scores, { food: 5, room: 0, exterior: 3, people: 0, textHeavy: 0, dark: 0 });
  assert.equal(pool[0].orientation, 'portrait');
  assert.equal(pool[1].scores, undefined);
  assert.equal(picks.hero, 'g03');
  assert.deepEqual(picks.gallery, ['g01', 'g05', 'g02', 'g04']); // hero and unknowns dropped, topped up to four in pool order
  assert.equal(picks.note, 'Room shot in daylight.');
  // an unknown hero falls back to the mechanical pick; a long gallery is cut at eight
  const many = Array.from({ length: 12 }, (_, i) => entry(`g${String(i + 1).padStart(2, '0')}`, 'google', 'landscape'));
  const p2 = applyVision(many, { photos: [], hero: 'ghost', gallery: many.map(m => m.id), note: '' });
  assert.equal(p2.hero, 'g01');
  assert.equal(p2.gallery.length, 8);
  assert.ok(!p2.gallery.includes('g01'));
});

test('mergePool keeps ids stable by ref and numbers new entries per source', () => {
  const existing = [{ id: 'g01', source: 'google', ref: 'a', web: 'photos/g01-1600.webp', scores: { food: 3 } }, { id: 'i01', source: 'instagram', ref: 'p1' }];
  const merged = mergePool(existing, [{ source: 'google', ref: 'a', caption: '' }, { source: 'google', ref: 'b' }, { source: 'instagram', ref: 'p2', caption: 'x' }, { source: 'instagram', ref: 'p1', caption: 'kept' }]);
  assert.deepEqual(merged.map(m => [m.id, m.ref]), [['g01', 'a'], ['i01', 'p1'], ['g02', 'b'], ['i02', 'p2']]);
  assert.equal(merged[0].web, 'photos/g01-1600.webp');
  assert.deepEqual(merged[0].scores, { food: 3 });
  assert.equal(merged[1].caption, 'kept'); // a gap is filled from the fresh entry
  assert.deepEqual(Object.keys(normalizeEntry(merged[3])), ['id', 'source', 'ref', 'author', 'caption', 'width', 'height', 'orientation', 'original', 'web', 'thumb', 'scores']);
});

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-curate-')); process.env.PLACES_DIR = path.join(tmp, 'places'); });
after(() => { delete process.env.PLACES_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

test('curate without vision never calls Claude; with a stubbed ask it sends the thumbs and applies the result', async () => {
  const slug = 'c1';
  const pool = [];
  for (const [id, w, h] of [['g01', 900, 1200], ['g02', 1200, 900], ['g03', 1200, 900]]) {
    await saveOriginal(slug, id, await sharp({ create: { width: w, height: h, channels: 3, background: '#888' } }).jpeg().toBuffer());
    await resize(slug, id);
    pool.push({ id, source: 'google', ref: id, orientation: w > h ? 'landscape' : 'portrait', caption: '' });
  }
  let asked = 0;
  const off = await curate(slug, { name: 'X' }, pool, { vision: false, ask: async () => { asked++; } });
  assert.equal(asked, 0);
  assert.equal(off.hero, 'g02');
  assert.match(off.note, /without vision/);

  let prompt, images;
  const ask = async (p, imgs) => {
    asked++; prompt = p; images = imgs;
    return { photos: pool.map(x => ({ id: x.id, food: 1, room: 4, exterior: 0, people: 0, textHeavy: 0, dark: 0, orientation: x.orientation })), hero: 'g03', gallery: ['g02', 'g01'], note: 'g03 shows the room.' };
  };
  const on = await curate(slug, { name: 'X', city: 'Prishtinë' }, pool, { ask });
  assert.equal(asked, 1);
  assert.equal(images.length, 3);
  assert.equal(images[0].source.media_type, 'image/webp');
  assert.match(prompt, /id=g01 source=google orientation=portrait/);
  assert.match(prompt, /hero must be landscape/);
  assert.deepEqual(on, { hero: 'g03', gallery: ['g02', 'g01'], note: 'g03 shows the room.' });
  assert.equal(pool[1].scores.room, 4);
});
