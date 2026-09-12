// Google Places photos for the pool: the photo names in place.json become pool entries (ids g01, g02, …) and are
// downloaded through the Places media endpoint at fetch time. The API key is added here and only here, never written
// to disk (backlog item 11).
//
// photoUrl() is a copy of S1's factory/lib/place.mjs export (S1 had not merged when this was written); the integration
// session replaces it with an import once both branches are on master (docs/handoff/S2.md).

export function photoUrl(photoName, maxWidthPx = 1600) {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${process.env.GOOGLE_PLACES_KEY ?? ''}`;
}

// Pool entries for every photo named in place.json, without files or urls yet. Ids follow the order in place.json.
// Old leads carried photos as keyed URL strings; those have no stable name and are skipped.
export function googleEntries(place) {
  const out = [];
  for (const p of place?.photos ?? []) {
    const name = typeof p === 'string' ? null : p?.name;
    if (!name || !name.startsWith('places/')) continue;
    out.push({
      id: `g${String(out.length + 1).padStart(2, '0')}`,
      source: 'google',
      ref: name,
      author: p.author ? { name: p.author.name ?? '', uri: p.author.uri ?? '' } : null,
      caption: '',
      width: p.width ?? null,
      height: p.height ?? null,
    });
  }
  return out;
}

// Downloads one Places photo. Returns { buffer, type } or throws with the HTTP status. `fetchImpl` is injectable for tests.
export async function fetchGooglePhoto(photoName, { width = 1600, fetchImpl = fetch } = {}) {
  if (!process.env.GOOGLE_PLACES_KEY) throw new Error('GOOGLE_PLACES_KEY missing in .env');
  return fetchImage(photoUrl(photoName, width), { fetchImpl });
}

// Any image URL to a buffer; rejects non-image responses so an HTML error page never lands in the pool.
export async function fetchImage(url, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(url, { redirect: 'follow' });
  const type = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(type)) throw new Error(`not an image (${type || 'no content-type'})`);
  return { buffer: Buffer.from(await r.arrayBuffer()), type };
}
