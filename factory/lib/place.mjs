// places/<slug>/place.json: the raw Google record of one Place, key-free (the shape is the place.json contract in the
// build plan). Lead search writes it; generation reads it. Photos are stored as Google photo *names*; the API key
// is appended only by photoUrl(), at call time, so no keyed URL ever lands on disk (backlog item 11).
import fs from 'node:fs';
import { commit } from './git.mjs';
import { placePath, readJson, writeJson } from './paths.mjs';

// Hosts that are a profile or contact page, not a website of their own. A Place whose only "website" is one of these
// is a lead (wa.me links show up on Google as the website of places that take bookings over WhatsApp).
const NOT_A_WEBSITE = ['facebook.com', 'instagram.com', 'fb.me', 'fb.com', 'linktr.ee', 'wa.me', 'whatsapp.com'];

export const hasPlace = (slug) => fs.existsSync(placePath(slug));

// null when the Place has no place.json yet.
export function readPlace(slug) {
  return readJson(placePath(slug), null);
}

// Writes the whole record and commits it when AUTO_COMMIT=1. Returns the record.
export function writePlace(slug, place, message = `place(${slug}): ${place?.name ?? slug}`) {
  const file = placePath(slug);
  writeJson(file, place);
  commit([file], message);
  return place;
}

// True when `url` points at a site of its own: not empty, not Facebook/Instagram/fb.me/linktr.ee/wa.me (any subdomain),
// not something that fails to parse as a URL.
export function hasRealWebsite(url) {
  if (!url || typeof url !== 'string') return false;
  const raw = url.trim();
  if (!raw) return false;
  let host;
  try { host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase(); } catch { return false; }
  if (!host.includes('.')) return false;
  return !NOT_A_WEBSITE.some(h => host === h || host.endsWith(`.${h}`));
}

// The media URL for a Google photo name ("places/<id>/photos/<ref>") at up to `maxWidthPx` wide, with the key from
// the environment. Only ever call this on the way to a fetch; never store the result.
export function photoUrl(photoName, maxWidthPx = 1600, key = process.env.GOOGLE_PLACES_KEY) {
  if (!photoName || typeof photoName !== 'string') throw new Error('photoUrl: photo name is required');
  if (!key) throw new Error('GOOGLE_PLACES_KEY missing in .env');
  const width = Number.isInteger(maxWidthPx) && maxWidthPx > 0 ? maxWidthPx : 1600;
  const name = photoName.replace(/^\/+/, '');
  return `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&key=${encodeURIComponent(key)}`;
}
