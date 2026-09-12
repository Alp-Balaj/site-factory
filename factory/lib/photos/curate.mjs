// Curation (item 16): one Claude vision call over the pool (thumbs at 800 wide, at most 30) scores every photo 0–5 on
// food, room, exterior, people, textHeavy and dark, confirms its orientation, and picks the hero and a gallery of 4 to 8
// with a one-paragraph note in English saying why. The same scores feed S3's theme call. Without vision the picks are
// mechanical: the first landscape Google photo is the hero and the next four photos are the gallery.
import fs from 'node:fs';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { fetchImage } from './google.mjs';
import { fileNames, localPath } from './store.mjs';

export const MAX_VISION_PHOTOS = 30;
export const GALLERY_MIN = 4;
export const GALLERY_MAX = 8;
const SCORE_KEYS = ['food', 'room', 'exterior', 'people', 'textHeavy', 'dark'];

// Mechanical picks: hero = first landscape Google photo (then any Google photo, then anything), gallery = the next
// four in pool order. Returns { hero, gallery } with ids, or nulls for an empty pool.
export function fallbackPicks(pool) {
  const ids = pool.map(p => p.id);
  const hero = pool.find(p => p.source === 'google' && p.orientation === 'landscape')
    ?? pool.find(p => p.source === 'google')
    ?? pool.find(p => p.orientation === 'landscape')
    ?? pool[0];
  if (!hero) return { hero: null, gallery: [] };
  const gallery = ids.filter(id => id !== hero.id).slice(0, GALLERY_MIN);
  return { hero: hero.id, gallery };
}

// Repairs what came back from vision against the pool: unknown ids drop, the hero never repeats in the gallery,
// the gallery is topped up to GALLERY_MIN from pool order and cut at GALLERY_MAX. Scores are clamped to 0..5 integers.
export function applyVision(pool, result) {
  const byId = new Map(pool.map(p => [p.id, p]));
  for (const s of result?.photos ?? []) {
    const p = byId.get(s?.id);
    if (!p) continue;
    p.scores = Object.fromEntries(SCORE_KEYS.map(k => [k, clamp(s[k])]));
    if (['landscape', 'portrait', 'square'].includes(s.orientation)) p.orientation = s.orientation;
  }
  const fallback = fallbackPicks(pool);
  const hero = byId.has(result?.hero) ? result.hero : fallback.hero;
  const seen = new Set([hero]);
  const gallery = [];
  for (const id of [...(result?.gallery ?? []), ...pool.map(p => p.id)]) {
    if (gallery.length >= GALLERY_MAX) break;
    if (!byId.has(id) || seen.has(id)) continue;
    if (gallery.length >= GALLERY_MIN && !(result?.gallery ?? []).includes(id)) break; // only top up to the minimum
    seen.add(id);
    gallery.push(id);
  }
  const note = String(result?.note ?? '').trim();
  return { hero, gallery, note };
}

const clamp = (v) => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));

const schema = {
  type: 'object',
  properties: {
    photos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          food: { type: 'integer', minimum: 0, maximum: 5 },
          room: { type: 'integer', minimum: 0, maximum: 5 },
          exterior: { type: 'integer', minimum: 0, maximum: 5 },
          people: { type: 'integer', minimum: 0, maximum: 5 },
          textHeavy: { type: 'integer', minimum: 0, maximum: 5 },
          dark: { type: 'integer', minimum: 0, maximum: 5 },
          orientation: { type: 'string', enum: ['landscape', 'portrait', 'square'] },
        },
        required: ['id', 'food', 'room', 'exterior', 'people', 'textHeavy', 'dark', 'orientation'],
        additionalProperties: false,
      },
    },
    hero: { type: 'string' },
    gallery: { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: GALLERY_MAX },
    note: { type: 'string' },
  },
  required: ['photos', 'hero', 'gallery', 'note'],
  additionalProperties: false,
};

function buildPrompt(place, entries) {
  const list = entries.map((p, i) => `${i + 1}. id=${p.id} source=${p.source} orientation=${p.orientation}${p.caption ? ` caption="${p.caption.replace(/\s+/g, ' ').slice(0, 140)}"` : ''}`).join('\n');
  return [
    `These are the ${entries.length} photos the factory has for "${place.name}" (${place.type ?? place.vertical ?? 'restaurant'}, ${place.city ?? ''}). They are attached in the same order as this list:`,
    list,
    '',
    'Score every photo 0–5 on each of: food (a dish or drink is the subject), room (the interior is the subject), exterior (the facade or terrace is the subject), people (faces or bodies dominate), textHeavy (menus, posters, screenshots, logos, text overlays), dark (underexposed or night without a lit subject). Confirm its orientation.',
    'Then pick the hero and a gallery of 4 to 8 photo ids:',
    '- The hero must be landscape, must not be text-heavy (textHeavy <= 1) and must not be dark (dark <= 1). Prefer a photo that shows what the place is at a glance: the room in daylight or a signature dish in its setting.',
    '- The gallery mixes food and room photos; include an exterior if there is a good one. Skip near-duplicates (same dish, same angle) and skip anything text-heavy, dark or with people dominating.',
    '- Order the gallery so that it reads well top to bottom on the site.',
    '- When no photo qualifies as hero (for example every photo is portrait), pick the best available one and say so in the note.',
    'Return a note of two or three plain English sentences saying why the hero was chosen and what the gallery carries; it becomes part of the theme note the designer reads. No emoji, no dashes, no bullet points.',
  ].join('\n');
}

// The thumb of a pool entry as a base64 image block: from the local file, or from its URL when this machine has no
// copy (R2 store on a second device).
async function imageBlock(slug, entry, { fetchImpl = fetch } = {}) {
  const file = localPath(slug, fileNames(entry.id).thumb);
  let data, type = 'image/webp';
  if (fs.existsSync(file)) data = fs.readFileSync(file);
  else if (/^https?:\/\//.test(entry.thumb ?? '')) ({ buffer: data, type } = await fetchImage(entry.thumb, { fetchImpl }));
  else return null;
  return { type: 'image', source: { type: 'base64', media_type: type, data: data.toString('base64') } };
}

// Runs through the local Claude Code login, like theme.mjs. Returns the raw structured result.
async function askClaude(prompt, images) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  async function* input() {
    yield { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: prompt }, ...images] } };
  }
  let out;
  for await (const msg of query({
    prompt: input(),
    options: { model: 'claude-sonnet-4-6', tools: [], maxTurns: 3, env, outputFormat: { type: 'json_schema', schema } },
  })) {
    if (msg.type !== 'result') continue;
    if (msg.subtype !== 'success' || !msg.structured_output) {
      const detail = msg.subtype === 'success' ? msg.result : (msg.errors ? JSON.stringify(msg.errors) : '');
      throw new Error(`Claude did not return a curation (${msg.subtype})${detail ? `: ${detail}` : ''}`);
    }
    out = msg.structured_output;
  }
  if (!out) throw new Error('No result from Claude (is Claude Code logged in? run: claude login)');
  return out;
}

// Curates `pool` in place (scores land on the entries) and returns { hero, gallery, note }. With vision false the
// picks are fallbackPicks() and the note says so. `ask` is injectable for tests.
export async function curate(slug, place, pool, { vision = true, log = () => {}, ask = askClaude, fetchImpl = fetch } = {}) {
  if (!pool.length) return { hero: null, gallery: [], note: 'No photos in the pool.' };
  if (!vision) {
    const picks = fallbackPicks(pool);
    return { ...picks, note: `Picked without vision: ${picks.hero} is the first landscape Google photo, the gallery is the next ${picks.gallery.length}.` };
  }
  const entries = pool.slice(0, MAX_VISION_PHOTOS);
  const images = [];
  const shown = [];
  for (const p of entries) {
    const block = await imageBlock(slug, p, { fetchImpl }).catch(e => { log(`${p.id}: cannot load thumb (${e.message})`); return null; });
    if (!block) continue;
    images.push(block);
    shown.push(p);
  }
  if (!shown.length) throw new Error('no thumbs to send to vision, run the store stage first');
  if (shown.length < pool.length) log(`vision sees ${shown.length} of ${pool.length} photos`);
  const raw = await ask(buildPrompt(place, shown), images);
  return applyVision(pool, raw);
}
