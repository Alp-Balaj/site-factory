// GET /clients  Places in paid, live or churned: what they pay, when, where the site lives.
import { dateOnly, esc, statusLabel } from '../html.mjs';

const CLIENT_STATUSES = ['paid', 'live', 'churned'];

export function clientsPage(places) {
  const rows = places.filter(p => CLIENT_STATUSES.includes(p.state.status))
    .sort((a, b) => CLIENT_STATUSES.indexOf(a.state.status) - CLIENT_STATUSES.indexOf(b.state.status) || a.name.localeCompare(b.name));
  return `<div class="page-head"><h1>Clients</h1><span class="muted">${rows.length} paid, live or churned</span></div>
${rows.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Place</th><th>Status</th><th>Price</th><th>Paid</th><th>Domain</th><th>Pages URL</th><th>Contact</th></tr></thead><tbody>
${rows.map(p => `<tr>
  <td><a href="/places/${esc(p.slug)}">${esc(p.name)}</a> <span class="muted">${esc(p.city)}</span></td>
  <td><span class="tag ${esc(p.state.status)}">${esc(statusLabel(p.state.status))}</span></td>
  <td class="n">${p.state.priceAgreed != null ? `${esc(p.state.priceAgreed)} €` : ''}</td>
  <td class="n">${esc(dateOnly(p.state.paidAt))}</td>
  <td>${p.state.domain ? `<a href="https://${esc(p.state.domain)}" target="_blank" rel="noopener">${esc(p.state.domain)}</a>` : '<span class="muted">—</span>'}</td>
  <td>${p.state.pagesUrl ? `<a href="${esc(p.state.pagesUrl)}" target="_blank" rel="noopener">${esc(p.state.pagesUrl.replace(/^https?:\/\//, ''))}</a>` : '<span class="muted">not deployed</span>'}</td>
  <td>${esc(p.state.contact?.person ?? '')} ${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : ''}</td>
</tr>`).join('')}
</tbody></table></div>` : '<p class="muted">No Clients yet. A Place becomes a Client at <b>paid</b>.</p>'}`;
}
