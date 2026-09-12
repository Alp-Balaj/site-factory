// Usage: npm run theme -- <slug> [--dry-run]
// Derives a client's theme (colours, fonts, corner and edge language) from the restaurant itself: its Google photos,
// name, category and reviews, via Claude vision. Rewrites `theme` in places/<slug>/config.json (photos are read from
// hero.image + gallery). demo.mjs imports generateTheme() and runs it for every new lead, so a demo never ships the
// vertical's fallback theme unless generation fails.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { configPath } from './lib/paths.mjs';

// Google Fonts the generator may pick from. `w` lists the static weights the family really carries (Google returns
// 400 Bad Request for a weight a family lacks), `c` is the one-line character Claude reads when choosing.
// Every face here renders ë and ç. The catalogue deliberately skips the faces every generated site reaches for
// (Fraunces, Playfair, Instrument Serif, DM Serif, Syne, Space Grotesk, Outfit, Inter as display).
export const FONTS = {
  display: [
    { name: 'Unbounded', w: [400, 500, 600, 700, 800, 900], c: 'wide geometric, loud, contemporary' },
    { name: 'Bricolage Grotesque', w: [400, 500, 600, 700, 800], c: 'quirky grotesk with warmth, new cafés' },
    { name: 'Sora', w: [400, 500, 600, 700, 800], c: 'clean geometric, calm, modern' },
    { name: 'Gabarito', w: [400, 500, 600, 700, 800, 900], c: 'rounded geometric, soft modern' },
    { name: 'Familjen Grotesk', w: [400, 500, 600, 700], c: 'friendly narrow grotesk' },
    { name: 'Chivo', w: [400, 500, 600, 700, 800, 900], c: 'sturdy grotesk, workshop, honest' },
    { name: 'Archivo', w: [400, 500, 600, 700, 800, 900], c: 'neutral workhorse grotesk' },
    { name: 'Archivo Black', w: [400], c: 'heavy poster sans' },
    { name: 'Anton', w: [400], c: 'tall condensed signage, grill, sport' },
    { name: 'Oswald', w: [400, 500, 600, 700], c: 'condensed menu-board sans, diner' },
    { name: 'Fjalla One', w: [400], c: 'condensed, plain, street food' },
    { name: 'Big Shoulders Display', w: [400, 500, 600, 700, 800, 900], c: 'industrial condensed, city' },
    { name: 'Barlow Condensed', w: [400, 500, 600, 700, 800, 900], c: 'condensed, garage, honest' },
    { name: 'Staatliches', w: [400], c: 'uppercase poster condensed' },
    { name: 'Bebas Neue', w: [400], c: 'uppercase only condensed, bar, night' },
    { name: 'Krona One', w: [400], c: 'very wide sans, retro modern' },
    { name: 'Righteous', w: [400], c: 'retro geometric, 70s' },
    { name: 'Josefin Sans', w: [400, 500, 600, 700], c: 'art deco geometric, elegant' },
    { name: 'Comfortaa', w: [400, 500, 600, 700], c: 'rounded geometric, gentle' },
    { name: 'Fredoka', w: [400, 500, 600, 700], c: 'rounded friendly, ice cream, kids' },
    { name: 'Lilita One', w: [400], c: 'chunky rounded, playful, pizza' },
    { name: 'Baloo 2', w: [400, 500, 600, 700, 800], c: 'rounded bold, cheerful' },
    { name: 'Caprasimo', w: [400], c: 'fat rounded display, dessert' },
    { name: 'Shrikhand', w: [400], c: 'fat italic display, tropical, juice' },
    { name: 'Bungee', w: [400], c: 'block signage, urban' },
    { name: 'Tilt Warp', w: [400], c: 'chunky warped, fun' },
    { name: 'Alfa Slab One', w: [400], c: 'heavy slab, burgers, smokehouse' },
    { name: 'Ultra', w: [400], c: 'very heavy slab, butcher' },
    { name: 'Zilla Slab', w: [400, 500, 600, 700], c: 'readable slab, café' },
    { name: 'Arvo', w: [400, 700], c: 'geometric slab, bakery' },
    { name: 'Young Serif', w: [400], c: 'soft chunky serif, bakery, pastry' },
    { name: 'Gloock', w: [400], c: 'heavy display serif, bold classic' },
    { name: 'Yeseva One', w: [400], c: 'warm rounded serif, bistro' },
    { name: 'Rozha One', w: [400], c: 'inky high-contrast serif, spice' },
    { name: 'Abril Fatface', w: [400], c: 'fat didone, café signage, 1900s' },
    { name: 'Prata', w: [400], c: 'delicate didone, patisserie, fine' },
    { name: 'Bodoni Moda', w: [400, 500, 600, 700, 800, 900], c: 'fashion didone, sharp luxury' },
    { name: 'Italiana', w: [400], c: 'thin elegant, hotel restaurant' },
    { name: 'Marcellus', w: [400], c: 'roman inscriptional, mediterranean' },
    { name: 'Cinzel', w: [400, 500, 600, 700, 800, 900], c: 'roman capitals, classical' },
    { name: 'EB Garamond', w: [400, 500, 600, 700, 800], c: 'bookish old-style serif' },
    { name: 'Libre Caslon Text', w: [400, 700], c: 'classic english serif, tea room' },
    { name: 'Literata', w: [400, 500, 600, 700, 800, 900], c: 'reading serif, calm, editorial' },
    { name: 'Averia Serif Libre', w: [400, 700], c: 'worn hand-set serif, rustic' },
    { name: 'Federo', w: [400], c: 'art nouveau, vintage' },
    { name: 'Amatic SC', w: [400, 700], c: 'hand-drawn condensed, chalkboard' },
    { name: 'Caveat', w: [400, 500, 600, 700], c: 'handwriting, notebook menu' },
    { name: 'Pacifico', w: [400], c: 'brush script, surf, summer' },
    { name: 'Kaushan Script', w: [400], c: 'brush script, energetic' },
    { name: 'Courgette', w: [400], c: 'soft script, sweets' },
  ],
  body: [
    { name: 'Onest', w: [400, 500, 600, 700], c: 'neutral humanist sans' },
    { name: 'Manrope', w: [400, 500, 600, 700, 800], c: 'modern geometric sans' },
    { name: 'Figtree', w: [400, 500, 600, 700], c: 'friendly geometric sans' },
    { name: 'Hanken Grotesk', w: [400, 500, 600, 700], c: 'clean grotesk' },
    { name: 'Nunito', w: [400, 500, 600, 700], c: 'rounded sans, soft' },
    { name: 'Karla', w: [400, 500, 600, 700], c: 'quirky grotesk, warm' },
    { name: 'Work Sans', w: [400, 500, 600, 700], c: 'plain grotesk' },
    { name: 'Albert Sans', w: [400, 500, 600, 700], c: 'geometric, scandinavian' },
    { name: 'Schibsted Grotesk', w: [400, 500, 600, 700], c: 'editorial grotesk' },
    { name: 'Golos Text', w: [400, 500, 600, 700], c: 'compact humanist' },
    { name: 'Sofia Sans', w: [400, 500, 600, 700], c: 'condensed-leaning humanist' },
    { name: 'Mulish', w: [400, 500, 600, 700], c: 'minimal sans' },
    { name: 'Be Vietnam Pro', w: [400, 500, 600, 700], c: 'sharp modern sans' },
    { name: 'Fira Sans', w: [400, 500, 600, 700], c: 'sturdy humanist' },
    { name: 'Atkinson Hyperlegible', w: [400, 700], c: 'high legibility sans' },
    { name: 'Literata', w: [400, 500, 600, 700], c: 'reading serif' },
    { name: 'Source Serif 4', w: [400, 500, 600, 700], c: 'transitional serif' },
    { name: 'Alegreya', w: [400, 500, 600, 700], c: 'calligraphic book serif' },
    { name: 'Crimson Pro', w: [400, 500, 600, 700], c: 'old-style book serif' },
    { name: 'Vollkorn', w: [400, 500, 600, 700], c: 'sturdy serif, bread' },
    { name: 'Bitter', w: [400, 500, 600, 700], c: 'slab for reading' },
  ],
};
export const DEFAULT_WEIGHTS = [400, 500, 600, 700];
const RADII = ['0px', '8px', '20px'];
const FRAMES = ['none', 'line', 'thick'];

const HEX = '^#[0-9A-Fa-f]{6}$';
const schema = {
  type: 'object', additionalProperties: false,
  required: ['bg', 'ink', 'primary', 'accent', 'muted', 'display', 'displayWeight', 'body', 'radius', 'frame', 'note'],
  properties: {
    bg: { type: 'string', pattern: HEX }, ink: { type: 'string', pattern: HEX }, primary: { type: 'string', pattern: HEX },
    accent: { type: 'string', pattern: HEX }, muted: { type: 'string', pattern: HEX },
    display: { type: 'string', enum: FONTS.display.map(f => f.name) },
    displayWeight: { type: 'integer', minimum: 400, maximum: 900 },
    body: { type: 'string', enum: FONTS.body.map(f => f.name) },
    radius: { type: 'string', enum: RADII },
    frame: { type: 'string', enum: FRAMES },
    note: { type: 'string' },
  },
};

function buildPrompt(place, photoCount) {
  const cat = list => list.map(f => `${f.name} (${f.w.join('/')}): ${f.c}`).join('\n');
  return `You are the art director for a one-page website of one specific restaurant in Kosovo. ${photoCount ? `The ${photoCount} attached photos are its own Google photos.` : 'There are no photos. Work from the name, category, reviews and city only; do not describe a room you have not seen, and say in the note that no photos were available.'}
Derive the site's visual identity from this place: the walls, wood, tiles, metal, lighting, plates, signage, menu boards, the food, the mood of the room and its customers. The owner will open the site on their phone and must feel "this is my place", not "this is a template". Two restaurants with different rooms must get visibly different sites.

The template renders everything from these tokens:
- bg: the page ground. ink: text on bg (contrast at least 7:1). Light or dark comes from the room's actual light and mood: a bright patisserie is light, a cellar bar or a night grill is dark. Avoid pure #000000 and pure #FFFFFF; tint the ground with the room's own hue.
- primary: the colour field behind the restaurant's name at the top of the page and behind the contact block at the bottom. Committed (a saturated colour taken from the place) or quiet (close to bg), your call from the photos.
- accent: the single colour that asks for a tap (the WhatsApp button, links, focus ring). Must read clearly against bg and against primary.
- muted: the surface of the menu cards and the hours list. A tint related to bg, or a second colour from the place.
- Text on primary, accent and muted is ink or bg, whichever contrasts more, so keep those three away from mid-tones.
- display: the face for the name and all headings. body: the text face. displayWeight: a weight the display face carries (listed in brackets).
- radius: "0px" sharp, "8px" soft, "20px" round: the corner language of cards, photos and buttons.
- frame: how cards and photos are edged: "none", "line" (hairline), "thick" (3px ink border).
- note: one English sentence naming what in the photos drove the choices (for the person running the factory).

Rules: hex as #RRGGBB. Choose faces like objects from this place's world; a script or handwritten face is for the rare place that really has that character. Warm cream + terracotta + a serif is the generic result; use it only when the room genuinely looks like that. Do not pick the same palette for a modern café, a family qebaptore and a fine-dining room.

Display catalogue (weights):
${cat(FONTS.display)}

Body catalogue (weights):
${cat(FONTS.body)}

THE PLACE:
${JSON.stringify(place, null, 2)}`;
}

// Fetches up to `max` photos as base64 image blocks. Places photo URLs carry maxWidthPx; 900 is plenty for a look.
export async function fetchPhotos(urls = [], max = 4) {
  const out = [];
  for (const u of urls.filter(Boolean).slice(0, max)) {
    try {
      const r = await fetch(u.replace(/maxWidthPx=\d+/, 'maxWidthPx=900'));
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !/^image\/(jpeg|png|webp|gif)/.test(type)) continue;
      const data = Buffer.from(await r.arrayBuffer()).toString('base64');
      out.push({ type: 'image', source: { type: 'base64', media_type: type.split(';')[0], data } });
    } catch { /* an unreachable photo is not a reason to fail the theme */ }
  }
  return out;
}

// Runs through the local Claude Code login; ANTHROPIC_API_KEY is stripped like in demo.mjs.
async function askClaude(prompt, images) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  async function* input() {
    yield { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: prompt }, ...images] } };
  }
  let theme;
  for await (const msg of query({
    prompt: input(),
    options: { model: 'claude-sonnet-4-6', tools: [], maxTurns: 3, env, outputFormat: { type: 'json_schema', schema } },
  })) {
    if (msg.type !== 'result') continue;
    if (msg.subtype !== 'success' || !msg.structured_output) {
      const detail = msg.subtype === 'success' ? msg.result : (msg.errors ? JSON.stringify(msg.errors) : '');
      throw new Error(`Claude did not return a theme (${msg.subtype})${detail ? `: ${detail}` : ''}`);
    }
    theme = msg.structured_output;
  }
  if (!theme) throw new Error('No result from Claude (is Claude Code logged in? run: claude login)');
  return theme;
}

// place: { name, types, city, address, rating, reviews_count, review_snippets, items? }, photos: URLs.
// Returns a repaired theme ready for config.json (see fixTheme).
export async function generateTheme(place, photos = []) {
  const images = await fetchPhotos(photos);
  const raw = await askClaude(buildPrompt(place, images.length), images);
  const { theme, changes } = fixTheme(raw);
  return { theme, changes, photosUsed: images.length };
}

// ---- colour maths (mirrors template/src/lib/config.ts so a config passes the same contrast the template computes) ----
const hexOk = h => typeof h === 'string' && /^#?[0-9a-f]{6}$/i.test(h.trim());
const norm = h => `#${h.trim().replace('#', '').toUpperCase()}`;
const rgb = h => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16));
const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0').toUpperCase()).join('')}`;
export function luminance(h) {
  const [r, g, b] = rgb(h).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t)); // t of b into a
// Pushes `color` toward black or white (whichever moves it away from `against`) until contrast >= target.
function push(color, against, target) {
  const toward = luminance(against) > 0.5 ? '#000000' : '#FFFFFF';
  let c = color;
  for (let t = 0.04; t <= 1 && contrast(c, against) < target; t += 0.04) c = mix(color, toward, t);
  return c;
}

// Fallback used when a token is missing or malformed. Deliberately plain: a fixed look is exactly what the factory avoids.
export const FALLBACK_THEME = { bg: '#FAF9F6', ink: '#1F1E1B', primary: '#2F3A34', accent: '#C8552D', muted: '#EEEBE3', display: 'Archivo', displayWeight: 700, body: 'Onest', radius: '0px', frame: 'line' };

// Validates and repairs a theme so every surface the template draws stays readable. Returns the repaired theme
// plus a list of what changed (empty when the input was already fine). Never throws.
export function fixTheme(input = {}) {
  const t = { ...input };
  const changes = [];
  for (const k of ['bg', 'ink', 'primary', 'accent', 'muted']) {
    if (!hexOk(t[k])) { changes.push(`${k}: "${t[k]}" is not a hex colour, using ${FALLBACK_THEME[k]}`); t[k] = FALLBACK_THEME[k]; }
    else t[k] = norm(t[k]);
  }
  // ink on bg: 7:1 so body text is comfortable on a phone outdoors
  if (contrast(t.ink, t.bg) < 7) { const fixed = push(t.ink, t.bg, 7); changes.push(`ink ${t.ink} -> ${fixed} (contrast with bg was ${contrast(t.ink, t.bg).toFixed(1)})`); t.ink = fixed; }
  // coloured surfaces: the template puts ink or bg on them, so one of the two must reach 4.5:1
  for (const k of ['primary', 'accent', 'muted']) {
    const best = c => Math.max(contrast(t.ink, c), contrast(t.bg, c));
    if (best(t[k]) >= 4.5) continue;
    const dark = push(t[k], t.bg, 4.5), light = push(t[k], t.ink, 4.5); // move it toward readable-with-bg or readable-with-ink
    const pick = [dark, light].filter(c => best(c) >= 4.5).sort((a, b) => contrast(a, t[k]) - contrast(b, t[k]))[0] || (luminance(t.bg) > 0.5 ? dark : light);
    changes.push(`${k} ${t[k]} -> ${pick} (no readable text colour on it)`); t[k] = pick;
  }
  // accent draws links and the focus ring on bg: needs 3:1 there
  if (contrast(t.accent, t.bg) < 3) { const fixed = push(t.accent, t.bg, 3); changes.push(`accent ${t.accent} -> ${fixed} (contrast with bg was ${contrast(t.accent, t.bg).toFixed(1)})`); t.accent = fixed; }

  const face = (list, name, key) => list.find(f => f.name === name) || (changes.push(`${key}: "${name}" is not in the catalogue, using ${FALLBACK_THEME[key]}`), list.find(f => f.name === FALLBACK_THEME[key]));
  const d = face(FONTS.display, t.display, 'display'), b = face(FONTS.body, t.body, 'body');
  t.display = d.name; t.body = b.name;
  const w = Number(t.displayWeight) || 700;
  const nearest = d.w.reduce((p, c) => (Math.abs(c - w) < Math.abs(p - w) ? c : p));
  if (nearest !== w) changes.push(`displayWeight ${w} -> ${nearest} (${d.name} carries ${d.w.join('/')})`);
  t.displayWeight = nearest;
  t.weights = { [d.name]: d.w, ...(b.name !== d.name ? { [b.name]: b.w } : {}) }; // Base.astro requests exactly these from Google Fonts
  // radius may be any CSS length by hand; frame is an enum. A missing value is the template default, not a repair.
  if (t.radius === undefined) t.radius = FALLBACK_THEME.radius;
  else if (!/^\d+(\.\d+)?(px|rem|em)$/.test(String(t.radius))) { changes.push(`radius "${t.radius}" -> ${FALLBACK_THEME.radius}`); t.radius = FALLBACK_THEME.radius; }
  if (t.frame === undefined) t.frame = FALLBACK_THEME.frame;
  else if (!FRAMES.includes(t.frame)) { changes.push(`frame "${t.frame}" -> ${FALLBACK_THEME.frame}`); t.frame = FALLBACK_THEME.frame; }
  // a card the same colour as the page with no edge is invisible
  if (t.frame === 'none' && contrast(t.muted, t.bg) < 1.15) { changes.push('frame none -> line (muted is the same as bg)'); t.frame = 'line'; }
  if (typeof t.note !== 'string') delete t.note;
  return { theme: t, changes };
}

// Pulls the fields the theme prompt needs out of a client config (for re-theming) or a lead (for demo).
export function placeFromConfig(config) {
  const b = config.business ?? {};
  return {
    name: b.name, city: b.city, address: b.address, rating: b.rating, reviews_count: b.reviews_count,
    vertical: config.vertical, tagline: b.tagline, about: config.about?.text,
    items: (config.items ?? []).slice(0, 12).map(i => i.name),
  };
}
export function placeFromLead(lead, vertical) {
  return { name: lead.name, city: lead.city, address: lead.address, types: lead.types ?? lead.type, rating: lead.rating, reviews_count: lead.reviews_count, review_snippets: lead.review_snippets, vertical };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [slug, ...rest] = process.argv.slice(2);
  if (!slug) { console.error('usage: theme <slug> [--dry-run]   (rewrites theme in places/<slug>/config.json from its photos)'); process.exit(1); }
  const file = configPath(slug);
  if (!fs.existsSync(file)) { console.error(`${file} not found`); process.exit(1); }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    const { theme, changes, photosUsed } = await generateTheme(placeFromConfig(config), [config.hero?.image, ...(config.gallery ?? [])]);
    console.log(`${photosUsed} photo(s) read. ${theme.note ?? ''}`);
    for (const c of changes) console.log(`repaired: ${c}`);
    console.log(JSON.stringify(theme, null, 2));
    if (rest.includes('--dry-run')) process.exit(0);
    config.theme = theme;
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
    console.log(`-> ${file}  (next: npm run build -- ${slug})`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
