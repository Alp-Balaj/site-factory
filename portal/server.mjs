// The Portal: npm run portal -> http://localhost:4400 (bound to 0.0.0.0 so a phone on the same Wi-Fi can open it).
// Plain node:http, server-rendered pages from portal/pages/*.mjs, one shared layout, a little client JS for the live
// log tail and confirm dialogs. AUTO_COMMIT=1 is set here so every state and config write commits (ADR 0001).
if (process.env.AUTO_COMMIT !== '0') process.env.AUTO_COMMIT = '1';
import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { current, events, list, queued, registeredTypes } from '../factory/lib/jobs.mjs';
import { buildDir, previewPath } from '../factory/lib/paths.mjs';
import { STATUSES } from '../factory/lib/state.mjs';
import { addPlaceNote, leadSearch, manualJob, placeAction, saveFields, saveNotesMd } from './actions.mjs';
import { JOB_ID_RE, allPlaces, archetypes, findJob, isLive, isPlace, loadPlace, placeJobs, readLog } from './data.mjs';
import { esc } from './html.mjs';
import { Router, html, notFound, readBody, redirect, send, takeFlash, text } from './router.mjs';
import { boardPage } from './pages/board.mjs';
import { clientsPage } from './pages/clients.mjs';
import { demoPage } from './pages/demo.mjs';
import { duePage } from './pages/due.mjs';
import { jobPage, jobsPage } from './pages/jobs.mjs';
import { layout } from './pages/layout.mjs';
import { placePage } from './pages/place.mjs';
import { searchPage } from './pages/search.mjs';

const PORT = Number(process.env.PORT || 4400);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json',
};
const mimeOf = (file) => MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

// A page = layout(flash, body). The queue note in the header shows what the worker is doing on every page.
function page(req, res, { title, active, body, wide }) {
  const now = current();
  const waiting = queued().length;
  const queueNote = now
    ? `<a href="/jobs/${esc(now.id)}">running ${esc(now.type)}${now.slug ? ` ${esc(now.slug)}` : ''}</a>${waiting ? ` +${waiting}` : ''}`
    : waiting ? `<a href="/jobs">${waiting} queued</a>` : '';
  html(res, layout({ title, active, flash: takeFlash(req, res), body, wide, queueNote }));
}

// Serves one file below `root`, refusing anything that resolves outside it. `rewrite` can edit text/html on the way out.
function serveFile(req, res, root, rel, { cache = 'no-store', rewrite = null } = {}) {
  const base = path.resolve(root);
  const file = path.resolve(base, rel.replace(/^\/+/, ''));
  if (file !== base && !file.startsWith(base + path.sep)) return notFound(res);
  let stat;
  try { stat = fs.statSync(file); } catch { return notFound(res); }
  const target = stat.isDirectory() ? path.join(file, 'index.html') : file;
  if (!fs.existsSync(target)) return notFound(res);
  const type = mimeOf(target);
  let body = fs.readFileSync(target);
  if (rewrite && type.startsWith('text/html')) body = Buffer.from(rewrite(body.toString('utf8')), 'utf8');
  if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': cache }); return res.end(); }
  send(res, 200, body, { 'Content-Type': type, 'Cache-Control': cache });
}

// Root-absolute references inside a built page point at the demo prefix, so /_astro/… style assets resolve.
const demoRewrite = (prefix) => (doc) => doc
  .replace(/\b(href|src|poster|content)=(["'])\/(?!\/)/g, `$1=$2${prefix}/`)
  .replace(/\bsrcset=(["'])([^"']*)\1/g, (m, q, v) => `srcset=${q}${v.replace(/(^|,\s*)\/(?!\/)/g, `$1${prefix}/`)}${q}`)
  .replace(/url\((["']?)\/(?!\/)/g, `url($1${prefix}/`);

const router = new Router();

router.get('/', (req, res) => page(req, res, { title: 'Board', active: '/', wide: true, body: boardPage(allPlaces()) }));
router.get('/due', (req, res) => page(req, res, { title: 'Due', active: '/due', body: duePage(allPlaces()) }));
router.get('/clients', (req, res) => page(req, res, { title: 'Clients', active: '/clients', body: clientsPage(allPlaces()) }));

router.get('/search', async (req, res) => {
  const types = await registeredTypes();
  const recent = list().filter(j => j.type === 'lead-search').slice(0, 20);
  page(req, res, { title: 'Lead search', active: '/search', body: searchPage({ registered: types.includes('lead-search'), recent }) });
});
router.post('/search', async (req, res) => {
  const r = await leadSearch(await readBody(req));
  redirect(res, r.to ?? '/search', r.flash);
});

router.get('/jobs', async (req, res) => {
  const now = current();
  const liveIds = new Set([now?.id, ...queued().map(j => j.id)].filter(Boolean));
  const finished = list().filter(j => !liveIds.has(j.id)).slice(0, 50);
  page(req, res, { title: 'Jobs', active: '/jobs', wide: true, body: jobsPage({ running: now, queued: queued(), finished, types: await registeredTypes() }) });
});
router.post('/jobs', async (req, res) => {
  const r = await manualJob(await readBody(req), isPlace);
  redirect(res, r.to ?? '/jobs', r.flash);
});
router.get('/jobs/:id', (req, res, { params }) => {
  if (!JOB_ID_RE.test(params.id)) return notFound(res);
  const job = findJob(params.id);
  if (!job) return notFound(res, `job ${params.id} not found`);
  page(req, res, { title: `${job.type} ${job.slug ?? ''}`, active: '/jobs', body: jobPage({ job, lines: readLog(job) }) });
});

// SSE: the whole log so far as 'log' events, then live lines and status changes until the job ends.
router.get('/jobs/:id/events', (req, res, { params }) => {
  if (!JOB_ID_RE.test(params.id)) return notFound(res);
  const id = params.id;
  const job = findJob(id);
  if (!job) return notFound(res, `job ${id} not found`);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  emit('hello', { id, status: job.status });
  for (const line of readLog(job)) emit('log', { id, line });
  const onLog = (e) => { if (e.id === id) emit('log', { id, line: e.line }); };
  const onChange = (j) => {
    if (j.id !== id) return;
    emit('change', { id, status: j.status, error: j.error ?? null });
    if (j.status === 'done' || j.status === 'failed') end();
  };
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  let closed = false;
  const end = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    events.off('log', onLog);
    events.off('change', onChange);
    try { emit('end', { id }); } catch {}
    res.end();
  };
  events.on('log', onLog);
  events.on('change', onChange);
  req.on('close', end);
  if (!isLive(job)) { emit('change', { id, status: job.status, error: job.error ?? null }); end(); }
});

// Place routes. Anything with an unknown slug is a 404 before it reaches a handler.
const withPlace = (handler) => (req, res, ctx) => {
  if (!isPlace(ctx.params.slug)) return notFound(res, `no Place "${ctx.params.slug}"`);
  return handler(req, res, ctx);
};

router.get('/places/:slug', withPlace(async (req, res, { params }) => {
  const p = loadPlace(params.slug);
  if (!p.state) return notFound(res, `${params.slug} has no state.json`);
  page(req, res, { title: p.name, active: '/', wide: true, body: placePage({ p, archetypes: archetypes(), jobs: placeJobs(params.slug, 10), registered: await registeredTypes() }) });
}));
router.post('/places/:slug/actions/:action', withPlace(async (req, res, { params }) => {
  const r = await placeAction(params.slug, params.action, await readBody(req));
  redirect(res, r.to ?? `/places/${params.slug}`, r.flash);
}));
router.post('/places/:slug/save', withPlace(async (req, res, { params }) => {
  const r = saveFields(params.slug, await readBody(req));
  redirect(res, `/places/${params.slug}`, r.flash);
}));
router.post('/places/:slug/notes', withPlace(async (req, res, { params }) => {
  const r = saveNotesMd(params.slug, await readBody(req));
  redirect(res, `/places/${params.slug}`, r.flash);
}));
router.post('/places/:slug/note', withPlace(async (req, res, { params }) => {
  const r = addPlaceNote(params.slug, await readBody(req));
  redirect(res, `/places/${params.slug}`, r.flash);
}));
router.get('/places/:slug/preview/:viewport', withPlace((req, res, { params }) => {
  if (!['mobile', 'desktop'].includes(params.viewport)) return notFound(res);
  const file = previewPath(params.slug, params.viewport);
  if (!fs.existsSync(file)) return notFound(res, 'no preview yet');
  serveFile(req, res, path.dirname(file), path.basename(file));
}));

// Demo view: the wrapper at /places/:slug/demo/, the build itself below it.
router.get('/places/:slug/demo', (req, res, { params }) => redirect(res, `/places/${params.slug}/demo/`));
router.get('/places/:slug/demo/*', withPlace((req, res, { params }) => {
  const rel = params.rest ?? '';
  if (rel === '') {
    const p = loadPlace(params.slug);
    const building = [current(), ...queued()].find(j => j && j.slug === params.slug && j.type === 'build') ?? null;
    return html(res, demoPage({ p, building, flash: takeFlash(req, res) }));
  }
  serveFile(req, res, buildDir(params.slug), rel, { rewrite: demoRewrite(`/places/${params.slug}/demo`) });
}));

router.get('/public/*', (req, res, { params }) => serveFile(req, res, PUBLIC_DIR, params.rest ?? '', { cache: 'max-age=60' }));
router.get('/favicon.ico', (req, res) => send(res, 204, ''));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith('/') && !/\/demo\/$/.test(pathname)) pathname = pathname.replace(/\/+$/, '') || '/';
  const match = router.match(req.method, pathname);
  if (!match) return notFound(res, `no route for ${req.method} ${url.pathname}`);
  try {
    await match.handler(req, res, { params: match.params, query: url.searchParams });
  } catch (e) {
    console.error(`${req.method} ${req.url}: ${e.stack ?? e}`);
    if (res.headersSent) return res.end();
    text(res, `error: ${e.message}`, 500);
  }
});

server.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log(`Portal on http://localhost:${PORT}${lan ? `  (phone: http://${lan}:${PORT})` : ''}`);
  console.log(`auto-commit ${process.env.AUTO_COMMIT === '1' ? 'on' : 'off'} · statuses: ${STATUSES.join(' → ')}`);
});
