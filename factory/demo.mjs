// Usage: npm run demo -- <slug> [--intake file.json] [--only theme|copy] [--feedback "one sentence"]
// (package.json routes that to the generate job: factory/jobs/generate.mjs, which calls generateDemo() and then
// enqueues build and qa). The input is a Place folder: places/<slug>/place.json (raw Google record), photos.json
// (curated pool, optional), notes.md (visit notes, optional) and state.json (archetype set by hand, feedback).
// Produces the config.json the Skeleton builds from: Albanian copy with evidence-marked items and testimonials from
// the reviews, a theme derived from the Place's own photos (theme.mjs), object photos with attribution. Intake answers
// override everything generated.
import 'dotenv/config';
import fs from 'node:fs';
import { resolveArchetype } from './lib/archetypes.mjs';
import { classifyArchetype, summarizePhotos } from './lib/classify.mjs';
import { askJson } from './lib/claude.mjs';
import { parseHours } from './lib/hours.mjs';
import { configPath, notesPath, photosPath, placePath, readJson } from './lib/paths.mjs';
import { hasPhotos, resolvePhotos } from './lib/place-photos.mjs';
import { slugify } from './lib/slug.mjs';
import { readState } from './lib/state.mjs';
import { FALLBACK_THEME, fixTheme, generateTheme, placeFromPlace } from './theme.mjs';

export { parseHours, slugify }; // moved to factory/lib; re-exported so older callers keep working

const schema = {
  type: 'object', additionalProperties: false,
  required: ['tagline', 'hero', 'about', 'items', 'testimonials', 'seo'],
  properties: {
    tagline: { type: 'string' },
    hero: { type: 'object', additionalProperties: false, required: ['headline', 'sub'], properties: { headline: { type: 'string' }, sub: { type: 'string' } } },
    about: { type: 'object', additionalProperties: false, required: ['title', 'text'], properties: { title: { type: 'string' }, text: { type: 'string' } } },
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['group', 'name', 'desc', 'price', 'source'],
        properties: { group: { type: 'string' }, name: { type: 'string' }, desc: { type: 'string' }, price: { type: 'string' }, source: { type: 'string', enum: ['evidence', 'filler'] } },
      },
    },
    testimonials: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'text'], properties: { name: { type: 'string' }, text: { type: 'string' } } } },
    seo: { type: 'object', additionalProperties: false, required: ['title', 'description'], properties: { title: { type: 'string' }, description: { type: 'string' } } },
  },
};

const reviewsOf = (place) => (place.review_snippets ?? []).map(r => (typeof r === 'string' ? { text: r, author: '', rating: null } : r)).filter(r => r?.text);
const captionsOf = (photos) => (photos?.pool ?? []).filter(p => p.source === 'instagram' && p.caption).map(p => p.caption.slice(0, 300));

function buildPrompt({ place, intake, archetype, reviews, captions, feedback, notes }) {
  return `Ti shkruan tekstin për një uebfaqe të thjeshtë biznesi në Kosovë, në shqip.
LLOJI I LOKALIT: ${archetype.label}. ${archetype.copyBrief}
Rregulla: fjali të shkurtra. Mos përdor vizë të gjatë (— ose –); përdor pikë, presje ose dy pika. Mos shpik adresë, telefon apo histori pa dëshmi. Çmimet në euro, tipike për Kosovën. Krijo 8-12 artikuj menyje.
${feedback ? `\nKOMENT NGA OPERATORI për versionin e mëparshëm (zbatoje para çdo gjëje tjetër): ${feedback}\n` : ''}${notes ? `\nSHËNIME NGA VIZITA (operatori ka qenë në lokal; këto janë fakte dhe kanë përparësi mbi dëshmitë):\n${notes}\n` : ''}
TË DHËNAT E BIZNESIT (mos i ndrysho faktet):
${JSON.stringify({ name: place.name, address: place.address, city: place.city, phone: place.phone, rating: place.rating, reviews_count: place.reviews_count, types: place.types ?? place.type, hours: place.hours }, null, 2)}

DËSHMI (vlerësime nga Google dhe përshkrime të postimeve në Instagram). Artikujt dhe testimonials dalin nga këto:
${JSON.stringify({ reviews, instagram_captions: captions }, null, 2)}

PËRGJIGJET E PRONARIT (kanë përparësi mbi çdo gjë tjetër, mund të jenë bosh):
${JSON.stringify(intake, null, 2)}

Grupet e lejuara për "items": ${JSON.stringify(archetype.itemGroups)}

Kthe JSON me këtë strukturë:
{
  "tagline": "max 8 fjalë",
  "hero": { "headline": "max 10 fjalë, jo emri i biznesit", "sub": "1-2 fjali" },
  "about": { "title": "max 6 fjalë", "text": "2-3 paragrafë të shkurtër, ndarë me \\n\\n" },
  "items": [ { "group": "...", "name": "...", "desc": "max 12 fjalë ose bosh", "price": "p.sh. 4.50 €", "source": "evidence ose filler" } ],
  "testimonials": [ { "name": "...", "text": "..." } ],
  "seo": { "title": "max 60 karaktere", "description": "max 155 karaktere" }
}
"source" është "evidence" kur gjella përmendet ose nënkuptohet qartë në vlerësimet, në përshkrimet e Instagram-it ose në përgjigjet e pronarit; "filler" kur është shembull tipik për këtë lloj lokali që ti e shton për ta mbushur menynë. Mos e etiketo si evidence diçka që s'ka dëshmi.
"testimonials" vijnë vetëm nga vlerësimet pozitive të dhëna më lart: "text" është citim i shkurtër me fjalët e vlerësuesit (6 deri 30 fjalë, mund ta shkurtosh por jo ta ndryshosh kuptimin; kapërce vlerësimet prej dy fjalësh), "name" vetëm emri i parë i autorit, ose "Klient" kur mungon. Max 4. Bosh nëse s'ka vlerësim pozitiv.`;
}

// Runs through the local Claude Code login (claude.ai subscription), not an API key.
const generateCopy = (prompt) => askJson({ prompt, schema, what: 'copy' });

export const firstName = (name = '') => String(name).trim().split(/[\s.,]+/)[0] ?? '';

// @handle or a profile URL -> handle; '' when it is not an Instagram link.
export function instagramHandle(s = '') {
  const m = String(s).trim().match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)\/?/i) ?? String(s).trim().match(/^@([A-Za-z0-9_.]{2,})$/);
  const h = m?.[1] ?? '';
  return ['p', 'reel', 'explore', 'stories', 'accounts'].includes(h) ? '' : h;
}

// Everything under places/<slug>/ that generation reads. Throws when place.json is missing.
export function loadPlaceInputs(slug) {
  const place = readJson(placePath(slug), null);
  if (!place) throw new Error(`${placePath(slug)} not found (a Place folder needs place.json; run a lead search or write it by hand)`);
  const nf = notesPath(slug);
  return {
    place, state: readState(slug), config: readJson(configPath(slug), null), photos: readJson(photosPath(slug), null),
    notes: fs.existsSync(nf) ? fs.readFileSync(nf, 'utf8').trim() : '',
  };
}

// The archetype for this run: set by hand in state.json (wins, never overwritten), else the caller's, else the previous
// config's when only one half is regenerated, else Claude classifies; the vertical's default when that fails.
async function decideArchetype({ slug, place, state, config, photos, only, vertical, wanted, log }) {
  const pick = (id, how, extra = {}) => ({ archetype: resolveArchetype(id, vertical), how, ...extra });
  if (state?.archetype) return pick(state.archetype, 'state');
  if (wanted) return pick(wanted, 'param');
  if (only && config?.archetype) return pick(config.archetype, 'config');
  try {
    const r = await classifyArchetype(place, summarizePhotos(photos), { vertical });
    log(`archetype: ${r.archetype} (${Math.round(r.confidence * 100)}%): ${r.reason}`);
    return pick(r.archetype, 'classified', { confidence: r.confidence, reason: r.reason });
  } catch (e) {
    const a = resolveArchetype('', vertical);
    log(`archetype: classification failed (${e.message}); using the default ${a.id}`);
    return { archetype: a, how: 'default', reason: e.message };
  }
}

const copyOf = (config) => ({
  tagline: config.business?.tagline ?? '', hero: { headline: config.hero?.headline ?? '', sub: config.hero?.sub ?? '' },
  about: config.about ?? { title: '', text: '' }, items: config.items ?? [], testimonials: config.testimonials ?? [], seo: config.seo ?? { title: '', description: '' },
});

// Generates the config for one Place folder. Does not write anything (the generate job and the theme CLI do).
// options: intake (owner's answers), only 'theme' | 'copy' (regenerate one half, keep the other from config.json),
// feedback (one sentence for both prompts; defaults to state.feedback), archetype (id, when not set by hand), log.
// Returns { config, archetype: { id, how, confidence?, reason? }, theme: { changes, photosUsed, fallback }, photos: { from, hero, gallery } }.
export async function generateDemo(slug, { intake = {}, only, feedback, archetype: wanted, log = console.log } = {}) {
  if (only && !['theme', 'copy'].includes(only)) throw new Error(`--only must be theme or copy, not "${only}"`);
  const { place, state, config: existing, photos, notes } = loadPlaceInputs(slug);
  if (only && !existing) throw new Error(`--only ${only} needs an existing ${configPath(slug)}; run a full generate first`);
  if (!place.name && !intake.name) throw new Error('place has no name');
  const vertical = existing?.vertical || place.vertical || guessVertical(place);
  const fb = (feedback ?? state?.feedback ?? '').trim();
  if (fb) log(`feedback: ${fb}`);
  if (notes) log(`notes.md: ${notes.length} chars`);

  const decided = await decideArchetype({ slug, place, state, config: existing, photos, only, vertical, wanted, log });
  const archetype = decided.archetype;
  if (archetype.fallbackReason) log(`archetype: ${archetype.fallbackReason}; using ${archetype.id}`);

  const shots = resolvePhotos({ slug, place, photos, intake });
  const withPhotos = hasPhotos(shots);
  log(`photos: ${shots.from === 'none' ? 'none' : `${shots.from}, hero ${shots.hero ? 'yes' : 'no'}, gallery ${shots.gallery.length}`}`);

  // Copy and theme are two Claude calls with nothing in common, so they run side by side. The theme comes from the
  // Place's own photos; FALLBACK_THEME (plain on purpose) is used only when that call throws, so the demo still ships.
  const reviews = reviewsOf(place);
  const themePlace = { ...placeFromPlace(place, vertical), archetype: archetype.label, items: (only === 'theme' ? existing.items ?? [] : []).slice(0, 12).map(i => i.name) };
  const [copy, themed] = await Promise.all([
    only === 'theme' ? copyOf(existing) : generateCopy(buildPrompt({ place, intake, archetype, reviews, captions: captionsOf(photos), feedback: fb, notes })),
    only === 'copy' ? null : generateTheme(themePlace, shots.previews, { archetype, feedback: fb, notes, hasPhotos: withPhotos })
      .catch(e => { log(`theme: ${e.message}; using the plain fallback theme`); return { ...fixTheme({ ...FALLBACK_THEME, note: `fallback theme (generation failed: ${e.message})` }, { hasPhotos: withPhotos }), photosUsed: 0, fallback: true }; }),
  ]);
  if (themed && !themed.fallback) {
    log(`theme: ${themed.photosUsed} photo(s) read. ${themed.theme.note ?? ''}`);
    for (const c of themed.changes) log(`theme repaired: ${c}`);
  }
  const theme = only === 'copy' ? existing.theme : { ...themed.theme, ...(intake.theme || {}) }; // --only copy leaves the theme untouched, even a hand-edited one

  const items = intake.items?.length
    ? intake.items.map(i => ({ ...i, source: i.source === 'filler' ? 'filler' : 'evidence' })) // the owner's own menu is evidence
    : copy.items.map(i => ({ ...i, source: i.source === 'evidence' ? 'evidence' : 'filler' }));
  const testimonials = reviews.length
    ? (copy.testimonials ?? []).map(t => ({ name: firstName(t.name) || 'Klient', text: String(t.text ?? '').trim() })).filter(t => t.text).slice(0, 4)
    : [];

  const phone = intake.phone || state?.contact?.phone || place.phone || '';
  const config = {
    slug, vertical, archetype: archetype.id, itemGroups: archetype.itemGroups,
    business: {
      name: intake.name || place.name,
      tagline: copy.tagline,
      phone,
      whatsapp: (intake.whatsapp || phone).replace(/[^\d]/g, ''),
      email: intake.email || '',
      address: intake.address || place.address || '',
      city: place.city,
      mapsUrl: place.maps_url || '',
      lat: place.lat, lng: place.lng,
      instagram: intake.instagram || state?.instagram?.handle || photos?.instagram?.handle || instagramHandle(place.website) || '',
      facebook: intake.facebook || '',
      rating: place.rating, reviews_count: place.reviews_count,
    },
    hours: intake.hours || parseHours(place.hours),
    theme,
    hero: { ...copy.hero, image: shots.hero },
    about: copy.about,
    items,
    gallery: shots.gallery,
    testimonials,
    seo: copy.seo,
    ...(existing?.credit ? { credit: existing.credit } : {}), // set by hand once per client; survives regeneration
    meta: {
      lead_place_id: place.place_id, generated_at: new Date().toISOString(), source: place.source,
      archetype: { how: decided.how, ...(decided.confidence !== undefined ? { confidence: decided.confidence } : {}), ...(decided.reason ? { reason: decided.reason } : {}) },
      photos: shots.from, ...(only ? { only } : {}), ...(fb ? { feedback: fb } : {}), ...(notes ? { notes: true } : {}),
    },
  };
  return {
    config,
    archetype: { id: archetype.id, how: decided.how, confidence: decided.confidence, reason: decided.reason },
    theme: { changes: themed?.changes ?? [], photosUsed: themed?.photosUsed ?? 0, fallback: Boolean(themed?.fallback) },
    photos: { from: shots.from, hero: Boolean(shots.hero), gallery: shots.gallery.length },
  };
}

export function guessVertical(l) {
  const t = `${l.type ?? ''} ${(l.types ?? []).join(' ')} ${l.vertical ?? ''} ${l.name ?? ''}`.toLowerCase();
  if (/dent|stomat/.test(t)) return 'dentist';
  if (/auto|servis|car_repair|gom/.test(t)) return 'auto';
  if (/guest|hotel|bujtin|lodg|hostel/.test(t)) return 'guesthouse';
  return 'restaurant';
}
