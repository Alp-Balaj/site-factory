// The smallest router that fits: method + path pattern (":slug" segments, a trailing "*"), urlencoded bodies, a flash
// message carried in a short-lived cookie between a POST and the redirect that follows it. No framework, no build step.
import { StringDecoder } from 'node:string_decoder';

const MAX_BODY = 1 << 20; // 1 MB of form data is more than any Portal form sends

export class Router {
  constructor() { this.routes = []; }

  add(method, pattern, handler) {
    const keys = [];
    const source = pattern
      .split('/')
      .map(seg => {
        if (seg === '*') { keys.push('rest'); return '(.*)'; }
        if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.routes.push({ method, keys, re: new RegExp(`^${source}$`), handler });
    return this;
  }
  get(pattern, handler) { return this.add('GET', pattern, handler); }
  post(pattern, handler) { return this.add('POST', pattern, handler); }

  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method && !(r.method === 'GET' && method === 'HEAD')) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = safeDecode(m[i + 1]); });
      return { handler: r.handler, params };
    }
    return null;
  }
}

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// application/x-www-form-urlencoded -> plain object; repeated keys become arrays.
export function readBody(req) {
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder('utf8');
    let raw = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('request body too large')); req.destroy(); return; }
      raw += decoder.write(chunk);
    });
    req.on('end', () => {
      raw += decoder.end();
      const out = {};
      for (const [k, v] of new URLSearchParams(raw)) {
        if (k in out) out[k] = [].concat(out[k], v);
        else out[k] = v;
      }
      resolve(out);
    });
    req.on('error', reject);
  });
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = safeDecode(part.slice(i + 1).trim());
  }
  return out;
}

// Flash: { kind: 'ok' | 'err' | 'info', text } set on a redirect, read and cleared on the next page render.
const FLASH = 'sf_flash';
export const flashCookie = (flash) => `${FLASH}=${encodeURIComponent(JSON.stringify(flash))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`;
const clearFlash = () => `${FLASH}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function takeFlash(req, res) {
  const raw = parseCookies(req)[FLASH];
  if (!raw) return null;
  res.setHeader('Set-Cookie', clearFlash());
  try { return JSON.parse(raw); } catch { return null; }
}

// Responses. Every page goes through html(); every POST ends in redirect().
export function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''), 'utf8');
  res.writeHead(status, { 'Content-Length': buf.length, ...headers });
  res.end(buf);
}
export const html = (res, body, status = 200) => send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
export const text = (res, body, status = 200) => send(res, status, body, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
export const json = (res, data, status = 200) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
export function redirect(res, location, flash = null) {
  const headers = { Location: location };
  if (flash) headers['Set-Cookie'] = flashCookie(flash);
  res.writeHead(303, headers);
  res.end();
}
export const notFound = (res, what = 'not found') => text(res, what, 404);
