// places/<slug>/photos.json: the pool contract from the build plan. Read, write (committed like state.json) and the
// id bookkeeping that keeps ids stable across runs: an entry is the same photo when its ref (Google photo name or
// Instagram post URL) is the same, so a rerun never renames files that are already stored or uploaded.
import { commit } from '../git.mjs';
import { photosPath, readJson, writeJson } from '../paths.mjs';

export function emptyPhotos() {
  return {
    store: 'local',
    instagram: { handle: '', how: '', posts: 0 },
    pool: [],
    picks: { hero: null, gallery: [] },
    note: '',
    curated_at: null,
  };
}

export const readPhotos = (slug) => readJson(photosPath(slug), null);

export function writePhotos(slug, data, message = `photos(${slug})`) {
  const file = photosPath(slug);
  writeJson(file, data);
  commit([file], message);
  return data;
}

// Merges freshly discovered entries (no id yet, or a provisional one) into the existing pool by ref. Existing entries
// keep their id and everything already known about them (files, urls, scores); fresh fields fill the gaps. Entries in
// `fresh` get the next free id for their prefix (g for Google, i for Instagram). Returns the merged pool in the order:
// existing entries first, then new ones.
export function mergePool(existing, fresh) {
  const byRef = new Map(existing.map(p => [p.ref, { ...p }]));
  const used = new Set(existing.map(p => p.id));
  const next = (prefix) => {
    let n = 1;
    while (used.has(`${prefix}${String(n).padStart(2, '0')}`)) n++;
    const id = `${prefix}${String(n).padStart(2, '0')}`;
    used.add(id);
    return id;
  };
  const out = [...byRef.values()];
  for (const f of fresh) {
    const have = byRef.get(f.ref);
    if (have) {
      for (const [k, v] of Object.entries(f)) if (k !== 'id' && (have[k] === undefined || have[k] === null || have[k] === '')) have[k] = v;
      continue;
    }
    const entry = { ...f, id: next(f.source === 'instagram' ? 'i' : 'g') };
    byRef.set(entry.ref, entry);
    out.push(entry);
  }
  return out;
}

// The pool in a fixed key order so diffs of photos.json stay readable.
export function normalizeEntry(p) {
  return {
    id: p.id, source: p.source, ref: p.ref,
    author: p.author ?? null, caption: p.caption ?? '',
    width: p.width ?? null, height: p.height ?? null, orientation: p.orientation ?? 'landscape',
    original: p.original ?? null, web: p.web ?? null, thumb: p.thumb ?? null,
    scores: p.scores ?? null,
    ...(p.timestamp ? { timestamp: p.timestamp } : {}),
  };
}
