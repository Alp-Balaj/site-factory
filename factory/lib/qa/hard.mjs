// Hard QA checks: computed, no Claude. Every check returns { id, ok, detail } and is exported on its own so tests can
// hit it with a fixture (factory/lib/qa/fixtures/); runHard(slug) runs them all against a Place, in the order state.qa
// lists them. A check that cannot run (no build) reports ok: false with the reason instead of throwing.
//
//   build              places/<slug>/build/index.html exists
//   images             every <img src> in the built page answers (local file exists, or HTTP HEAD then GET returns 200)
//   phone              business.phone or business.whatsapp is set (item 30: a missing phone fails QA, not generation)
//   items              at least MIN_ITEMS items
//   contrast           every theme surface passes the thresholds fixTheme repairs to (ink/bg 7:1, a readable text
//                      colour on primary, accent and muted at 4.5:1, accent on bg 3:1), using contrast() from theme.mjs
//   hero-overflow-390  Playwright at 390 px: no element in the hero pokes past the viewport, the headline's text stays
//                      inside its own box
//   copy-dash, copy-language   factory/lib/copy-checks.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { checkCopy } from '../copy-checks.mjs';
import { buildDir, configPath, readJson } from '../paths.mjs';
import { contrast } from '../../theme.mjs';

export const MIN_ITEMS = 6;
export const MOBILE = { width: 390, height: 844 };
const FETCH_TIMEOUT_MS = 15000;

const filled = (v) => (typeof v === 'string' ? v.trim() !== '' : typeof v === 'number');
const result = (id, ok, detail = '') => ({ id, ok, ...(detail ? { detail } : {}) });

export const builtHtml = (slug) => path.join(buildDir(slug), 'index.html');

export function checkBuild(slug) {
  const html = builtHtml(slug);
  return fs.existsSync(html) ? result('build', true) : result('build', false, `${html} not found`);
}

// The src of every <img> in an HTML string, in document order, duplicates removed.
export function imageSources(html) {
  const out = [];
  for (const m of String(html).matchAll(/<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const src = (m[1] ?? m[2] ?? m[3] ?? '').replace(/&amp;/g, '&').trim();
    if (src && !out.includes(src)) out.push(src);
  }
  return out;
}

// One image: a local path is resolved against baseDir (a leading "/" means the build root); http(s) is HEAD then GET.
export async function imageResponds(src, baseDir, { fetchImpl = fetch } = {}) {
  if (/^data:/i.test(src)) return { ok: true };
  if (/^https?:\/\//i.test(src)) {
    for (const method of ['HEAD', 'GET']) {
      try {
        const r = await fetchImpl(src, { method, redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (r.ok) return { ok: true };
        if (method === 'GET') return { ok: false, why: String(r.status) };
      } catch (e) {
        if (method === 'GET') return { ok: false, why: e?.name === 'TimeoutError' ? 'timeout' : (e?.cause?.code ?? e?.cause?.errors?.[0]?.code ?? e?.cause?.message ?? e?.message ?? 'unreachable') };
      }
    }
    return { ok: false, why: 'unreachable' };
  }
  let local = src.replace(/^file:\/\//i, '').split(/[?#]/)[0];
  try { local = decodeURIComponent(local); } catch { /* keep as is */ }
  const file = path.join(baseDir, local); // index.html sits at the build root, so "/x" and "x" are the same file
  return fs.existsSync(file) ? { ok: true } : { ok: false, why: 'missing file' };
}

// A short label for an image in a detail line: the file name, or for a Places photo (…/photos/<id>/media) the id's head.
const short = (src) => {
  try {
    const parts = new URL(src).pathname.split('/').filter(Boolean);
    const name = parts.at(-1) === 'media' && parts.length > 1 ? `photo ${parts.at(-2).slice(0, 12)}…` : parts.at(-1) ?? src;
    return name.length > 40 ? name.slice(0, 39) + '…' : name;
  } catch { return src.length > 50 ? src.slice(0, 47) + '…' : src; }
};

// html: the built page as a string; baseDir: the folder it lives in.
export async function checkImages(html, baseDir, opts = {}) {
  const srcs = imageSources(html);
  if (!srcs.length) return result('images', true, 'no images');
  const failed = [];
  for (const src of srcs) {
    const r = await imageResponds(src, baseDir, opts);
    if (!r.ok) failed.push(`${short(src)} (${r.why})`);
  }
  return failed.length
    ? result('images', false, `${failed.length} of ${srcs.length} images failed: ${failed.join(', ')}`)
    : result('images', true, `${srcs.length} images`);
}

export async function checkImagesFor(slug, opts = {}) {
  const html = builtHtml(slug);
  if (!fs.existsSync(html)) return result('images', false, 'no build');
  return checkImages(fs.readFileSync(html, 'utf8'), path.dirname(html), opts);
}

export function checkPhone(config) {
  const b = config?.business ?? {};
  return filled(b.phone) || filled(b.whatsapp) ? result('phone', true) : result('phone', false, 'no phone');
}

export function checkItems(config, min = MIN_ITEMS) {
  const items = Array.isArray(config?.items) ? config.items : [];
  return items.length >= min ? result('items', true, `${items.length} items`) : result('items', false, `${items.length} items, need at least ${min}`);
}

const hexOk = (h) => typeof h === 'string' && /^#?[0-9a-f]{6}$/i.test(h.trim());

// Same thresholds fixTheme repairs to; here they are only measured. A theme that would be repaired is a theme the
// operator edited by hand into something unreadable.
export function checkContrast(theme) {
  const t = theme ?? {};
  const bad = ['bg', 'ink', 'primary', 'accent', 'muted'].filter(k => !hexOk(t[k]));
  if (bad.length) return result('contrast', false, `not a hex colour: ${bad.map(k => `${k}=${JSON.stringify(t[k])}`).join(', ')}`);
  const c = (a, b) => contrast(t[a], t[b]).toFixed(1);
  const fails = [];
  if (contrast(t.ink, t.bg) < 7) fails.push(`ink on bg ${c('ink', 'bg')}:1 < 7`);
  for (const k of ['primary', 'accent', 'muted']) {
    const best = Math.max(contrast(t.ink, t[k]), contrast(t.bg, t[k]));
    if (best < 4.5) fails.push(`no readable text on ${k} (best ${best.toFixed(1)}:1 < 4.5)`);
  }
  if (contrast(t.accent, t.bg) < 3) fails.push(`accent on bg ${c('accent', 'bg')}:1 < 3`);
  return fails.length ? result('contrast', false, fails.join('; ')) : result('contrast', true);
}

// Runs in the page: finds the hero and measures. Returns { hero, wide: [..], headline: [..] } or { hero: null }.
function measureHero() {
  const hero = document.querySelector('header.hero, .hero, header, [data-hero]');
  if (!hero) return { hero: null };
  const vw = window.innerWidth;
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;
  const wide = [];
  for (const el of [hero, ...hero.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) wide.push(`${label(el)} ${Math.round(r.left)}..${Math.round(r.right)}px`);
  }
  const headline = [];
  for (const el of hero.querySelectorAll('h1, .headline')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    if (text.width === 0) continue;
    if (el.scrollWidth > el.clientWidth + 1 || text.right > box.right + 0.5 || text.left < box.left - 0.5 || text.right > vw + 0.5) {
      headline.push(`${label(el)} text ${Math.round(text.left)}..${Math.round(text.right)}px in box ${Math.round(box.left)}..${Math.round(box.right)}px`);
    }
  }
  return { hero: label(hero), wide, headline };
}

// htmlFile: any built page on disk. Opens it at 390 px in chromium and measures the hero.
export async function checkHeroOverflow(htmlFile, { viewport = MOBILE } = {}) {
  if (!htmlFile || !fs.existsSync(htmlFile)) return result('hero-overflow-390', false, 'no build');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(path.resolve(htmlFile)).href, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); // web fonts change widths
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    const m = await page.evaluate(measureHero);
    if (!m.hero) return result('hero-overflow-390', false, 'no hero element found (header.hero, .hero or header)');
    const problems = [];
    if (m.wide.length) problems.push(`wider than ${viewport.width}px: ${m.wide.slice(0, 4).join(', ')}${m.wide.length > 4 ? ` (+${m.wide.length - 4})` : ''}`);
    if (m.headline.length) problems.push(`headline outside its box: ${m.headline.join(', ')}`);
    return problems.length ? result('hero-overflow-390', false, problems.join('; ')) : result('hero-overflow-390', true);
  } finally {
    await browser.close();
  }
}

export async function checkHeroOverflowFor(slug) {
  const html = builtHtml(slug);
  return fs.existsSync(html) ? checkHeroOverflow(html) : result('hero-overflow-390', false, 'no build');
}

// All hard checks for a Place, in contract order. `config` may be passed to skip re-reading it.
export async function runHard(slug, { config = readJson(configPath(slug), null), log = () => {} } = {}) {
  const c = config ?? {};
  const out = [];
  const push = (r) => { out.push(r); log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.id}${r.detail ? `: ${r.detail}` : ''}`); return r; };
  push(checkBuild(slug));
  push(await checkImagesFor(slug));
  push(checkPhone(c));
  push(checkItems(c));
  push(checkContrast(c.theme));
  push(await checkHeroOverflowFor(slug));
  for (const r of checkCopy(c)) push(r);
  return out;
}
