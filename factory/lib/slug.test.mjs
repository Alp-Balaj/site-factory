import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueSlug } from './slug.mjs';

test('slugify lowercases, strips accents and ë, collapses separators', () => {
  assert.equal(slugify('La Tarté'), 'la-tarte');
  assert.equal(slugify('Princesha Gresa Restaurant'), 'princesha-gresa-restaurant');
  assert.equal(slugify('  Qebaptore "Kosova" !!'), 'qebaptore-kosova');
  assert.equal(slugify('Ëmbëltore Çelë'), 'embeltore-cele');
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
});

test('uniqueSlug keeps the plain slug when the folder is free or belongs to the same place', () => {
  assert.equal(uniqueSlug('La Tarté', 'ChIJbd7VBgCfVBMRvgjTEHIkyII', { existingPlaceId: () => null }), 'la-tarte');
  assert.equal(uniqueSlug('La Tarté', 'ChIJbd7VBgCfVBMRvgjTEHIkyII', { existingPlaceId: () => 'ChIJbd7VBgCfVBMRvgjTEHIkyII' }), 'la-tarte');
});

test('uniqueSlug appends the tail of the place ID when another place owns the folder', () => {
  const slug = uniqueSlug('La Tarté', 'ChIJh9_cEW6fVBMRhDkRZ9OXE70', { existingPlaceId: () => 'ChIJbd7VBgCfVBMRvgjTEHIkyII' });
  assert.equal(slug, 'la-tarte-9oxe70');
  assert.notEqual(slug, 'la-tarte');
});

test('uniqueSlug without a place ID is plain slugify', () => {
  assert.equal(uniqueSlug('Liburnia', undefined, { existingPlaceId: () => 'other' }), 'liburnia');
});
