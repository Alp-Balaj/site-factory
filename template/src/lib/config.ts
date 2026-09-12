import fs from 'node:fs';
import path from 'node:path';

export interface Item { group: string; name: string; desc?: string; price?: string }
export interface Hours { day: string; time: string }
export interface SiteConfig {
  slug: string; vertical: string;
  business: { name: string; tagline: string; phone: string; whatsapp: string; email?: string; address: string; city: string; mapsUrl?: string; lat?: number; lng?: number; instagram?: string; facebook?: string; rating?: number | null; reviews_count?: number };
  hours: Hours[];
  theme: { bg: string; ink: string; primary: string; accent: string; muted: string; display: string; body: string; displayWeight?: number };
  hero: { headline: string; sub: string; image?: string };
  about: { title: string; text: string };
  items: Item[];
  gallery: string[];
  seo: { title: string; description: string };
  credit?: { label?: string; url?: string }; // footer "Uebfaqe nga <label>" link; defaults in Contact.astro
}
export interface Vertical { id: string; labels: Record<string, string>; itemGroups: string[]; theme: SiteConfig['theme'] }

const slug = process.env.CLIENT || 'demo-restaurant';
const root = path.resolve(process.cwd(), '..');
const cfgPath = path.join(root, 'clients', slug, 'config.json');
if (!fs.existsSync(cfgPath)) throw new Error(`No config at ${cfgPath}. Set CLIENT=<slug>.`);

export const site: SiteConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
export const vertical: Vertical = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/verticals', `${site.vertical}.json`), 'utf8'));

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
