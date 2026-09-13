// Instagram for the pool: find the Place's handle (item 13), then pull its latest posts through Apify (item 14).
//
// discoverHandle(place, state) decides in this order:
//   (c) a handle typed by hand in the Portal (state.instagram.how === 'manual', or a handle with no `how`) wins outright;
//   (a) place.website pointing at instagram.com gives the handle directly;
//   (b) a Claude web search for "<name> <city> instagram", accepted only when the profile name matches the Place name
//       after slugify on both sides, or confidence >= 0.8 and the city appears in the bio.
// fetchPosts(handle, 20) calls the apify/instagram-scraper actor synchronously; no APIFY_TOKEN means no posts, never a
// failed job (the job logs the skip).
import { query } from '@anthropic-ai/claude-agent-sdk';
import { slugify } from '../slug.mjs';

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9_])?$/;
// Paths under instagram.com that are never a profile.
const NOT_A_PROFILE = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'direct', 'tv', 'about', 'legal', 'share']);

// "@La.Tarte " -> "la.tarte"; null when it cannot be an Instagram handle.
export function normalizeHandle(raw) {
  const h = String(raw ?? '').trim().replace(/^@/, '').toLowerCase();
  return HANDLE_RE.test(h) ? h : null;
}

// The handle in an instagram.com URL, or null (also null for post, reel and explore links).
export function handleFromWebsite(url) {
  if (!url) return null;
  let u;
  try { u = new URL(String(url).trim().startsWith('http') ? String(url).trim() : `https://${String(url).trim()}`); } catch { return null; }
  if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
  const [first] = u.pathname.split('/').filter(Boolean);
  if (!first || NOT_A_PROFILE.has(first.toLowerCase())) return null;
  return normalizeHandle(first);
}

// Whether a search result belongs to this Place. Returns { ok, why } so the log can say what decided it.
export function matchesPlace(result, place) {
  if (!result || !normalizeHandle(result.handle)) return { ok: false, why: 'no usable handle' };
  const nameA = slugify(result.profileName);
  const nameB = slugify(place?.name);
  if (nameA && nameB && nameA === nameB) return { ok: true, why: `profile name "${result.profileName}" matches` };
  const confidence = Number(result.confidence ?? 0);
  const city = slugify(place?.city);
  const bio = slugify(result.bio);
  if (confidence >= 0.8 && city && bio.includes(city)) return { ok: true, why: `confidence ${confidence} and "${place.city}" in the bio` };
  return { ok: false, why: `profile name "${result.profileName ?? ''}" is not "${place?.name ?? ''}" (confidence ${confidence}${city && !bio.includes(city) ? ', city not in bio' : ''})` };
}

// The handle for a Place: { handle, how } or null. `search` is injectable (tests pass a stub; the default asks Claude).
export async function discoverHandle(place, state, { search = searchHandle, log = () => {} } = {}) {
  const manual = normalizeHandle(state?.instagram?.handle);
  const how = state?.instagram?.how || '';
  if (manual && (how === 'manual' || how === '')) return { handle: manual, how: 'manual' };

  const fromSite = handleFromWebsite(place?.website);
  if (fromSite) return { handle: fromSite, how: 'google' };

  let result = null;
  try { result = await search(place); } catch (e) { log(`instagram search failed: ${e.message}`); return null; }
  if (!result) { log('instagram search: no candidate'); return null; }
  const verdict = matchesPlace(result, place);
  log(`instagram search: @${result.handle ?? '?'} ${verdict.ok ? 'accepted' : 'rejected'}: ${verdict.why}`);
  return verdict.ok ? { handle: normalizeHandle(result.handle), how: 'search' } : null;
}

const searchSchema = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    handle: { type: 'string', description: 'Instagram username without @, empty when nothing plausible was found' },
    profileName: { type: 'string', description: 'The display name on the profile, exactly as written' },
    bio: { type: 'string', description: 'The profile bio text, as much as the search results show' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['found', 'handle', 'profileName', 'bio', 'confidence'],
  additionalProperties: false,
};

// Asks Claude (through the Claude Code login, like theme.mjs) to web-search the Place and report the best candidate.
// Returns { handle, profileName, bio, confidence } or null.
export async function searchHandle(place) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const prompt = [
    `Find the official Instagram account of this business. Use the WebSearch tool with the query: "${place.name} ${place.city ?? ''} instagram".`,
    `Business: ${place.name}, ${place.address ?? ''} (${place.city ?? ''}, Kosovo). Category: ${place.type ?? place.vertical ?? ''}.`,
    'Report the single best candidate: its username (handle), the profile display name exactly as shown, the bio text you can see, and your confidence 0..1 that it is this exact business (not a namesake elsewhere).',
    'If nothing plausible turns up, set found to false and confidence to 0. Do not invent a handle.',
  ].join('\n');
  let out = null;
  for await (const msg of query({
    prompt,
    options: { model: 'claude-sonnet-4-6', tools: ['WebSearch'], allowedTools: ['WebSearch'], maxTurns: 4, env, outputFormat: { type: 'json_schema', schema: searchSchema } },
  })) {
    if (msg.type !== 'result') continue;
    if (msg.subtype !== 'success' || !msg.structured_output) {
      const detail = msg.subtype === 'success' ? msg.result : (msg.errors ? JSON.stringify(msg.errors) : '');
      throw new Error(`Claude did not return a search result (${msg.subtype})${detail ? `: ${detail}` : ''}`);
    }
    out = msg.structured_output;
  }
  if (!out) throw new Error('No result from Claude (is Claude Code logged in? run: claude login)');
  return out.found && out.handle ? out : null;
}

const APIFY_ACTOR = 'apify~instagram-scraper';

// Latest posts of a profile through Apify's synchronous endpoint. Returns [{ url, image, caption, timestamp }], photos
// only (videos have no still worth storing). `token` and `fetchImpl` are injectable for tests.
export async function fetchPosts(handle, limit = 20, { token = process.env.APIFY_TOKEN, fetchImpl = fetch, timeoutMs = 300_000 } = {}) {
  const h = normalizeHandle(handle);
  if (!h) throw new Error(`"${handle}" is not an Instagram handle`);
  if (!token) throw new Error('APIFY_TOKEN missing');
  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${Math.ceil(timeoutMs / 1000)}`;
  const input = { directUrls: [`https://www.instagram.com/${h}/`], resultsType: 'posts', resultsLimit: limit, addParentData: false };
  const r = await fetchImpl(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs + 30_000),
  });
  if (!r.ok) throw new Error(`Apify HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const items = await r.json();
  if (!Array.isArray(items)) throw new Error('Apify returned no dataset');
  return items.map(postFromItem).filter(Boolean).slice(0, limit);
}

// One actor item to the shape the pool stores. Exported for tests.
export function postFromItem(item) {
  if (!item || item.error) return null;
  if (item.type === 'Video' && !item.displayUrl) return null;
  const image = item.displayUrl ?? item.images?.[0] ?? null;
  const url = item.url ?? (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : null);
  if (!image || !url) return null;
  return { url, image, caption: String(item.caption ?? '').trim(), timestamp: item.timestamp ?? null };
}
