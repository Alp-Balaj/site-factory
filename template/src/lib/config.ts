import fs from 'node:fs';
import path from 'node:path';

export interface Item { group: string; name: string; desc?: string; price?: string; source?: 'evidence' | 'filler' }
export interface Hours { day: string; time: string }
export interface Testimonial { name?: string; text: string }

// A photo in config.json is either a plain URL (configs from before the photo pool) or an object that says where it
// came from. Google photos carry the author for the attribution Google requires; Instagram and owner photos carry none.
export type PhotoSource = 'google' | 'instagram' | 'owner';
export interface Photo { src: string; source: PhotoSource; author?: { name: string; uri?: string } }
export type PhotoInput = string | Partial<Photo> | null | undefined;

// Layout variants: a few fixed shapes per section, chosen per Place by the theme call, all CSS-only in the skeleton.
export const LAYOUT_OPTIONS = {
  hero: ['photo', 'split', 'type'],
  menu: ['list', 'cards', 'board'],
  gallery: ['grid', 'strip', 'single', 'none'],
  rhythm: ['tight', 'airy'],
  order: ['menu-first', 'about-first'],
} as const;
export type Layout = { [K in keyof typeof LAYOUT_OPTIONS]: (typeof LAYOUT_OPTIONS)[K][number] };
export const DEFAULT_LAYOUT: Layout = { hero: 'photo', menu: 'list', gallery: 'grid', rhythm: 'tight', order: 'menu-first' };

// The theme is the client's identity, generated per restaurant from its own photos (factory/theme.mjs).
// The template is only the skeleton: it draws every surface from these tokens and adds no look of its own.
export interface Theme {
  bg: string; ink: string; primary: string; accent: string; muted: string;
  display: string; body: string; displayWeight?: number;
  weights?: Record<string, number[]>;           // static weights each family carries on Google Fonts (missing: probed at build)
  radius?: string;                              // corner language: "0px" | "8px" | "20px" (any CSS length works)
  frame?: 'none' | 'line' | 'thick';            // how cards and photos are edged
  layout?: Partial<Layout>;                     // section shapes; anything missing or unknown falls back to DEFAULT_LAYOUT
  note?: string;                                // why (written by the generator, for the operator)
}
export interface SiteConfig {
  slug: string; vertical: string;
  archetype?: string;
  business: { name: string; tagline: string; phone: string; whatsapp: string; email?: string; address: string; city: string; mapsUrl?: string; lat?: number; lng?: number; instagram?: string; facebook?: string; rating?: number | null; reviews_count?: number };
  hours: Hours[];
  theme: Theme;
  hero: { headline: string; sub: string; image?: PhotoInput };
  about: { title: string; text: string };
  items: Item[];
  itemGroups?: string[];                        // per-archetype groups written by the generator; the vertical's list otherwise
  gallery: PhotoInput[];
  testimonials?: Testimonial[];
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

// Unknown or missing layout values fall back one key at a time, so a hand-edited config can never break the build.
function readLayout(input: Partial<Record<keyof Layout, unknown>> = {}): Layout {
  const out: Layout = { ...DEFAULT_LAYOUT };
  for (const key of Object.keys(LAYOUT_OPTIONS) as (keyof Layout)[]) {
    const v = input[key];
    if (typeof v === 'string' && (LAYOUT_OPTIONS[key] as readonly string[]).includes(v)) (out as Record<keyof Layout, string>)[key] = v;
  }
  return out;
}
export const layout: Layout = readLayout(theme.layout ?? {});

// Normalises a config photo. A plain string is a photo of unknown origin (pre-pool configs): rendered, never attributed.
export function photoOf(p: PhotoInput): Photo | null {
  if (!p) return null;
  if (typeof p === 'string') return p.trim() ? { src: p.trim(), source: 'owner' } : null;
  if (typeof p.src !== 'string' || !p.src.trim()) return null;
  const source: PhotoSource = p.source === 'google' || p.source === 'instagram' ? p.source : 'owner';
  const name = typeof p.author?.name === 'string' ? p.author.name.trim() : '';
  const uri = typeof p.author?.uri === 'string' && p.author.uri.trim() ? p.author.uri.trim() : undefined;
  return { src: p.src.trim(), source, ...(name ? { author: { name, ...(uri ? { uri } : {}) } } : {}) };
}
export const heroPhoto: Photo | null = photoOf(site.hero?.image);
export const galleryPhotos: Photo[] = (site.gallery ?? []).map(photoOf).filter((p): p is Photo => p !== null);
export const testimonials: Testimonial[] = (site.testimonials ?? []).filter(q => q && typeof q.text === 'string' && q.text.trim() !== '');
export const itemGroups: string[] = site.itemGroups?.length ? site.itemGroups : vertical.itemGroups;

// Labels every vertical needs; a vertical preset overrides any of them.
const defaultLabels = {
  call: 'Thirr',
  reviews: 'nga %n vlerësime në Google',
  readReviews: 'Lexoji vlerësimet',
  map: 'Harta',
  allHours: 'Shih orarin e plotë',
  otherGroup: 'Tjera',
  credit: 'Uebfaqe nga',
  sample: 'shembull',
  testimonials: 'Çka thonë',
  photoBy: 'Foto nga',
  poweredBy: 'Powered by Google', // Google's attribution text for Places photos; not translated on purpose
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
