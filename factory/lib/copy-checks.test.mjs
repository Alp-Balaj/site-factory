import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCopy, checkDash, checkLanguage, copyStrings, stopwordHits } from './copy-checks.mjs';

const base = () => ({
  business: { name: 'Te Ymeri', tagline: 'Skara e vërtetë e Prishtinës.', phone: '+383 44 000 000' },
  hero: { headline: 'Çdo vizitë fillon me kafé të mirë.', sub: 'Ambient modern, atmosferë relaksuese dhe ushqim i vërtetë.' },
  about: { title: 'Shija fillon nga kujdesi.', text: 'Ushqim i mirë, shërbim i shpejtë, ambient i ngrohtë. Njerëzit vijnë herët dhe kthehen pasdite.' },
  items: [
    { group: 'Skara', name: 'Qebapa', desc: 'Dhjetë copë, me qepë dhe bukë të ngrohtë.', price: '4.00 €' },
    { group: 'Skara', name: 'Pleskavicë', desc: 'E mbushur me kaçkavall.', price: '4.50 €' },
  ],
  theme: { bg: '#FFFFFF', note: 'walnut chairs — pendant lamps drove the display face' },
  meta: { source: 'places-api' },
});

test('clean Albanian copy passes both checks', () => {
  for (const r of checkCopy(base())) assert.equal(r.ok, true, `${r.id}: ${r.detail}`);
});

test('an em dash or en dash in any copy string fails copy-dash with the text quoted', () => {
  const c = base();
  c.hero.headline = 'Skara — që nga 1998';
  const r = checkDash(c);
  assert.equal(r.ok, false);
  assert.match(r.detail, /hero\.headline "Skara — që nga 1998"/);

  const d = base();
  d.items[1].desc = 'Kafe 7:00 – 22:00';
  assert.equal(checkDash(d).ok, false);
  assert.match(checkDash(d).detail, /items\[1\]\.desc/);
});

test('theme.note and meta are not copy: a dash there is fine', () => {
  assert.equal(checkDash(base()).ok, true);
  assert.ok(!copyStrings(base()).some(s => s.path.startsWith('theme') || s.path.startsWith('meta')));
});

test('English in the hero fails copy-language', () => {
  const c = base();
  c.hero.sub = 'The best grill in town, with our famous kebabs and the warmest welcome.';
  const r = checkLanguage(c);
  assert.equal(r.ok, false);
  assert.match(r.detail, /hero\.sub reads foreign \(the×2, and×1, with×1, our×1\)/);
});

test('Serbian in an item fails copy-language; Cyrillic fails outright', () => {
  const c = base();
  c.items[0].desc = 'Restoran je otvoren svaki dan i nudi jela sa rostilja.';
  const r = checkLanguage(c);
  assert.equal(r.ok, false);
  assert.match(r.detail, /items\[0\]\.desc reads foreign/);

  const d = base();
  d.about.text = 'Добродошли у наш ресторан.';
  assert.match(checkLanguage(d).detail, /about\.text has Cyrillic/);
});

test('Albanian "i", "je" and "sa" do not count in a text that carries ë or ç', () => {
  assert.deepEqual(stopwordHits('Ushqim i mirë, shërbim i shpejtë, ambient i ngrohtë, sa herë që je këtu.'), {});
  assert.deepEqual(stopwordHits('Restoran je otvoren svaki dan i nudi jela sa rostilja'), { i: 1, je: 1, sa: 1 });
  assert.deepEqual(stopwordHits('The team and the chef'), { the: 2, and: 1 });
});

test('two stopword hits in one unit are tolerated; three are not', () => {
  const c = base();
  c.items[0].name = 'Fish and chips';           // one hit
  c.items[0].desc = 'Me patate dhe salcë tartar.';
  assert.equal(checkLanguage(c).ok, true);
  c.items[0].desc = 'With chips and the sauce.'; // three hits in one unit
  assert.equal(checkLanguage(c).ok, false);
});

test('units are checked one at a time, so hits do not add up across items', () => {
  const c = base();
  c.items = Array.from({ length: 5 }, (_, i) => ({ name: `Item ${i}`, desc: 'Fish and chips', price: '1 €' }));
  assert.equal(checkLanguage(c).ok, true);
});

test('a config with missing sections does not throw', () => {
  for (const r of checkCopy({})) assert.equal(r.ok, true);
  for (const r of checkCopy(null)) assert.equal(r.ok, true);
});
