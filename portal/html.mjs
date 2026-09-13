// Tiny HTML helpers shared by every page: escaping, attribute building, dates. Every value that comes from a Place
// file goes through esc() before it lands in a page.
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// attrs({ class: 'x', disabled: true, hidden: false }) -> ' class="x" disabled'
export function attrs(obj = {}) {
  return Object.entries(obj)
    .filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
    .join('');
}

export const dateOnly = (iso) => (iso ? String(iso).slice(0, 10) : '');

// Local "YYYY-MM-DD HH:MM" for timestamps; the operator reads these on the machine that runs the Portal.
export function stamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function duration(a, b) {
  if (!a) return '';
  const ms = (b ? new Date(b) : new Date()) - new Date(a);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const statusLabel = (s) => String(s ?? '').replace(/_/g, ' ');

export function option(value, label, selected) {
  return `<option${attrs({ value, selected: selected === value })}>${esc(label)}</option>`;
}
