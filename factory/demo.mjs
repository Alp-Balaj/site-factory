// Usage: npm run demo -- leads/out/restorant-prishtine.json <place_id|index> [--intake intake.json] [--vertical id]
// Produces clients/<slug>/config.json with Albanian copy generated from the lead (+ optional intake answers).
// batch.mjs imports generateDemo() from here and runs it over a whole leads file.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';

const schema = {
  type: 'object', additionalProperties: false,
  required: ['tagline', 'hero', 'about', 'items', 'seo'],
  properties: {
    tagline: { type: 'string' },
    hero: { type: 'object', additionalProperties: false, required: ['headline', 'sub'], properties: { headline: { type: 'string' }, sub: { type: 'string' } } },
    about: { type: 'object', additionalProperties: false, required: ['title', 'text'], properties: { title: { type: 'string' }, text: { type: 'string' } } },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['group', 'name', 'desc', 'price'], properties: { group: { type: 'string' }, name: { type: 'string' }, desc: { type: 'string' }, price: { type: 'string' } } } },
    seo: { type: 'object', additionalProperties: false, required: ['title', 'description'], properties: { title: { type: 'string' }, description: { type: 'string' } } },
  },
};

function buildPrompt(lead, intake, preset) {
  return `Ti shkruan tekstin për një uebfaqe të thjeshtë biznesi në Kosovë, në shqip.
${preset.copyBrief}
Stil: fjali të shkurtra. Mos përdor vizë të gjatë (— ose –); përdor pikë, presje ose dy pika.

TË DHËNAT E BIZNESIT (mos i ndrysho faktet):
${JSON.stringify({ name: lead.name, address: lead.address, phone: lead.phone, rating: lead.rating, reviews_count: lead.reviews_count, review_snippets: lead.review_snippets, hours: lead.hours, city: lead.city }, null, 2)}

PËRGJIGJET E PRONARIT (kanë përparësi mbi çdo gjë tjetër, mund të jenë bosh):
${JSON.stringify(intake, null, 2)}

Grupet e lejuara për "items": ${JSON.stringify(preset.itemGroups)}

Kthe JSON me këtë strukturë:
{
  "tagline": "max 8 fjalë",
  "hero": { "headline": "max 10 fjalë, jo emri i biznesit", "sub": "1-2 fjali" },
  "about": { "title": "max 6 fjalë", "text": "2-3 paragrafë të shkurtër, ndarë me \\n\\n" },
  "items": [ { "group": "...", "name": "...", "desc": "max 12 fjalë ose bosh", "price": "p.sh. 4.50 €" } ],
  "seo": { "title": "max 60 karaktere", "description": "max 155 karaktere" }
}`;
}

// Runs through the local Claude Code login (claude.ai subscription), not an API key.
// ANTHROPIC_API_KEY is stripped from the child env because the CLI prefers it over the subscription when set.
async function generateCopy(prompt) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  let copy;
  for await (const msg of query({
    prompt,
    options: { model: 'claude-sonnet-4-6', tools: [], maxTurns: 3, env, outputFormat: { type: 'json_schema', schema } },
  })) {
    if (msg.type !== 'result') continue;
    if (msg.subtype !== 'success' || !msg.structured_output) {
      const detail = msg.subtype === 'success' ? msg.result : (msg.errors ? JSON.stringify(msg.errors) : '');
      throw new Error(`Claude did not return copy (${msg.subtype})${detail ? `: ${detail}` : ''}`);
    }
    copy = msg.structured_output;
  }
  if (!copy) throw new Error('No result from Claude (is Claude Code logged in? run: claude login)');
  return copy;
}

// Generates clients/<slug>/config.json for one lead. Throws with a plain message on failure.
// Returns { slug, configPath, config }.
export async function generateDemo(lead, { intake = {}, verticalId } = {}) {
  if (!lead?.name && !intake.name) throw new Error('lead has no name');
  const vertical = verticalId || guessVertical(lead);
  const presetFile = path.join('template', 'src', 'verticals', `${vertical}.json`);
  if (!fs.existsSync(presetFile)) throw new Error(`unknown vertical "${vertical}" (${presetFile} not found)`);
  const preset = JSON.parse(fs.readFileSync(presetFile, 'utf8'));
  const slug = slugify(intake.name || lead.name);
  if (!slug) throw new Error(`could not derive a slug from name "${intake.name || lead.name}"`);

  const copy = await generateCopy(buildPrompt(lead, intake, preset));

  const config = {
    slug, vertical,
    business: {
      name: intake.name || lead.name,
      tagline: copy.tagline,
      phone: intake.phone || lead.phone || '',
      whatsapp: (intake.whatsapp || intake.phone || lead.phone || '').replace(/[^\d]/g, ''),
      email: intake.email || '',
      address: intake.address || lead.address || '',
      city: lead.city,
      mapsUrl: lead.maps_url || '',
      lat: lead.lat, lng: lead.lng,
      instagram: intake.instagram || '', facebook: intake.facebook || '',
      rating: lead.rating, reviews_count: lead.reviews_count,
    },
    hours: intake.hours || parseHours(lead.hours),
    theme: { ...preset.theme, ...(intake.theme || {}) },
    hero: { ...copy.hero, image: intake.heroImage || lead.photos?.[0] || '' },
    about: copy.about,
    items: intake.items?.length ? intake.items : copy.items,
    gallery: intake.gallery?.length ? intake.gallery : (lead.photos ?? []).slice(1, 5),
    seo: copy.seo,
    meta: { lead_place_id: lead.place_id, generated_at: new Date().toISOString(), source: lead.source },
  };

  const dir = path.join('clients', slug);
  const configPath = path.join(dir, 'config.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return { slug, configPath, config };
}

export function guessVertical(l) {
  const t = `${l.type ?? ''} ${l.vertical ?? ''} ${l.name ?? ''}`.toLowerCase();
  if (/dent|stomat/.test(t)) return 'dentist';
  if (/auto|servis|car_repair|gom/.test(t)) return 'auto';
  if (/guest|hotel|bujtin|lodg|hostel/.test(t)) return 'guesthouse';
  return 'restaurant';
}
function parseHours(list = []) {
  // Places API gives ["e hënë: 08:00–23:00", ...] or, in Albanian locale, "8:00 p.d. – 11:00 m.d." (p.d. = AM, m.d. = PM).
  // Normalise to 24h "08:00 - 23:00" so hours read the same on every site.
  const to24 = (h, m, ap) => { let hh = Number(h) % 12; if (/^m/.test(ap)) hh += 12; return `${String(hh).padStart(2, '0')}:${m}`; };
  const clean = t => t
    .replace(/(\d{1,2}):(\d{2})\s*(p\.d\.|m\.d\.)/gi, (_, h, m, ap) => to24(h, m, ap.toLowerCase()))
    .replace(/\b(\d):(\d{2})/g, '0$1:$2')
    .replace(/\s*[\u2013\u2014\u2009\u202f-]+\s*/g, ' - ')
    .trim();
  return list.map(s => { const [day, ...t] = s.split(': '); return { day, time: clean(t.join(': ')) || 'Mbyllur' }; });
}
export function slugify(s) { return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ë/g, 'e').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [leadsFile, pick, ...rest] = process.argv.slice(2);
  if (!leadsFile || pick === undefined) { console.error('usage: demo <leads.json> <place_id|index> [--intake file.json] [--vertical id]'); process.exit(1); }
  const leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8'));
  const lead = leads[Number(pick)] ?? leads.find(l => l.place_id === pick);
  if (!lead) { console.error('lead not found'); process.exit(1); }
  const intakeArg = rest[rest.indexOf('--intake') + 1];
  const intake = rest.includes('--intake') ? JSON.parse(fs.readFileSync(intakeArg, 'utf8')) : {};
  const verticalId = rest.includes('--vertical') ? rest[rest.indexOf('--vertical') + 1] : undefined;
  try {
    const { slug, configPath } = await generateDemo(lead, { intake, verticalId });
    console.log(`-> ${configPath}  (next: npm run build -- ${slug})`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
