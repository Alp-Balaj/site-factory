// Copy checks over a config.json: pure functions, no I/O. The QA gate (factory/lib/qa/hard.mjs) runs them as hard
// checks; generation may run them before handing a config to QA. Each check returns { id, ok, detail }.
//
//   copy-dash      no U+2013 (en dash) or U+2014 (em dash) in any copy string. theme.* and meta.* are not copy
//                  (theme.note is an English note for the operator) and are skipped.
//   copy-language  no foreign-language leak in hero, about, tagline or item text: a text unit fails when the stopwords
//                  below appear as whole words more than twice, or when it contains Cyrillic.
//
// "i", "je" and "sa" are Serbian function words but also everyday Albanian ones ("ushqim i mirë", "ti je", "sa herë"),
// so those three count only in a text with no ë or ç: Albanian prose of any length carries ë, Serbian never does.

export const DASHES = /[–—]/;
export const CYRILLIC = /[Ѐ-ӿ]/;
export const STOPWORDS = ['the', 'and', 'with', 'our', 'i', 'je', 'sa'];
const AMBIGUOUS = new Set(['i', 'je', 'sa']);
const MAX_HITS = 2;

const wholeWord = (w) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, 'giu');

// Every string in the config with its dotted path, skipping the keys that are not copy.
export function copyStrings(config, skip = ['theme', 'meta']) {
  const out = [];
  const walk = (v, p) => {
    if (typeof v === 'string') out.push({ path: p, text: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!(p === '' && skip.includes(k))) walk(x, p ? `${p}.${k}` : k);
  };
  walk(config ?? {}, '');
  return out;
}

// The text units the language check reads: hero, about, tagline, and every item's name and desc, each on its own.
export function copyUnits(config) {
  const c = config ?? {};
  const units = [
    ['hero.headline', c.hero?.headline], ['hero.sub', c.hero?.sub],
    ['about.title', c.about?.title], ['about.text', c.about?.text],
    ['business.tagline', c.business?.tagline],
  ];
  (Array.isArray(c.items) ? c.items : []).forEach((it, i) => { units.push([`items[${i}].name`, it?.name], [`items[${i}].desc`, it?.desc]); });
  return units.filter(([, t]) => typeof t === 'string' && t.trim()).map(([path, text]) => ({ path, text }));
}

const quote = (s, n = 60) => `"${s.length > n ? s.slice(0, n - 1) + '…' : s}"`;
const result = (id, detail) => (detail ? { id, ok: false, detail } : { id, ok: true });

export function checkDash(config) {
  const hits = copyStrings(config).filter(({ text }) => DASHES.test(text));
  return result('copy-dash', hits.length ? `long dash in ${hits.map(h => `${h.path} ${quote(h.text)}`).join('; ')}` : '');
}

// Stopword hits in one text, honouring the Albanian exception for the ambiguous three.
export function stopwordHits(text) {
  const albanian = /[ëçËÇ]/.test(text);
  const hits = {};
  for (const w of STOPWORDS) {
    if (albanian && AMBIGUOUS.has(w)) continue;
    const n = (text.match(wholeWord(w)) ?? []).length;
    if (n) hits[w] = n;
  }
  return hits;
}

export function checkLanguage(config) {
  const leaks = [];
  for (const { path, text } of copyUnits(config)) {
    if (CYRILLIC.test(text)) { leaks.push(`${path} has Cyrillic ${quote(text)}`); continue; }
    const hits = stopwordHits(text);
    const total = Object.values(hits).reduce((a, b) => a + b, 0);
    if (total > MAX_HITS) leaks.push(`${path} reads foreign (${Object.entries(hits).map(([w, n]) => `${w}×${n}`).join(', ')}) ${quote(text)}`);
  }
  return result('copy-language', leaks.join('; '));
}

export function checkCopy(config) {
  return [checkDash(config), checkLanguage(config)];
}
