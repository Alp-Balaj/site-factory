// GET /  The pipeline board: one column per status in pipeline order, one card per Place.
import { STATUSES } from '../../factory/lib/state.mjs';
import { dateOnly, esc, statusLabel, today } from '../html.mjs';
import { groupByStatus, qaSummary } from '../data.mjs';

export function card(p) {
  const s = p.state;
  const qa = qaSummary(s);
  const due = s.followUp && s.followUp <= today();
  const tags = [];
  if (p.archetype) tags.push(`<span class="tag">${esc(p.archetype)}</span>`);
  if (s.flags?.hasRealWebsite) tags.push('<span class="tag warn" title="Google lists a real website">has website</span>');
  if (s.flags?.fixture) tags.push('<span class="tag">fixture</span>');
  if (qa) tags.push(`<span class="tag ${qa.passed ? 'ok' : 'bad'}" title="${esc(qa.reasons.join('\n'))}">QA ${qa.passed ? 'pass' : `fail${qa.reasons.length ? ` · ${qa.reasons.length}` : ''}`}</span>`);
  if (s.followUp) tags.push(`<span class="tag ${due ? 'due' : ''}">follow-up ${esc(dateOnly(s.followUp))}</span>`);
  return `<article class="card">
  <a class="card-name" href="/places/${esc(p.slug)}">${esc(p.name)}</a>
  <div class="card-sub">${esc(p.city || '—')}</div>
  <div class="tags">${tags.join('')}</div>
  ${s.status === 'ready' ? `<a class="btn small" href="/places/${esc(p.slug)}/demo/">Show</a>` : ''}
</article>`;
}

export function boardPage(places) {
  const groups = groupByStatus(places);
  const columns = STATUSES.map(status => {
    const items = groups[status] ?? [];
    return `<section class="col" aria-label="${esc(statusLabel(status))}">
  <h2><span>${esc(statusLabel(status))}</span><span class="count">${items.length}</span></h2>
  ${items.length ? items.map(card).join('') : '<div class="empty">—</div>'}
</section>`;
  });
  return `<div class="page-head"><h1>Board</h1><span class="muted">${places.length} Places</span></div>
<div class="board">${columns.join('')}</div>`;
}
