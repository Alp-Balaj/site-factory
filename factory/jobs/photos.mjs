// The photos job: builds the photo pool of one Place (backlog 13–16) in four stages, each idempotent, so any of them
// can be rerun alone.
//   discover  the Instagram handle -> state.instagram { handle, how } (manual beats google beats search)
//   fetch     Google photos from place.json and Instagram posts through Apify -> places/<slug>/photos/<id>.orig.jpg
//   store     1600 and 800 wide webp next to each original; uploaded to R2 when R2_BUCKET is set
//   curate    one vision call scores the pool and picks hero + gallery (or the mechanical fallback with --no-vision)
// photos.json is written after every stage. Params: stage ("fetch" or "store,curate"; default all), vision (false with
// --no-vision), posts (Instagram posts to ask for, default 20), rediscover (true to redo a known handle).
//   node factory/jobs/run.mjs photos la-tarte
//   node factory/jobs/run.mjs photos la-tarte --stage discover
//   node factory/jobs/run.mjs photos la-tarte --no-vision
import { placePath } from '../lib/paths.mjs';
import { curate } from '../lib/photos/curate.mjs';
import { fetchGooglePhoto, fetchImage, googleEntries } from '../lib/photos/google.mjs';
import { discoverHandle, fetchPosts, normalizeHandle } from '../lib/photos/instagram.mjs';
import { emptyPhotos, mergePool, normalizeEntry, readPhotos, writePhotos } from '../lib/photos/pool.mjs';
import { hasOriginal, localUrls, measure, r2Client, r2Config, r2Urls, resize, saveOriginal, upload } from '../lib/photos/store.mjs';

export const STAGES = ['discover', 'fetch', 'store', 'curate'];

// "store,curate" -> Set; anything unknown throws so a typo does not silently run everything.
export function parseStages(param) {
  if (param === undefined || param === true || param === '' || param === 'all') return new Set(STAGES);
  const wanted = String(param).split(',').map(s => s.trim()).filter(Boolean);
  const bad = wanted.filter(s => !STAGES.includes(s));
  if (bad.length) throw new Error(`unknown stage ${bad.join(', ')} (stages: ${STAGES.join(', ')})`);
  return new Set(wanted);
}

const isAbsolute = (u) => /^https?:\/\//.test(u ?? '');

export async function run(ctx) {
  if (!ctx.slug) throw new Error('photos needs a Place');
  const { slug, params, place, log } = ctx;
  if (!place) throw new Error(`${placePath(slug)} missing: the photos job reads the Google record`);
  const stages = parseStages(params.stage);
  const photos = readPhotos(slug) ?? emptyPhotos();
  const save = (stage) => {
    photos.pool = photos.pool.map(normalizeEntry);
    writePhotos(slug, photos, `photos(${slug}): ${stage}`);
    log(`photos.json written after ${stage} (${photos.pool.length} in the pool)`);
  };

  if (stages.has('discover')) {
    const found = await discover(ctx, photos);
    photos.instagram = { ...photos.instagram, handle: found?.handle ?? '', how: found?.how ?? '' };
    save('discover');
  }

  if (stages.has('fetch')) {
    await fetchStage(ctx, photos);
    save('fetch');
  }

  if (stages.has('store')) {
    await storeStage(ctx, photos);
    save('store');
  }

  if (stages.has('curate')) {
    const vision = params.vision !== false;
    const picks = await curate(slug, place, photos.pool, { vision, log });
    photos.picks = { hero: picks.hero, gallery: picks.gallery };
    photos.note = picks.note;
    photos.curated_at = new Date().toISOString();
    log(`hero ${picks.hero ?? 'none'}, gallery ${picks.gallery.join(' ') || 'none'}${vision ? '' : ' (no vision)'}`);
    if (picks.note) log(`note: ${picks.note}`);
    save('curate');
  }

  return { pool: photos.pool.length, store: photos.store, instagram: photos.instagram.handle || null, hero: photos.picks.hero };
}

// Stage 1. A handle already in state.json is kept (a Portal entry always, a discovered one unless --rediscover).
async function discover(ctx, photos) {
  const { place, state, params, log } = ctx;
  const known = normalizeHandle(state?.instagram?.handle);
  const how = state?.instagram?.how || 'manual';
  let found = null;
  if (known && (how === 'manual' || !params.rediscover)) {
    found = { handle: known, how };
    log(`instagram: @${known} already known (${how})`);
  } else {
    found = await discoverHandle(place, state, { log });
    log(found ? `instagram: @${found.handle} (${found.how})` : 'instagram: no handle found');
  }
  if (found && state && (state.instagram?.handle !== found.handle || state.instagram?.how !== found.how)) {
    ctx.writeState({ instagram: { handle: found.handle, how: found.how } });
  }
  return found;
}

// Stage 2. Pool entries for every Google photo and every Instagram post, and the original file of each.
async function fetchStage(ctx, photos) {
  const { slug, place, state, params, log } = ctx;
  photos.pool = mergePool(photos.pool, googleEntries(place));

  const handle = normalizeHandle(photos.instagram.handle) ?? normalizeHandle(state?.instagram?.handle);
  if (handle && !process.env.APIFY_TOKEN) log(`APIFY_TOKEN not set, skipping Instagram posts of @${handle}`);
  else if (handle) {
    try {
      const posts = await fetchPosts(handle, Number(params.posts ?? 20));
      const entries = posts.map(p => ({ source: 'instagram', ref: p.url, image: p.image, caption: p.caption, timestamp: p.timestamp, author: null }));
      photos.pool = mergePool(photos.pool, entries);
      photos.instagram.posts = posts.length;
      log(`instagram: ${posts.length} posts from @${handle}`);
    } catch (e) { log(`instagram posts failed for @${handle}: ${e.message}`); }
  }

  const kept = [];
  let downloaded = 0;
  for (const entry of photos.pool) {
    if (!hasOriginal(slug, entry.id)) {
      if (isAbsolute(entry.original)) { kept.push(entry); continue; } // stored on another machine; nothing to fetch
      try {
        const got = entry.source === 'google'
          ? await fetchGooglePhoto(entry.ref)
          : await fetchImage(entry.image ?? '', {});
        await saveOriginal(slug, entry.id, got.buffer, got.type);
        downloaded++;
      } catch (e) {
        log(`${entry.id} (${entry.source}): download failed, ${e.message}`);
        continue;
      }
    }
    Object.assign(entry, await measure(slug, entry.id));
    kept.push(entry);
  }
  photos.pool = kept;
  log(`fetch: ${downloaded} downloaded, ${kept.length} in the pool`);
}

// Stage 3. Resize, then upload when R2 is configured. URL fields follow the store.
async function storeStage(ctx, photos) {
  const { slug, log } = ctx;
  const cfg = r2Config();
  const client = cfg ? await r2Client(cfg) : null;
  const kept = [];
  let uploaded = 0, resized = 0;
  for (const entry of photos.pool) {
    if (!hasOriginal(slug, entry.id)) {
      if (isAbsolute(entry.original)) kept.push(entry);
      else log(`${entry.id}: no original on disk, dropped (rerun --stage fetch)`);
      continue;
    }
    resized += await resize(slug, entry.id);
    Object.assign(entry, localUrls(entry.id));
    if (cfg) {
      uploaded += await upload(slug, entry.id, cfg, client, { log });
      Object.assign(entry, r2Urls(slug, entry.id, cfg.publicUrl));
    }
    kept.push(entry);
  }
  photos.pool = kept;
  photos.store = cfg ? 'r2' : 'local';
  log(`store: ${resized} file(s) resized, ${cfg ? `r2 (${cfg.bucket}), ${uploaded} file(s) uploaded` : 'local (set R2_BUCKET to upload)'}`);
}
