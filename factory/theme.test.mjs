import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadArchetypes } from './lib/archetypes.mjs';
import { DEFAULT_LAYOUT, FALLBACK_THEME, FONTS, LAYOUT, contrast, fixTheme } from './theme.mjs';

// A theme that needs no repair: every surface readable, catalogue faces, valid layout.
const good = {
  bg: '#F3F4EF', ink: '#1A1D18', primary: '#1D4A2F', accent: '#B2860F', muted: '#E6E8E0',
  display: 'Bricolage Grotesque', displayWeight: 700, body: 'Figtree', radius: '8px', frame: 'line',
  layout: { hero: 'split', menu: 'cards', gallery: 'strip', rhythm: 'airy', order: 'about-first' }, note: 'fine',
};

test('a good theme passes through unchanged', () => {
  const { theme, changes } = fixTheme(good);
  assert.deepEqual(changes, []);
  assert.deepEqual(theme.layout, good.layout);
  assert.equal(theme.display, 'Bricolage Grotesque');
  assert.deepEqual(theme.weights, { 'Bricolage Grotesque': [400, 500, 600, 700, 800], Figtree: [400, 500, 600, 700] });
});

test('contrast repair: ink is pushed to 7:1 on bg, coloured surfaces get a readable text colour, accent 3:1 on bg', () => {
  const { theme, changes } = fixTheme({ ...good, ink: '#8A8A80', primary: '#9A9A90', accent: '#E8E8E0' });
  assert.ok(contrast(theme.ink, theme.bg) >= 7, `ink/bg ${contrast(theme.ink, theme.bg)}`);
  assert.ok(Math.max(contrast(theme.ink, theme.primary), contrast(theme.bg, theme.primary)) >= 4.5, 'text on primary');
  assert.ok(contrast(theme.accent, theme.bg) >= 3, 'accent on bg');
  assert.ok(changes.some(c => c.startsWith('ink ')));
  assert.ok(changes.some(c => c.startsWith('primary ')));
  assert.ok(changes.some(c => c.startsWith('accent ')));
});

test('malformed colours fall back to the plain theme token', () => {
  const { theme, changes } = fixTheme({ ...good, bg: 'cream', muted: 12 });
  assert.equal(theme.bg, FALLBACK_THEME.bg);
  assert.equal(theme.muted, FALLBACK_THEME.muted);
  assert.equal(changes.filter(c => /not a hex colour/.test(c)).length, 2);
});

test('font snapping: unknown faces go to the fallback, weights snap to what the face carries', () => {
  const { theme, changes } = fixTheme({ ...good, display: 'Playfair Display', body: 'Inter', displayWeight: 650 });
  assert.equal(theme.display, FALLBACK_THEME.display);
  assert.equal(theme.body, FALLBACK_THEME.body);
  assert.ok(changes.some(c => c.includes('"Playfair Display" is not in the catalogue')));
  assert.ok(changes.some(c => c.includes('"Inter" is not in the catalogue')));
  const archivo = FONTS.display.find(f => f.name === 'Archivo');
  assert.ok(archivo.w.includes(theme.displayWeight));
  const single = fixTheme({ ...good, display: 'Anton', displayWeight: 800 });
  assert.equal(single.theme.displayWeight, 400, 'Anton only carries 400');
  assert.ok(single.changes.some(c => c.startsWith('displayWeight 800 -> 400')));
  assert.deepEqual(single.theme.weights.Anton, [400]);
});

test('layout defaults: a missing layout is filled with photo/list/grid/tight/menu-first and is not a repair', () => {
  const { layout, ...rest } = good;
  const { theme, changes } = fixTheme(rest);
  assert.deepEqual(changes, []);
  assert.deepEqual(theme.layout, DEFAULT_LAYOUT);
  const partial = fixTheme({ ...rest, layout: { menu: 'board' } });
  assert.deepEqual(partial.changes, []);
  assert.deepEqual(partial.theme.layout, { ...DEFAULT_LAYOUT, menu: 'board' });
});

test('layout defaults can come from the archetype', () => {
  const { layout, ...rest } = good;
  const defaults = { hero: 'type', menu: 'board', gallery: 'strip', rhythm: 'tight', order: 'menu-first' };
  const { theme, changes } = fixTheme(rest, { layoutDefaults: defaults });
  assert.deepEqual(changes, []);
  assert.deepEqual(theme.layout, defaults);
});

test('enum repair: an unknown layout value goes back to the default with a note', () => {
  const { theme, changes } = fixTheme({ ...good, layout: { ...good.layout, hero: 'video', gallery: 'masonry' } });
  assert.equal(theme.layout.hero, DEFAULT_LAYOUT.hero);
  assert.equal(theme.layout.gallery, DEFAULT_LAYOUT.gallery);
  assert.equal(theme.layout.menu, 'cards');
  assert.ok(changes.some(c => c.startsWith('layout.hero "video" -> photo')));
  assert.ok(changes.some(c => c.startsWith('layout.gallery "masonry" -> grid')));
  const bad = fixTheme({ ...good, layout: 'photo' });
  assert.deepEqual(bad.theme.layout, DEFAULT_LAYOUT);
});

test('no photos forces hero "type" and gallery "none"', () => {
  const { theme, changes } = fixTheme(good, { hasPhotos: false });
  assert.equal(theme.layout.hero, 'type');
  assert.equal(theme.layout.gallery, 'none');
  assert.equal(theme.layout.menu, 'cards', 'the rest is kept');
  assert.equal(changes.length, 2);
  const already = fixTheme({ ...good, layout: { ...good.layout, hero: 'type', gallery: 'none' } }, { hasPhotos: false });
  assert.deepEqual(already.changes, []);
});

test('frame and radius: unknown values are repaired, a missing value is the default', () => {
  const { theme, changes } = fixTheme({ ...good, frame: 'dashed', radius: 'round' });
  assert.equal(theme.frame, FALLBACK_THEME.frame);
  assert.equal(theme.radius, FALLBACK_THEME.radius);
  assert.equal(changes.length, 2);
  const { frame, radius, ...rest } = good;
  assert.deepEqual(fixTheme(rest).changes, []);
});

test('the plain fallback theme and every archetype layout pass fixTheme without changes', () => {
  assert.deepEqual(fixTheme(FALLBACK_THEME).changes, []);
  const { archetypes, default: def } = loadArchetypes('restaurant');
  assert.equal(Object.keys(archetypes).length, 7);
  assert.ok(archetypes[def], `default ${def} exists`);
  for (const [id, a] of Object.entries(archetypes)) {
    for (const k of Object.keys(LAYOUT)) assert.ok(LAYOUT[k].includes(a.layout[k]), `${id}.layout.${k} = ${a.layout[k]}`);
    assert.deepEqual(fixTheme({ ...good, layout: a.layout }).changes, [], id);
    for (const k of ['label', 'copyBrief', 'fontBias']) assert.ok(a[k]?.length, `${id}.${k}`);
    assert.ok(a.itemGroups.length >= 3, `${id}.itemGroups`);
  }
});
