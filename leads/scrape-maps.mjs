// Usage: npm run leads:scrape -- "restorant" "Prishtinë" [--max 60]
// Free but brittle: Google changes selectors. Run headed first (HEADLESS=0) to see what breaks.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [vertical, city, ...rest] = process.argv.slice(2);
if (!vertical || !city) { console.error('usage: leads:scrape <vertical> <city> [--max N]'); process.exit(1); }
const max = Number(rest[rest.indexOf('--max') + 1] || 60);

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
const page = await browser.newPage({ locale: 'sq-AL' });
await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(`${vertical} ${city}`)}?hl=sq`);
try { await page.getByRole('button', { name: /prano|accept/i }).first().click({ timeout: 4000 }); } catch {}

const feed = page.locator('div[role="feed"]');
await feed.waitFor({ timeout: 15000 });
let links = [];
for (let i = 0; i < 25 && links.length < max; i++) {
  links = await feed.locator('a[href*="/maps/place/"]').evaluateAll(as => [...new Set(as.map(a => a.href))]);
  await feed.evaluate(el => el.scrollBy(0, 4000));
  await page.waitForTimeout(1200);
}

const leads = [];
for (const url of links.slice(0, max)) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const text = async (sel) => (await page.locator(sel).first().textContent().catch(() => null))?.trim() ?? null;
  const attr = async (sel, a) => page.locator(sel).first().getAttribute(a).catch(() => null);
  leads.push({
    place_id: url.match(/!1s([^!]+)/)?.[1] ?? url,
    name: await text('h1'),
    address: await text('button[data-item-id="address"]'),
    phone: (await attr('button[data-item-id^="phone"]', 'data-item-id'))?.replace('phone:tel:', '') ?? null,
    website: await attr('a[data-item-id="authority"]', 'href'),
    rating: Number(await text('div[role="img"][aria-label*="yje"], div.F7nice span[aria-hidden="true"]')) || null,
    maps_url: url, vertical, city, source: 'scrape', status: 'new',
  });
  process.stdout.write('.');
}
await browser.close();

const filtered = leads.filter(l => !l.website);
fs.mkdirSync('leads/out', { recursive: true });
const out = path.join('leads/out', `${vertical}-${city}`.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.scrape.json');
fs.writeFileSync(out, JSON.stringify(filtered, null, 2));
console.log(`\n${leads.length} scraped, ${filtered.length} without website -> ${out}`);
