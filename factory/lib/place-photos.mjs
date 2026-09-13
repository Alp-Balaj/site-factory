// Which photos a generated site uses, and where the theme call looks at them. The cascade per slot (hero, gallery):
// the owner's intake photos, then the curated picks in photos.json (S2), then place.json's Google photos through
// photoUrl, then nothing. Config photos are { src, source: 'google' | 'instagram' | 'owner', author? } per the contract.
import path from 'node:path';
import { placeDir } from './paths.mjs';
import { photoUrl as keyedPhotoUrl } from './place.mjs';

// place.mjs throws without a name or a key; here a missing key simply means "no Google photos" so a Place without a
// pool still generates (hero "type", no gallery) instead of failing. place.json holds photo names, never URLs.
export function photoUrl(name, maxWidthPx = 1600) {
  try { return keyedPhotoUrl(name, maxWidthPx); } catch { return ''; }
}

const isHttp = (s) => /^https?:\/\//i.test(s ?? '');
const withAuthor = (photo, author) => (author && author.name ? { ...photo, author: { name: author.name, uri: author.uri ?? '' } } : photo);

// A pool entry (photos.json) as a config photo plus a preview location for vision (thumb when there is one).
function fromPool(slug, p) {
  const src = p.web || p.original || '';
  if (!src) return null;
  const preview = p.thumb || src;
  return {
    photo: withAuthor({ src, source: p.source === 'instagram' ? 'instagram' : p.source === 'owner' ? 'owner' : 'google' }, p.author),
    preview: isHttp(preview) ? { url: preview } : { file: path.resolve(placeDir(slug), preview) },
  };
}

function fromGoogle(p) {
  const src = photoUrl(p?.name, 1600);
  if (!src) return null;
  return { photo: withAuthor({ src, source: 'google' }, p.author), preview: { url: photoUrl(p.name, 900) } };
}

const fromOwner = (src) => (src ? { photo: { src, source: 'owner' }, preview: isHttp(src) ? { url: src } : { file: path.resolve(src) } } : null);

// Returns { hero, gallery, previews, from }: hero is a config photo or '' (none), gallery an array of config photos,
// previews the same photos as { url } | { file } for fetchPhotos (hero first, no duplicates), from says which source won.
export function resolvePhotos({ slug, place, photos, intake = {}, galleryMax = 8 }) {
  const pool = photos?.pool ?? [];
  const byId = Object.fromEntries(pool.map(p => [p.id, p]));
  let picks = photos?.picks;
  if (pool.length && !(picks?.hero || picks?.gallery?.length)) { // pool without curation: first landscape Google photo, then the next four
    const google = pool.filter(p => p.source === 'google');
    const hero = google.find(p => p.orientation === 'landscape') ?? google[0] ?? pool[0];
    picks = { hero: hero?.id, gallery: pool.filter(p => p !== hero).slice(0, 4).map(p => p.id) };
  }

  let hero = null, gallery = [], from = 'none';
  if (intake.heroImage) { hero = fromOwner(intake.heroImage); from = 'intake'; }
  else if (picks?.hero && byId[picks.hero]) { hero = fromPool(slug, byId[picks.hero]); from = 'pool'; }
  else if (place?.photos?.length) { hero = fromGoogle(place.photos[0]); from = 'google'; }

  if (intake.gallery?.length) gallery = intake.gallery.map(fromOwner);
  else if (picks?.gallery?.length) gallery = picks.gallery.map(id => byId[id] && fromPool(slug, byId[id]));
  else if (place?.photos?.length) gallery = place.photos.slice(hero ? 1 : 0, 1 + galleryMax).map(fromGoogle);
  gallery = gallery.filter(Boolean).filter(g => g.photo.src !== hero?.photo?.src).slice(0, galleryMax);
  if (!hero && !gallery.length) from = 'none';

  const seen = new Set();
  const previews = [hero, ...gallery].filter(Boolean).map(p => p.preview).filter(p => { const k = p.url ?? p.file; if (seen.has(k)) return false; seen.add(k); return true; });
  return { hero: hero?.photo ?? '', gallery: gallery.map(g => g.photo), previews, from };
}

export const hasPhotos = ({ hero, gallery }) => Boolean(hero) || gallery.length > 0;
