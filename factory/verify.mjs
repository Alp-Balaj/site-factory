// Usage: npm run verify -- <slug>
// 1. Checks clients/<slug>/config.json for the fields the template cannot do without (exit 1 on failure).
// 2. If clients/<slug>/build/index.html exists, saves clients/<slug>/preview-mobile.png and preview-desktop.png.
// build.mjs imports checkConfig/loadConfig (before astro) and takeScreenshots (after astro) from here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { fixTheme } from './theme.mjs';

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
};

export const configPath = (slug) => path.join('clients', slug, 'config.json');
export const buildDir = (slug) => path.join('clients', slug, 'build');

export function loadConfig(slug) {
  const file = configPath(slug);
  if (!slug || !fs.existsSync(file)) throw new Error(`${file} not found`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const filled = (v) => (typeof v === 'string' ? v.trim() !== '' : typeof v === 'number');

// Returns { errors, warnings } as plain strings; never throws.
export function checkConfig(config) {
  const errors = [];
  const warnings = [];
  const c = config ?? {};
  const b = c.business ?? {};
  const hero = c.hero ?? {};
  const seo = c.seo ?? {};

  if (!filled(b.name)) errors.push('business.name is missing or empty');
  if (!filled(b.phone) && !filled(b.whatsapp)) errors.push('business.phone or business.whatsapp must be set (both are empty)');
  if (!filled(hero.headline)) errors.push('hero.headline is missing or empty');
  if (!filled(hero.sub)) errors.push('hero.sub is missing or empty');
  if (!Array.isArray(c.items)) errors.push('items is missing or not an array');
  else if (c.items.length < 3) errors.push(`items has ${c.items.length} entries, need at least 3`);
  if (!filled(seo.title)) errors.push('seo.title is missing or empty');
  if (!filled(seo.description)) errors.push('seo.description is missing or empty');

  const noGallery = !Array.isArray(c.gallery) || c.gallery.filter(filled).length === 0;
  if (!filled(hero.image) && noGallery) warnings.push('hero.image and gallery are both empty: the site will have no photos');

  // The template computes text colours from the theme; a theme fixTheme would repair is one it cannot make readable.
  if (!c.theme || typeof c.theme !== 'object') errors.push('theme is missing (run: npm run theme -- <slug>)');
  else for (const change of fixTheme(c.theme).changes) warnings.push(`theme: ${change} (npm run theme -- <slug> regenerates it)`);

  return { errors, warnings };
}

export const CHROMIUM_INSTALL_CMD = 'npx playwright install chromium';

export function chromiumInstalled() {
  try { return fs.existsSync(chromium.executablePath()); } catch { return false; }
}

// Full-page screenshots of the built index.html. Throws (with the install command in the message) if chromium is missing.
export async function takeScreenshots(slug) {
  const html = path.join(buildDir(slug), 'index.html');
  if (!fs.existsSync(html)) throw new Error(`${html} not found (run: npm run build -- ${slug})`);
  if (!chromiumInstalled()) throw new Error(`Playwright's chromium browser is not installed. Run:\n  ${CHROMIUM_INSTALL_CMD}`);

  const browser = await chromium.launch();
  const out = {};
  try {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' }); // settle motion so nothing mid-animation reads as missing
      await page.goto(pathToFileURL(path.resolve(html)).href, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); // fonts/map iframe; best effort
      await page.evaluate(() => new Promise(done => { // scroll through so lazy-loaded photos land in the capture
        const step = () => { window.scrollBy(0, 600); if (window.scrollY + innerHeight < document.body.scrollHeight) setTimeout(step, 60); else { window.scrollTo(0, 0); setTimeout(done, 300); } };
        step();
      }));
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      out[name] = path.join('clients', slug, `preview-${name}.png`);
      await page.screenshot({ path: out[name], fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}

// Prints check results the way the CLI does. Returns true when there are no errors.
export function reportChecks({ errors, warnings }) {
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  return errors.length === 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const slug = process.argv[2];
  if (!slug) { console.error('usage: verify <slug>'); process.exit(1); }
  let config;
  try { config = loadConfig(slug); } catch (e) { console.error(e.message); process.exit(1); }

  const result = checkConfig(config);
  if (!reportChecks(result)) { console.error(`${configPath(slug)}: ${result.errors.length} problem(s), fix them before building`); process.exit(1); }
  console.log(`${configPath(slug)}: OK`);

  if (!fs.existsSync(path.join(buildDir(slug), 'index.html'))) {
    console.log(`no build at ${path.join(buildDir(slug), 'index.html')}, skipping screenshots (run: npm run build -- ${slug})`);
    process.exit(0);
  }
  try {
    const shots = await takeScreenshots(slug);
    for (const p of Object.values(shots)) console.log(`-> ${p}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
