// GET /due  Places whose follow-up is today or earlier, grouped by status.
import { STATUSES } from '../../factory/lib/state.mjs';
import { dateOnly, esc, statusLabel, today } from '../html.mjs';

export function duePage(places) {
  const cutoff = today();
  const due = places.filter(p => p.state.followUp && dateOnly(p.state.followUp) <= cutoff)
    .sort((a, b) => (a.state.followUp < b.state.followUp ? -1 : 1));
  const groups = new Map();
  for (const p of due) groups.set(p.state.status, [...(groups.get(p.state.status) ?? []), p]);
  const sections = STATUSES.filter(s => groups.has(s)).map(s => `<h2>${esc(statusLabel(s))} <span class="count">${groups.get(s).length}</span></h2>
<table class="tbl"><thead><tr><th>Follow-up</th><th>Place</th><th>Contact</th><th>Phone</th><th>Last note</th></tr></thead><tbody>
${groups.get(s).map(p => {
    const last = (p.state.notes ?? []).at(-1);
    const overdue = dateOnly(p.state.followUp) < cutoff;
    return `<tr><td class="n ${overdue ? 'err' : ''}">${esc(dateOnly(p.state.followUp))}</td><td><a href="/places/${esc(p.slug)}">${esc(p.name)}</a> <span class="muted">${esc(p.city)}</span></td><td>${esc(p.state.contact?.person ?? '')}</td><td>${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : ''}</td><td class="muted">${esc(last?.text ?? '')}</td></tr>`;
  }).join('')}
</tbody></table>`);
  return `<div class="page-head"><h1>Due</h1><span class="muted">${due.length} follow-ups on or before ${esc(cutoff)}</span></div>
${sections.length ? sections.join('') : '<p class="muted">Nothing due. Set a follow-up date on a Place to see it here.</p>'}`;
}
