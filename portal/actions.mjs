// Every POST the Portal accepts. Each handler returns { flash, to? }: the flash message to show and where to redirect
// (default: back to the Place). Jobs are enqueued by name; a type the registry does not know yet (a stream that has
// not merged) flashes "not registered yet" and enqueues nothing.
import fs from 'node:fs';
import { commit } from '../factory/lib/git.mjs';
import { enqueue, isRegistered } from '../factory/lib/jobs.mjs';
import { configPath, notesPath, readJson, writeJson } from '../factory/lib/paths.mjs';
import { STATUSES, addNote, readState, transition, updateState } from '../factory/lib/state.mjs';
import { esc } from './html.mjs';

const ok = (text, extra = {}) => ({ flash: { kind: 'ok', text }, ...extra });
const err = (text, extra = {}) => ({ flash: { kind: 'err', text }, ...extra });
const jobFlash = (job, text) => ({ job, flash: { kind: 'ok', text, html: `${esc(text)} · <a href="/jobs/${esc(job.id)}">job ${esc(job.type)}</a>` } });

// The feedback sentence on the Place reaches generate as params.feedback (S3 also reads state.feedback itself).
const withFeedback = (state, params) => (state?.feedback ? { ...params, feedback: state.feedback } : params);

// action -> [job type, params(state, body)]
const JOB_ACTIONS = {
  'regenerate-theme': (state) => ['generate', withFeedback(state, { only: 'theme' })],
  'regenerate-copy': (state) => ['generate', withFeedback(state, { only: 'copy' })],
  regenerate: (state) => ['generate', withFeedback(state, {})],
  photos: () => ['photos', {}],
  qa: (state, body) => ['qa', { vision: body.vision !== 'off', ...(body.build === 'on' ? { build: true } : {}) }],
  build: () => ['build', {}],
  deploy: () => ['deploy', {}],
};

// action -> target status (transition() decides whether the move is allowed)
const MOVE_ACTIONS = { approve: 'ready', reject: 'declined', retry: 'found', reopen: 'found' };
const MOVE_REASONS = { approve: 'approved in the Portal', reject: 'declined in the Portal', retry: 'retry from the Portal', reopen: 'reopened in the Portal' };

export async function enqueueByName(type, { slug = null, params = {} } = {}) {
  if (!(await isRegistered(type))) return { flash: { kind: 'err', text: `job ${type} is not registered yet` } };
  const job = enqueue(type, { slug, params });
  return jobFlash(job, `${type} queued${slug ? ` for ${slug}` : ''}`);
}

export async function placeAction(slug, action, body) {
  const state = readState(slug);
  if (!state) return err(`${slug} has no state.json`);

  if (action in JOB_ACTIONS) {
    const [type, params] = JOB_ACTIONS[action](state, body);
    const r = await enqueueByName(type, { slug, params });
    if (body.back === 'demo') r.to = `/places/${slug}/demo/`;
    return r;
  }
  if (action in MOVE_ACTIONS) return move(slug, MOVE_ACTIONS[action], body.reason || MOVE_REASONS[action]);
  if (action === 'status') {
    if (!STATUSES.includes(body.to)) return err(`unknown status "${body.to}"`);
    return move(slug, body.to, body.reason || 'changed in the Portal');
  }
  return err(`unknown action "${action}"`);
}

function move(slug, to, reason) {
  try {
    const state = transition(slug, to, reason);
    return ok(`${slug} is now ${state.status.replace(/_/g, ' ')}`);
  } catch (e) {
    return err(e.message);
  }
}

// The Fields form: every CRM field in one save. The phone also lands in config.json so the next build carries it.
export function saveFields(slug, body) {
  const state = readState(slug);
  if (!state) return err(`${slug} has no state.json`);
  const str = (v) => String(v ?? '').trim();
  const dateOrNull = (v) => (str(v) ? str(v) : null);
  const handle = str(body.instagram).replace(/^@/, '');
  const price = str(body.priceAgreed);
  const patch = {
    contact: { ...(state.contact ?? {}), person: str(body.person), phone: str(body.phone) },
    archetype: str(body.archetype),
    instagram: handle
      ? { ...(state.instagram ?? {}), handle, how: handle === state.instagram?.handle ? (state.instagram?.how || 'manual') : 'manual' }
      : { ...(state.instagram ?? {}), handle: '', how: '' },
    followUp: dateOrNull(body.followUp),
    priceAgreed: price === '' ? null : Number(price),
    paidAt: dateOrNull(body.paidAt),
    domain: str(body.domain).replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    feedback: str(body.feedback),
  };
  if (patch.priceAgreed !== null && !Number.isFinite(patch.priceAgreed)) return err('price must be a number');
  updateState(slug, patch, `state(${slug}): fields edited in the Portal`);

  const changed = ['state.json'];
  const config = readJson(configPath(slug), null);
  if (config && patch.contact.phone && (config.business?.phone ?? '') !== patch.contact.phone) {
    const business = { ...(config.business ?? {}), phone: patch.contact.phone };
    if (!business.whatsapp) business.whatsapp = patch.contact.phone.replace(/\D/g, '');
    writeJson(configPath(slug), { ...config, business });
    commit([configPath(slug)], `config(${slug}): phone from the Portal`);
    changed.push('config.json');
  }
  return ok(`saved ${changed.join(' and ')}`);
}

export function saveNotesMd(slug, body) {
  const file = notesPath(slug);
  const md = String(body.md ?? '').replace(/\r\n/g, '\n');
  if (!md.trim() && !fs.existsSync(file)) return ok('notes.md left empty');
  fs.writeFileSync(file, md.endsWith('\n') || !md ? md : md + '\n');
  commit([file], `notes(${slug}): edited in the Portal`);
  return ok('notes.md saved');
}

export function addPlaceNote(slug, body) {
  const text = String(body.text ?? '').trim();
  if (!text) return err('note is empty');
  addNote(slug, text);
  return ok('note added');
}

// POST /search
export async function leadSearch(body) {
  const query = String(body.query ?? '').trim();
  const city = String(body.city ?? '').trim();
  const pages = Math.min(10, Math.max(1, Number(body.pages) || 3));
  if (!query || !city) return err('query and city are required', { to: '/search' });
  const r = await enqueueByName('lead-search', { params: { query, city, pages } });
  r.to = r.job ? `/jobs/${r.job.id}` : '/search';
  return r;
}

// POST /jobs: the manual enqueue form ("k=v k2=v2" params, typed like run.mjs does).
export async function manualJob(body, isPlace) {
  const type = String(body.type ?? '').trim();
  const slug = String(body.slug ?? '').trim() || null;
  if (!type) return err('type is required', { to: '/jobs' });
  if (slug && !isPlace(slug)) return err(`no Place "${slug}"`, { to: '/jobs' });
  const params = {};
  for (const kv of String(body.params ?? '').trim().split(/\s+/).filter(Boolean)) {
    const i = kv.indexOf('=');
    const k = i === -1 ? kv : kv.slice(0, i);
    const v = i === -1 ? 'true' : kv.slice(i + 1);
    params[k] = v === 'true' ? true : v === 'false' ? false : v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
  }
  const r = await enqueueByName(type, { slug, params });
  r.to = '/jobs';
  return r;
}
