// Every path under places/ in one place. Scripts import these instead of joining 'places' themselves.
// PLACES_DIR overrides the root (tests point it at a temp folder); jobs without a Place log under jobs/ at the repo root.
import fs from 'node:fs';
import path from 'node:path';

export const placesRoot = () => process.env.PLACES_DIR || 'places';
export const placeDir = (slug) => path.join(placesRoot(), slug);
export const configPath = (slug) => path.join(placeDir(slug), 'config.json');
export const statePath = (slug) => path.join(placeDir(slug), 'state.json');
export const placePath = (slug) => path.join(placeDir(slug), 'place.json');
export const photosPath = (slug) => path.join(placeDir(slug), 'photos.json');
export const notesPath = (slug) => path.join(placeDir(slug), 'notes.md');
export const buildDir = (slug) => path.join(placeDir(slug), 'build');
export const photosDir = (slug) => path.join(placeDir(slug), 'photos');
export const previewPath = (slug, viewport) => path.join(placeDir(slug), `preview-${viewport}.png`);
export const jobsDir = (slug) => (slug ? path.join(placeDir(slug), 'jobs') : 'jobs');

// Slugs of every Place folder. Folders starting with "_" (previews, fixtures) are not Places.
export function listPlaces() {
  const root = placesRoot();
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort();
}

export function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
