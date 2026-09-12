// Usage: node factory/migrate/clients-to-places.mjs [--dry-run]
// One-off after `git mv clients places`: gives every Place folder a state.json and, where the config remembers its
// Google place ID, a place.json reconstructed from the leads/out cache (photos as key-free names, reviews as objects).
// Folders generated before the pipeline existed become qa_passed (they were built and looked at by hand);
// demo-restaurant is the fixture: ready, flags.fixture true, no place.json. Idempotent: existing files are kept.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPath, listPlaces, placePath, readJson, writeJson } from '../lib/paths.mjs';
import { ensureState, hasState } from '../lib/state.mjs';

const LEADS_DIR = 'leads/out';
const FIXTURES = new Set(['demo-restaurant']);

// Facebook, Instagram and link pages are not a website of their own (S1 ships the real check in factory/lib/place.mjs).
const realWebsite = (url) => !!url && !/(^|\.)(facebook\.com|instagram\.com|fb\.me|linktr\.ee)(\/|$)/i.test(new URL(url).hostname);

// Every lead record in the cache, keyed by place_id (later files win, they are newer).
function leadsById() {
  const out = new Map();
  if (!fs.existsSync(LEADS_DIR)) return out;
  for (const f of fs.readdirSync(LEADS_DIR).filter(f => f.endsWith('.json')).sort()) {
    const data = readJson(path.join(LEADS_DIR, f), []);
    if (Array.isArray(data)) for (const l of data) if (l?.place_id) out.set(l.place_id, l);
  }
  return out;
}

// A keyed Places media URL -> the photo name Google addresses it by ("places/<id>/photos/<ref>").
export function photoNameFromUrl(url) {
  const m = /\/v1\/(places\/[^/]+\/photos\/[^/?]+)\/media/.exec(String(url ?? ''));
  return m ? m[1] : null;
}

export function placeFromLead(lead, vertical = 'restaurant') {
  const photos = (lead.photos ?? []).map(p => {
    if (typeof p === 'object' && p?.name) return p;
    const name = photoNameFromUrl(p);
    return name ? { name, width: null, height: null, author: null } : null;
  }).filter(Boolean);
  const review_snippets = (lead.review_snippets ?? []).map(r => (typeof r === 'string' ? { text: r, author: '', rating: null } : r));
  return {
    place_id: lead.place_id, name: lead.name, address: lead.address ?? '', city: lead.city ?? '',
    phone: lead.phone ?? null, website: lead.website ?? null,
    rating: lead.rating ?? null, reviews_count: lead.reviews_count ?? null, lat: lead.lat ?? null, lng: lead.lng ?? null,
    maps_url: lead.maps_url ?? '', type: lead.type ?? '', types: lead.types ?? [], business_status: lead.business_status ?? '',
    hours: lead.hours ?? [], photos, review_snippets,
    vertical, source: lead.source ?? 'places-api', fetched_at: lead.fetched_at ?? new Date().toISOString(),
  };
}

export function migrateClientsToPlaces({ dryRun = false, log = console.log } = {}) {
  const leads = leadsById();
  const done = [];
  for (const slug of listPlaces()) {
    const config = readJson(configPath(slug), null);
    if (!config) { log(`${slug}: no config.json, skipped`); continue; }
    const fixture = FIXTURES.has(slug);
    const placeId = config.meta?.lead_place_id;
    const lead = placeId ? leads.get(placeId) : null;

    if (!fixture && lead && !fs.existsSync(placePath(slug))) {
      log(`${slug}: place.json from ${LEADS_DIR} (${placeId}, ${(lead.photos ?? []).length} photos)`);
      if (!dryRun) writeJson(placePath(slug), placeFromLead(lead, config.vertical));
    } else if (!fixture && !lead) log(`${slug}: no lead record for ${placeId ?? 'unknown place_id'}, no place.json written`);

    if (hasState(slug)) { log(`${slug}: state.json exists, kept`); continue; }
    const status = fixture ? 'ready' : 'qa_passed';
    const flags = { hasRealWebsite: lead ? realWebsite(lead.website) : false, fixture };
    const contact = { person: '', phone: config.business?.phone ?? '' };
    log(`${slug}: state.json ${status}${flags.hasRealWebsite ? ' (has a real website)' : ''}`);
    if (!dryRun) ensureState(slug, status, 'migrated from clients/', { flags, contact });
    done.push(slug);
  }
  log(`${dryRun ? 'would create' : 'created'} state for ${done.length} place(s)`);
  return done;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  migrateClientsToPlaces({ dryRun: process.argv.includes('--dry-run') });
}
