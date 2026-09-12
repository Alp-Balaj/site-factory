// Which archetype a Place is (CONTEXT.md): Claude reads the Google types, the name, the review texts and, when
// photos.json exists, the curation scores and Instagram captions, and answers with one id from
// factory/archetypes/<vertical>.json. state.archetype set by hand in the Portal wins; classification never writes it.
import { loadArchetypes } from './archetypes.mjs';
import { askJson } from './claude.mjs';

// The part of photos.json the classifier (and the theme prompt) can use: scores and captions, no URLs.
export function summarizePhotos(photos) {
  if (!photos?.pool?.length) return null;
  return {
    instagram: photos.instagram?.handle ? { handle: photos.instagram.handle, posts: photos.instagram.posts ?? 0 } : null,
    note: photos.note ?? '',
    picks: photos.picks ?? null,
    photos: photos.pool.slice(0, 30).map(p => ({
      id: p.id, source: p.source, orientation: p.orientation ?? '', scores: p.scores ?? null,
      caption: (p.caption ?? '').slice(0, 200) || undefined,
    })),
  };
}

function buildPrompt(place, photosSummary, data) {
  const list = Object.values(data.archetypes).map(a => `- ${a.id}: ${a.label}. ${a.copyBrief.split('.')[0]}.`).join('\n');
  return `Classify one restaurant in Kosovo into exactly one archetype. The archetype decides the copy brief, the menu groups and the default layout of its website, so pick the one whose customers would recognise the place, not the most flattering one.

Archetypes:
${list}

Rules: "${data.default}" is the default when nothing fits clearly. A place that serves both grilled meat and traditional dishes is "traditional-family" when reviews talk about family and home cooking, "grill-house" when they talk about qebapa and speed. A cake shop that also serves coffee is "patisserie-bakery". A café with cocktails and late hours is "bar-night" only when the night side dominates. Fine dining needs real evidence (tasting menus, wine, reservations, prices), not just a nice room. Confidence is 0 to 1. The reason is one English sentence naming the evidence.

THE PLACE (Google data):
${JSON.stringify({ name: place.name, city: place.city, types: place.types ?? place.type, type: place.type, rating: place.rating, reviews_count: place.reviews_count, website: place.website, reviews: (place.review_snippets ?? []).map(r => (typeof r === 'string' ? r : r.text)) }, null, 2)}

PHOTOS (vision scores 0-5 per photo from the curation pass, and Instagram captions; null when no photo pool yet):
${JSON.stringify(photosSummary, null, 2)}`;
}

// Returns { archetype, confidence, reason }. Throws when Claude does not answer; callers fall back to the default.
export async function classifyArchetype(place, photosSummary = null, { vertical = place?.vertical ?? 'restaurant' } = {}) {
  const data = loadArchetypes(vertical);
  const ids = Object.keys(data.archetypes);
  if (ids.length === 1) return { archetype: ids[0], confidence: 1, reason: `${vertical} has a single archetype` };
  const schema = {
    type: 'object', additionalProperties: false, required: ['archetype', 'confidence', 'reason'],
    properties: { archetype: { type: 'string', enum: ids }, confidence: { type: 'number', minimum: 0, maximum: 1 }, reason: { type: 'string' } },
  };
  const out = await askJson({ prompt: buildPrompt(place, photosSummary, data), schema, what: 'an archetype' });
  if (!ids.includes(out.archetype)) return { archetype: data.default, confidence: 0, reason: `Claude answered "${out.archetype}", not an archetype; using the default` };
  return out;
}
