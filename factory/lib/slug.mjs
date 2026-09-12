// Slugs name the Place folder. slugify() is the same function demo.mjs always had; uniqueSlug() keeps two Places with
// the same name apart by appending the tail of the Google place ID when the folder is already taken by another Place.
import fs from 'node:fs';
import { placePath } from './paths.mjs';

export function slugify(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ë/g, 'e').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// The slug for a Place: slugify(name), unless places/<slug>/place.json exists for a different place_id, in which case
// the last 6 characters of the place ID are appended. `existingPlaceId(slug)` is injectable for tests; the default reads place.json.
export function uniqueSlug(name, placeId, { existingPlaceId = defaultExistingPlaceId } = {}) {
  const base = slugify(name);
  if (!base || !placeId) return base;
  const taken = existingPlaceId(base);
  if (!taken || taken === placeId) return base;
  const suffix = slugify(placeId.slice(-6)) || 'x';
  return `${base}-${suffix}`;
}

function defaultExistingPlaceId(slug) {
  const file = placePath(slug);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).place_id ?? null; } catch { return null; }
}
