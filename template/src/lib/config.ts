import fs from 'node:fs';
import path from 'node:path';

export interface Item { group: string; name: string; desc?: string; price?: string }
export interface SiteConfig {
  slug: string; vertical: string;
  business: { name: string; tagline: string; phone: string; whatsapp: string; email?: string; address: string; city: string; mapsUrl?: string; lat?: number; lng?: number; instagram?: string; facebook?: string; rating?: number | null; reviews_count?: number };
  hours: { day: string; time: string }[];
  theme: { bg: string; ink: string; primary: string; accent: string; muted: string; display: string; body: string };
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
export const t = vertical.labels;
export const waLink = (msg = '') => `https://wa.me/${site.business.whatsapp}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
