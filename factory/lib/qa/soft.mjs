// Soft QA checks: Claude looks at preview-mobile.png and preview-desktop.png and scores five things 1–5 with a one-line
// reason each. Runs through the local Claude Code login like theme.mjs (claude-agent-sdk, no API key). The qa job skips
// this with --no-vision (params.vision false). Any score below 3 fails the gate (factory/jobs/qa.mjs).
//
//   first-viewport   the name and a photo of the place are recognisable in the first screen
//   hero-suits       the hero photo suits this kind of place
//   nothing-cut-off  no text or photo is clipped, overlapping or running off the page
//   menu-reads       the menu section reads as a menu (groups, names, prices in a column)
//   theme-fits       the colours and type fit the photos
import fs from 'node:fs';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { configPath, previewPath, readJson } from '../paths.mjs';

export const SOFT_CHECKS = [
  { id: 'first-viewport', ask: 'Is the place recognisable in the first viewport of the mobile preview: its name readable and a photo of the place visible before scrolling?' },
  { id: 'hero-suits', ask: 'Does the hero photo suit this place and archetype (food, room or facade of a place like this; not a parking lot, a logo, a screenshot or something text-heavy)?' },
  { id: 'nothing-cut-off', ask: 'Is nothing cut off: no text clipped or overlapping, no photo cropped into meaninglessness, no element running off the page, on either preview?' },
  { id: 'menu-reads', ask: 'Does the menu section read as a menu: groups, item names, short descriptions and a price column that lines up?' },
  { id: 'theme-fits', ask: 'Do the colours and typefaces fit the photos and the kind of place, so the page looks like it belongs to this restaurant?' },
];
export const SOFT_IDS = SOFT_CHECKS.map(c => c.id);
export const PASS_SCORE = 3;

const scoreSchema = {
  type: 'object', additionalProperties: false, required: ['score', 'reason'],
  properties: { score: { type: 'integer', minimum: 1, maximum: 5 }, reason: { type: 'string', maxLength: 200 } },
};
export const schema = {
  type: 'object', additionalProperties: false, required: SOFT_IDS,
  properties: Object.fromEntries(SOFT_IDS.map(id => [id, scoreSchema])),
};

export function buildPrompt({ name, archetype, city }) {
  const who = `${name}${city ? ` in ${city}` : ''}${archetype ? ` (archetype: ${archetype})` : ''}`;
  return `You are the QA reviewer for a generated one-page restaurant website. The two images are full-page screenshots
of the same page: first the phone view (390px wide), then the desktop view (1280px wide). The page is for ${who}.
The copy is Albanian; do not judge the language, only what is visible.

Score each question from 1 (clearly bad) to 5 (clearly good) and give a one-line reason in English that names what you
saw (e.g. "hero shows the counter with pastries", "price column wraps under the names on mobile"). 3 means acceptable
to show a prospect; below 3 means the operator must fix it before showing.

${SOFT_CHECKS.map((c, i) => `${i + 1}. ${c.id}: ${c.ask}`).join('\n')}`;
}

// The five results in contract order from Claude's structured output. Scores are clamped to 1–5 and rounded.
export function parseSoft(out) {
  if (!out || typeof out !== 'object') throw new Error('soft checks: no structured output from Claude');
  return SOFT_IDS.map(id => {
    const v = out[id];
    if (!v || typeof v !== 'object') throw new Error(`soft checks: "${id}" missing from Claude's answer`);
    const score = Math.min(5, Math.max(1, Math.round(Number(v.score) || 1)));
    return { id, score, reason: String(v.reason ?? '').trim() };
  });
}

export const softFailures = (soft) => soft.filter(s => s.score < PASS_SCORE);

const imageBlock = (file) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: fs.readFileSync(file).toString('base64') } });

async function askClaude(prompt, images, { model = 'claude-sonnet-4-6' } = {}) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // the Claude Code login pays, like every other call in the factory
  async function* input() {
    yield { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [...images, { type: 'text', text: prompt }] } };
  }
  let out;
  for await (const msg of query({
    prompt: input(),
    options: { model, tools: [], maxTurns: 3, env, outputFormat: { type: 'json_schema', schema } },
  })) {
    if (msg.type !== 'result') continue;
    if (msg.subtype !== 'success' || !msg.structured_output) {
      const detail = msg.subtype === 'success' ? msg.result : (msg.errors ? JSON.stringify(msg.errors) : '');
      throw new Error(`Claude did not return QA scores (${msg.subtype})${detail ? `: ${detail}` : ''}`);
    }
    out = msg.structured_output;
  }
  if (!out) throw new Error('No result from Claude (is Claude Code logged in? run: claude login)');
  return out;
}

// Scores a Place from its two previews. name/archetype/city default to config.json and state.json values.
export async function runSoft(slug, { name, archetype, city, config = readJson(configPath(slug), null), log = () => {}, model } = {}) {
  const previews = ['mobile', 'desktop'].map(v => previewPath(slug, v));
  const missing = previews.filter(p => !fs.existsSync(p));
  if (missing.length) throw new Error(`soft checks need both previews; missing ${missing.join(', ')} (run: npm run verify -- ${slug})`);
  const place = {
    name: name ?? config?.business?.name ?? slug,
    archetype: archetype ?? config?.archetype ?? '',
    city: city ?? config?.business?.city ?? '',
  };
  log(`vision: sending ${previews.map(p => p.split('/').pop()).join(' + ')} for ${place.name}${place.archetype ? ` (${place.archetype})` : ''}`);
  const raw = await askClaude(buildPrompt(place), previews.map(imageBlock), { model });
  const soft = parseSoft(raw);
  for (const s of soft) log(`${s.score >= PASS_SCORE ? 'ok  ' : 'LOW '} ${s.id} ${s.score}/5 ${s.reason}`);
  return soft;
}
