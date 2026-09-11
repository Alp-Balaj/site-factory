// Usage: npm run leads:api -- "restorant" "Prishtinë" [--pages 3]
// Output: leads/out/<vertical>-<city>.json  (only businesses with NO website by default)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const [vertical, city, ...rest] = process.argv.slice(2);
if (!vertical || !city) { console.error('usage: leads:api <vertical-keyword> <city> [--pages N] [--all]'); process.exit(1); }
const pages = Number(rest[rest.indexOf('--pages') + 1] || 3);
const keepAll = rest.includes('--all');
const KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY) { console.error('GOOGLE_PLACES_KEY missing in .env'); process.exit(1); }

const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.location,places.photos,places.regularOpeningHours,places.googleMapsUri,places.primaryType,places.reviews,nextPageToken';

async function search(pageToken) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery: `${vertical} ${city} Kosovo`, languageCode: 'sq', pageSize: 20, pageToken }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const leads = [];
let token;
for (let i = 0; i < pages; i++) {
  const data = await search(token);
  for (const p of data.places ?? []) {
    leads.push({
      place_id: p.id,
      name: p.displayName?.text,
      address: p.formattedAddress,
      phone: p.internationalPhoneNumber || p.nationalPhoneNumber || null,
      website: p.websiteUri || null,
      rating: p.rating ?? null,
      reviews_count: p.userRatingCount ?? 0,
      lat: p.location?.latitude, lng: p.location?.longitude,
      maps_url: p.googleMapsUri,
      type: p.primaryType,
      hours: p.regularOpeningHours?.weekdayDescriptions ?? [],
      photos: (p.photos ?? []).slice(0, 6).map(ph => `https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=1600&key=${KEY}`),
      review_snippets: (p.reviews ?? []).slice(0, 3).map(r => r.text?.text).filter(Boolean),
      vertical, city, source: 'places-api', status: 'new',
    });
  }
  token = data.nextPageToken;
  if (!token) break;
}

const filtered = keepAll ? leads : leads.filter(l => !l.website);
fs.mkdirSync('leads/out', { recursive: true });
const out = path.join('leads/out', `${slug(vertical)}-${slug(city)}.json`);
fs.writeFileSync(out, JSON.stringify(filtered, null, 2));
console.log(`${leads.length} found, ${filtered.length} kept -> ${out}`);
function slug(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
