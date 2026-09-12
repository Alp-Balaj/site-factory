// Usage: npm run leads:api -- "restorant" "Prishtinë" [--pages 3] [--types cafe,bar] [--all]
// Output: leads/out/<vertical>-<city>.json
// Keeps only real, open businesses of the requested vertical. Neither phone nor website is filtered: a website is
// often just a Facebook/Instagram link, and a missing phone can be found on the spot. Check both fields by hand.
// Google text search also returns street addresses, homes and random POIs; those are dropped (see isLead).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const [vertical, city, ...rest] = process.argv.slice(2);
const usage = 'usage: leads:api <vertical-keyword> <city> [--pages N] [--types a,b] [--all]';
if (!vertical || !city || /^\d+$/.test(city)) { console.error(usage); process.exit(1); }
const pages = Number(rest[rest.indexOf('--pages') + 1] || 3);
if (!Number.isInteger(pages) || pages < 1) { console.error(usage); process.exit(1); }
const keepAll = rest.includes('--all');
const KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY) { console.error('GOOGLE_PLACES_KEY missing in .env'); process.exit(1); }

// Google place types (Table A) that count as "this vertical". Anything else in the results is a wrong-type hit.
const VERTICAL_TYPES = {
  restaurant: ['restaurant', 'cafe', 'coffee_shop', 'bar', 'pub', 'wine_bar', 'bakery', 'dessert_shop', 'ice_cream_shop', 'tea_house',
    'meal_takeaway', 'meal_delivery', 'food_court', 'sandwich_shop', 'diner', 'bistro', 'cafeteria'],
  dentist: ['dentist', 'dental_clinic'],
  auto: ['car_repair', 'car_wash', 'auto_parts_store', 'car_dealer', 'car_rental'],
  guesthouse: ['lodging', 'guest_house', 'hotel', 'bed_and_breakfast', 'hostel', 'motel', 'inn', 'resort_hotel', 'extended_stay_hotel', 'cottage', 'farmstay'],
};
// Types that mean "a place on the map", not a business. A listing whose types are only these is a home/address/area.
const NOT_A_BUSINESS = new Set(['street_address', 'premise', 'subpremise', 'route', 'intersection', 'plus_code', 'postal_code',
  'locality', 'sublocality', 'neighborhood', 'political', 'geocode', 'natural_feature', 'administrative_area_level_1',
  'administrative_area_level_2', 'administrative_area_level_3', 'country', 'point_of_interest', 'establishment']);

function guessVertical(kw) {
  const t = kw.toLowerCase();
  if (/dent|stomat/.test(t)) return 'dentist';
  if (/auto|servis|car|gom|mekanik/.test(t)) return 'auto';
  if (/guest|hotel|bujtin|lodg|hostel|motel/.test(t)) return 'guesthouse';
  if (/restor|restaur|kaf|cafe|coffee|bar|pizz|byrek|qebap|pastiç|ëmbëls|embels|fast.?food/.test(t)) return 'restaurant';
  return null;
}
const verticalId = guessVertical(vertical);
const typesArg = rest.includes('--types') ? rest[rest.indexOf('--types') + 1] : null;
const allowedTypes = typesArg ? new Set(typesArg.split(',').map(s => s.trim()).filter(Boolean))
  : verticalId ? new Set(VERTICAL_TYPES[verticalId]) : null;
if (!allowedTypes && !keepAll) console.warn(`no type list for "${vertical}" (not a known vertical); keeping every business type. Use --types a,b to restrict.`);

const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.location,places.photos,places.regularOpeningHours,places.googleMapsUri,places.primaryType,places.types,places.businessStatus,places.reviews,nextPageToken';

async function search(pageToken) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery: `${vertical} ${city} Kosovo`, languageCode: 'sq', pageSize: 20, pageToken }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

// Returns null when the place is a lead we want, otherwise a short reason it was dropped.
function rejectReason(l) {
  const types = l.types.filter(t => !NOT_A_BUSINESS.has(t));
  if (!l.type && types.length === 0) return 'not a business (address/home/area)';
  if (l.business_status && l.business_status !== 'OPERATIONAL') return `not operating (${l.business_status})`;
  if (allowedTypes) {
    const isRestaurantLike = verticalId === 'restaurant' && [l.type, ...types].some(t => /_restaurant$/.test(t ?? ''));
    if (!isRestaurantLike && !allowedTypes.has(l.type) && !types.some(t => allowedTypes.has(t))) return `wrong type (${l.type || types[0]})`;
  }
  return null;
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
      type: p.primaryType ?? null,
      types: p.types ?? [],
      business_status: p.businessStatus ?? null,
      hours: p.regularOpeningHours?.weekdayDescriptions ?? [],
      photos: (p.photos ?? []).slice(0, 6).map(ph => `https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=1600&key=${KEY}`),
      review_snippets: (p.reviews ?? []).slice(0, 3).map(r => r.text?.text).filter(Boolean),
      vertical, city, source: 'places-api', status: 'new',
    });
  }
  token = data.nextPageToken;
  if (!token) break;
}

const rejected = {};
const filtered = keepAll ? leads : leads.filter(l => {
  const why = rejectReason(l);
  if (why) { rejected[why] = (rejected[why] ?? 0) + 1; console.log(`  - ${l.name}: ${why}`); }
  return !why;
});
fs.mkdirSync('leads/out', { recursive: true });
const out = path.join('leads/out', `${slug(vertical)}-${slug(city)}.json`);
fs.writeFileSync(out, JSON.stringify(filtered, null, 2));
const summary = Object.entries(rejected).map(([k, v]) => `${v} ${k}`).join(', ');
console.log(`${leads.length} found, ${filtered.length} kept -> ${out}${summary ? `\ndropped: ${summary}` : ''}`);
function slug(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
