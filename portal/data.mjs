// Reads for the pages: a Place with everything the Portal shows about it, the archetype list when S3's file exists,
// and job lookups that cover queued, running and finished records. Nothing here writes.
import fs from 'node:fs';
import path from 'node:path';
import { current, list, queued } from '../factory/lib/jobs.mjs';
import { buildDir, configPath, listPlaces, notesPath, placePath, previewPath, readJson } from '../factory/lib/paths.mjs';
import { STATUSES, allowedFrom, readState } from '../factory/lib/state.mjs';

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const JOB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

export const isPlace = (slug) => SLUG_RE.test(slug ?? '') && listPlaces().includes(slug);

// One Place as the pages see it. state is null when the folder has no state.json (then the board skips it).
export function loadPlace(slug) {
  const state = readState(slug);
  const config = readJson(configPath(slug), null);
  const place = readJson(placePath(slug), null);
  const business = config?.business ?? {};
  return {
    slug, state, config, place,
    name: business.name || place?.name || slug,
    city: business.city || place?.city || '',
    vertical: config?.vertical || place?.vertical || '',
    archetype: state?.archetype || config?.archetype || '',
    phone: state?.contact?.phone || business.phone || place?.phone || '',
    hasConfig: !!config,
    hasBuild: fs.existsSync(path.join(buildDir(slug), 'index.html')),
    previews: {
      mobile: fs.existsSync(previewPath(slug, 'mobile')),
      desktop: fs.existsSync(previewPath(slug, 'desktop')),
    },
    notesMd: fs.existsSync(notesPath(slug)) ? fs.readFileSync(notesPath(slug), 'utf8') : '',
    allowed: state ? allowedFrom(state.status) : [],
  };
}

export const allPlaces = () => listPlaces().map(loadPlace).filter(p => p.state);

export function groupByStatus(places) {
  const groups = Object.fromEntries(STATUSES.map(s => [s, []]));
  for (const p of places) (groups[p.state.status] ??= []).push(p);
  return groups;
}

// S3 ships factory/archetypes/restaurant.json as { vertical, default, archetypes: { id: { label, … } } }.
// Until it merges the archetype field is free text.
export function archetypes() {
  const data = readJson(path.join('factory', 'archetypes', 'restaurant.json'), null);
  if (!data?.archetypes || typeof data.archetypes !== 'object') return null;
  return {
    default: data.default ?? '',
    list: Object.entries(data.archetypes).map(([id, a]) => ({ id, label: a?.label || id })),
  };
}

// Queued and running first (their records exist on disk too, but the in-memory copy is fresher), then disk.
export function findJob(id) {
  const now = current();
  if (now?.id === id) return now;
  const q = queued().find(j => j.id === id);
  if (q) return q;
  return list().find(j => j.id === id) ?? null;
}

export const isLive = (job) => job && (job.status === 'queued' || job.status === 'running');

export function readLog(job, { tail = 0 } = {}) {
  if (!job?.logPath || !fs.existsSync(job.logPath)) return [];
  const lines = fs.readFileSync(job.logPath, 'utf8').split('\n').filter(Boolean);
  return tail ? lines.slice(-tail) : lines;
}

// Jobs of one Place, newest first, including whatever is queued or running for it.
export function placeJobs(slug, limit = 10) {
  const seen = new Set();
  const out = [];
  for (const j of [current(), ...queued(), ...list({ slug })]) {
    if (!j || j.slug !== slug || seen.has(j.id)) continue;
    seen.add(j.id);
    out.push(j);
  }
  return out.slice(0, limit);
}

// QA summary for a card: null when never run, otherwise { passed, at, reasons }.
export function qaSummary(state) {
  const qa = state?.qa;
  if (!qa) return null;
  return { passed: !!qa.passed, at: qa.at, reasons: qa.reasons ?? [], vision: !!qa.vision };
}
