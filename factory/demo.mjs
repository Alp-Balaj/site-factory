// Usage: npm run demo -- leads/out/restorant-prishtine.json <place_id|index> [--intake intake.json]
// Produces clients/<slug>/config.json with Albanian copy generated from the lead (+ optional intake answers).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';

const [leadsFile, pick, ...rest] = process.argv.slice(2);
if (!leadsFile || pick === undefined) { console.error('usage: demo <leads.json> <place_id|index> [--intake file.json] [--vertical id]'); process.exit(1); }
const leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8'));
const lead = leads[Number(pick)] ?? leads.find(l => l.place_id === pick);
if (!lead) { console.error('lead not found'); process.exit(1); }
const intakeArg = rest[rest.indexOf('--intake') + 1];
const intake = rest.includes('--intake') ? JSON.parse(fs.readFileSync(intakeArg, 'utf8')) : {};
const verticalId = rest.includes('--vertical') ? rest[rest.indexOf('--vertical') + 1] : guessVertical(lead);
const preset = JSON.parse(fs.readFileSync(`template/src/verticals/${verticalId}.json`, 'utf8'));
const slug = slugify(intake.name || lead.name);

const prompt = `Ti shkruan tekstin për një uebfaqe të thjeshtë biznesi në Kosovë, në shqip.
${preset.copyBrief}

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

// Runs through the local Claude Code login (claude.ai subscription), not an API key.
// ANTHROPIC_API_KEY is stripped from the child env because the CLI prefers it over the subscription when set.
const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;
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

let copy;
for await (const msg of query({
  prompt,
  options: { model: 'claude-sonnet-4-6', tools: [], maxTurns: 3, env, outputFormat: { type: 'json_schema', schema } },
})) {
  if (msg.type !== 'result') continue;
  if (msg.subtype !== 'success' || !msg.structured_output) {
    console.error(`Claude did not return copy (${msg.subtype})`, msg.errors ?? '');
    if (msg.subtype === 'success') console.error(msg.result);
    process.exit(1);
  }
  copy = msg.structured_output;
}
if (!copy) { console.error('No result from Claude (is Claude Code logged in? run: claude login)'); process.exit(1); }

const config = {
  slug, vertical: verticalId,
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

fs.mkdirSync(`clients/${slug}`, { recursive: true });
fs.writeFileSync(`clients/${slug}/config.json`, JSON.stringify(config, null, 2));
console.log(`-> clients/${slug}/config.json  (next: npm run build -- ${slug})`);

function guessVertical(l) {
  const t = `${l.type ?? ''} ${l.vertical ?? ''} ${l.name ?? ''}`.toLowerCase();
  if (/dent|stomat/.test(t)) return 'dentist';
  if (/auto|servis|car_repair|gom/.test(t)) return 'auto';
  if (/guest|hotel|bujtin|lodg|hostel/.test(t)) return 'guesthouse';
  return 'restaurant';
}
function parseHours(list = []) {
  // Places API gives ["e hënë: 08:00–23:00", ...]; keep as displayable strings
  return list.map(s => { const [day, ...t] = s.split(': '); return { day, time: t.join(': ') || 'Mbyllur' }; });
}
function slugify(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ë/g, 'e').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
