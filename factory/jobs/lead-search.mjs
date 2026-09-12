// The lead-search job: one query against Google Places (a vertical keyword plus a city), every kept result written
// into places/<slug>/ as a Place. params: { query, city, pages = 3, types?: 'cafe,bar' | [...], all?: boolean }.
//
// For every kept result: uniqueSlug(name, place_id); when places/<slug>/place.json exists the raw record is refreshed
// and state.json is left alone; otherwise place.json is written per the contract and state.json is created with
// status "found" and flags.hasRealWebsite. The whole batch (kept and dropped, dropped ones carry a `dropped` reason)
// also lands in leads/out/<query>-<city>.json as a cache of what Google said; nothing reads it for status.
//
// Google text search returns homes, street addresses and unrelated POIs alongside businesses; rejectReason() drops
// those (see README, "Lead filtering"). Phone and website are not filtered: a website is often only a Facebook or
// Instagram link, which hasRealWebsite() reports as none.
import fs from 'node:fs';
import path from 'node:path';
import { hasPlace, hasRealWebsite, writePlace } from '../lib/place.mjs';
import { slugify, uniqueSlug } from '../lib/slug.mjs';
import { ensureState, hasState } from '../lib/state.mjs';

export const LEADS_OUT_DIR = 'leads/out';

// Google place types (Table A) that count as "this vertical". Anything else in the results is a wrong-type hit.
export const VERTICAL_TYPES = {
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

const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.location,places.photos,places.regularOpeningHours,places.googleMapsUri,places.primaryType,places.types,places.businessStatus,places.reviews,nextPageToken';
const MAX_PHOTOS = 10;   // Places returns at most 10 per place
const MAX_REVIEWS = 5;   // and at most 5 reviews

export function guessVertical(keyword) {
  const t = String(keyword ?? '').toLowerCase();
  if (/dent|stomat/.test(t)) return 'dentist';
  if (/auto|servis|car|gom|mekanik/.test(t)) return 'auto';
  if (/guest|hotel|bujtin|lodg|hostel|motel/.test(t)) return 'guesthouse';
  if (/restor|restaur|kaf|cafe|coffee|bar|pizz|byrek|qebap|pastiç|ëmbëls|embels|fast.?food/.test(t)) return 'restaurant';
  return null;
}

// The type filter for a run: --types wins, then the vertical's list, then nothing (every business type kept).
export function allowedTypesFor({ types, vertical }) {
  const list = Array.isArray(types) ? types : typeof types === 'string' ? types.split(',') : null;
  const explicit = list?.map(s => String(s).trim()).filter(Boolean);
  if (explicit?.length) return new Set(explicit);
  return vertical && VERTICAL_TYPES[vertical] ? new Set(VERTICAL_TYPES[vertical]) : null;
}

// null when the place is one we want, otherwise a short reason it was dropped.
export function rejectReason(place, { allowedTypes = null, vertical = null } = {}) {
  const types = (place.types ?? []).filter(t => !NOT_A_BUSINESS.has(t));
  if (!place.type && types.length === 0) return 'not a business (address/home/area)';
  if (place.business_status && place.business_status !== 'OPERATIONAL') return `not operating (${place.business_status})`;
  if (allowedTypes) {
    const isRestaurantLike = vertical === 'restaurant' && [place.type, ...types].some(t => /_restaurant$/.test(t ?? ''));
    if (!isRestaurantLike && !allowedTypes.has(place.type) && !types.some(t => allowedTypes.has(t))) return `wrong type (${place.type || types[0]})`;
  }
  return null;
}

export const firstName = (displayName) => String(displayName ?? '').trim().split(/\s+/)[0] ?? '';

// One Places API result -> the place.json record. Photos are names plus attribution, never URLs (the key is added by
// photoUrl() at fetch time); reviews are trimmed to text, first name and rating.
export function toPlace(p, { query, city, vertical, fetchedAt = new Date().toISOString() }) {
  const author = (ph) => {
    const a = ph.authorAttributions?.[0];
    return a ? { name: a.displayName ?? '', uri: a.uri ?? '' } : null;
  };
  return {
    place_id: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? '',
    city,
    phone: p.internationalPhoneNumber || p.nationalPhoneNumber || null,
    website: p.websiteUri || null,
    rating: p.rating ?? null,
    reviews_count: p.userRatingCount ?? 0,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    maps_url: p.googleMapsUri ?? '',
    type: p.primaryType ?? null,
    types: p.types ?? [],
    business_status: p.businessStatus ?? null,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? [],
    photos: (p.photos ?? []).slice(0, MAX_PHOTOS).filter(ph => ph?.name).map(ph => ({
      name: ph.name, width: ph.widthPx ?? null, height: ph.heightPx ?? null, author: author(ph),
    })),
    review_snippets: (p.reviews ?? []).slice(0, MAX_REVIEWS)
      .map(r => ({ text: r.text?.text ?? r.originalText?.text ?? '', author: firstName(r.authorAttribution?.displayName), rating: r.rating ?? null }))
      .filter(r => r.text),
    vertical: vertical ?? query,
    query,
    source: 'places-api',
    fetched_at: fetchedAt,
  };
}

// One page of text search (tests stub globalThis.fetch).
export async function searchPage({ textQuery, pageToken, key }) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery, languageCode: 'sq', pageSize: 20, pageToken }),
  });
  if (!r.ok) throw new Error(`Places API ${r.status} ${await r.text()}`);
  return r.json();
}

export const cachePath = (query, city) => path.join(LEADS_OUT_DIR, `${slugify(query)}-${slugify(city)}.json`);

export async function run(ctx) {
  const { query, city } = ctx.params;
  const pages = Number(ctx.params.pages ?? 3);
  if (!query || !city) throw new Error('lead-search needs params.query and params.city');
  if (!Number.isInteger(pages) || pages < 1) throw new Error(`lead-search: pages must be a positive integer, got ${ctx.params.pages}`);
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_KEY missing in .env');

  const vertical = guessVertical(query);
  const keepAll = ctx.params.all === true;
  const allowedTypes = keepAll ? null : allowedTypesFor({ types: ctx.params.types, vertical });
  if (!vertical && !keepAll && !allowedTypes) ctx.log(`no type list for "${query}" (not a known vertical); keeping every business type. Pass types=a,b to restrict.`);

  const textQuery = `${query} ${city} Kosovo`;
  const fetchedAt = new Date().toISOString();
  const results = [];
  let token;
  for (let i = 0; i < pages; i++) {
    const data = await searchPage({ textQuery, pageToken: token, key });
    const batch = data.places ?? [];
    ctx.log(`page ${i + 1}/${pages}: ${batch.length} result(s)`);
    for (const p of batch) results.push(toPlace(p, { query, city, vertical, fetchedAt }));
    token = data.nextPageToken;
    if (!token) break;
  }

  const counts = { found: results.length, kept: 0, created: 0, updated: 0, dropped: 0 };
  const reasons = {};
  const cache = [];
  for (const place of results) {
    const why = keepAll ? null : rejectReason(place, { allowedTypes, vertical });
    if (why) {
      counts.dropped++;
      reasons[why] = (reasons[why] ?? 0) + 1;
      ctx.log(`dropped ${place.name}: ${why}`);
      cache.push({ ...place, dropped: why });
      continue;
    }
    const slug = uniqueSlug(place.name, place.place_id);
    if (!slug) { counts.dropped++; ctx.log(`dropped ${place.place_id}: no name`); cache.push({ ...place, dropped: 'no name' }); continue; }
    const realSite = hasRealWebsite(place.website);
    const site = realSite ? `real website ${place.website}` : place.website ? `no real website (${place.website})` : 'no website';
    counts.kept++;
    if (hasPlace(slug)) {
      writePlace(slug, place, `place(${slug}): refreshed by lead search`);
      counts.updated++;
      ctx.log(`updated ${place.name} -> ${slug} (place.json refreshed, state.json untouched; ${site})`);
    } else {
      writePlace(slug, place, `place(${slug}): found by lead search`);
      const stateExisted = hasState(slug);
      const state = ensureState(slug, 'found', `lead search ${query} ${city}`, { flags: { hasRealWebsite: realSite } });
      counts.created++;
      ctx.log(`kept ${place.name} -> ${slug} (${stateExisted ? `existing state ${state.status} kept` : 'found'}; ${site}; ${place.photos.length} photo(s), ${place.review_snippets.length} review(s))`);
    }
    cache.push({ ...place, slug });
  }

  const out = cachePath(query, city);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(cache, null, 2) + '\n');
  const summary = Object.entries(reasons).map(([k, v]) => `${v} ${k}`).join(', ');
  ctx.log(`${counts.found} found, ${counts.kept} kept (${counts.created} new, ${counts.updated} known), ${counts.dropped} dropped${summary ? ` (${summary})` : ''} -> ${out}`);
  return { ...counts, cache: out };
}
