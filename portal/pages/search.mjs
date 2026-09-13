// GET /search  Lead search form -> enqueues lead-search (S1's job) with { query, city, pages } and no slug.
import { esc, stamp } from '../html.mjs';

export function searchPage({ registered, recent }) {
  return `<div class="page-head"><h1>Lead search</h1></div>
${registered ? '' : '<p class="note">The <code>lead-search</code> job is not registered yet (S1 has not merged). The form is wired; it will flash and enqueue nothing.</p>'}
<form method="post" action="/search" class="form grid-form">
  <label>Query <input name="query" required placeholder="restorant" autocomplete="off"></label>
  <label>City <input name="city" required value="Prishtinë" autocomplete="off"></label>
  <label>Pages <input name="pages" type="number" min="1" max="10" value="3"></label>
  <div class="actions"><button class="btn primary" type="submit">Run search</button></div>
</form>
<p class="muted">Each new Place lands on the board as <b>found</b>; known Places keep their status. Google lists are cached under <code>leads/out/</code>.</p>
<h2>Recent searches</h2>
${recent.length ? `<table class="tbl"><thead><tr><th>When</th><th>Params</th><th>Status</th><th></th></tr></thead><tbody>${recent.map(j => `<tr><td class="n">${esc(stamp(j.createdAt))}</td><td>${esc(JSON.stringify(j.params))}</td><td><span class="tag ${esc(j.status)}">${esc(j.status)}</span></td><td><a href="/jobs/${esc(j.id)}">log</a></td></tr>`).join('')}</tbody></table>` : '<p class="muted">None yet.</p>'}`;
}
