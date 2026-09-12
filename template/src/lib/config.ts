import fs from 'node:fs';
import path from 'node:path';

export interface Item { group: string; name: string; desc?: string; price?: string }
export interface Hours { day: string; time: string }
// The theme is the client's identity, generated per restaurant from its own photos (factory/theme.mjs).
// The template is only the skeleton: it draws every surface from these tokens and adds no look of its own.
export interface Theme {
  bg: string; ink: string; primary: string; accent: string; muted: string;
  display: string; body: string; displayWeight?: number;
  weights?: Record<string, number[]>;           // static weights each family carries on Google Fonts (missing: probed at build)
  radius?: string;                              // corner language: "0px" | "8px" | "20px" (any CSS length works)
  frame?: 'none' | 'line' | 'thick';            // how cards and photos are edged
  note?: string;                                // why (written by the generator, for the operator)
}
export interface SiteConfig {
  slug: string; vertical: string;
  business: { name: string; tagline: string; phone: string; whatsapp: string; email?: string; address: string; city: string; mapsUrl?: string; lat?: number; lng?: number; instagram?: string; facebook?: string; rating?: number | null; reviews_count?: number };
  hours: Hours[];
  theme: Theme;
  hero: { headline: string; sub: string; image?: string };
  about: { title: string; text: string };
  items: Item[];
  gallery: string[];
  seo: { title: string; description: string };
  credit?: { label?: string; url?: string }; // footer "Uebfaqe nga <label>" link; defaults in Contact.astro
}
export interface Vertical { id: string; labels: Record<string, string>; itemGroups: string[]; theme: Theme }

const slug = process.env.CLIENT || 'demo-restaurant';
const root = path.resolve(process.cwd(), '..');
const cfgPath = path.resolve(root, process.env.PLACES_DIR || 'places', slug, 'config.json'); // factory/lib/paths.mjs
if (!fs.existsSync(cfgPath)) throw new Error(`No config at ${cfgPath}. Set CLIENT=<slug>.`);

export const site: SiteConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
export const vertical: Vertical = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/verticals', `${site.vertical}.json`), 'utf8'));

// The vertical's fallback fills any token a client config leaves out (hand-edited or pre-generator configs).
export const theme: Theme = { radius: '0px', frame: 'line', ...vertical.theme, ...site.theme };

// Labels every vertical needs; a vertical preset overrides any of them.
const defaultLabels = {
  call: 'Thirr',
  reviews: 'nga %n vlerësime në Google',
  readReviews: 'Lexoji vlerësimet',
  map: 'Harta',
  allHours: 'Shih orarin e plotë',
  otherGroup: 'Tjera',
  credit: 'Uebfaqe nga',
};
export const t: Record<string, string> = { ...defaultLabels, ...vertical.labels };

export const waLink = (msg = '') => `https://wa.me/${site.business.whatsapp}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;

// Merges consecutive days with the same time: [hënë 8-23, martë 8-23, mërkurë 8-23] -> [{ day: "e hënë - e mërkurë", time: "8-23" }].
export function compactHours(hours: Hours[] = []): Hours[] {
  const out: (Hours & { last?: string })[] = [];
  for (const h of hours) {
    const prev = out[out.length - 1];
    if (prev && prev.time === h.time) prev.last = h.day;
    else out.push({ ...h });
  }
  return out.map(({ day, last, time }) => ({ day: last ? `${day} - ${last}` : day, time }));
}

// Luminance of a #rrggbb colour, 0..1. Decides color-scheme and which token contrasts with which.
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const DEFAULT_WEIGHTS = [400, 500, 600, 700];
// Google Fonts rejects a css2 request naming a weight the family lacks (400 Bad Request, no fonts at all).
// Generated configs carry theme.weights; for a hand-edited config we probe once at build time and fall back
// to the family's regular face when the default list is refused. Offline builds keep the default list.
export async function fontWeights(family: string): Promise<number[]> {
  if (theme.weights?.[family]?.length) return theme.weights[family];
  const url = (w: number[]) => `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${w.join(';')}`;
  try {
    const r = await fetch(url(DEFAULT_WEIGHTS), { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (r.ok) return DEFAULT_WEIGHTS;
    console.warn(`theme: ${family} has no 400-700 range on Google Fonts, requesting the regular face only (set theme.weights to fix)`);
    return [400];
  } catch { return DEFAULT_WEIGHTS; }
}
