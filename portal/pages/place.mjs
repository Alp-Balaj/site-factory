// GET /places/:slug  Everything about one Place: previews, QA, jobs, the editable CRM fields, notes and the actions.
import { dateOnly, esc, option, stamp, statusLabel } from '../html.mjs';
import { readLog } from '../data.mjs';
import { logBlock } from './jobs.mjs';

const act = (slug, action) => `/places/${esc(slug)}/actions/${action}`;

function actionButton(slug, action, label, { confirm = null, kind = '', disabled = false, hidden = {} } = {}) {
  const hiddenInputs = Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  return `<form method="post" action="${act(slug, action)}"${confirm ? ` data-confirm="${esc(confirm)}"` : ''}>${hiddenInputs}<button class="btn ${kind}" type="submit"${disabled ? ' disabled' : ''}>${esc(label)}</button></form>`;
}

function qaBlock(qa) {
  if (!qa) return '<p class="muted">QA has not run.</p>';
  const hard = (qa.hard ?? []).map(h => `<li class="${h.ok ? 'ok' : 'bad'}"><b>${esc(h.id)}</b> ${h.ok ? 'ok' : 'fail'}${h.detail ? ` <span class="muted">${esc(h.detail)}</span>` : ''}</li>`);
  const soft = (qa.soft ?? []).map(s => `<li class="${(s.score ?? 0) >= 3 ? 'ok' : 'bad'}"><b>${esc(s.id)}</b> ${esc(s.score)}/5${s.reason ? ` <span class="muted">${esc(s.reason)}</span>` : ''}</li>`);
  return `<p><span class="tag ${qa.passed ? 'ok' : 'bad'}">${qa.passed ? 'passed' : 'failed'}</span> <span class="muted">${esc(stamp(qa.at))}${qa.vision === false ? ' · hard checks only' : ''}</span></p>
${qa.reasons?.length ? `<ul class="reasons">${qa.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
<div class="two">
  <div><h3>Hard</h3>${hard.length ? `<ul class="checks">${hard.join('')}</ul>` : '<p class="muted">none</p>'}</div>
  <div><h3>Soft</h3>${soft.length ? `<ul class="checks">${soft.join('')}</ul>` : '<p class="muted">none</p>'}</div>
</div>`;
}

function archetypeField(p, archetypes) {
  const value = p.archetype;
  if (!archetypes) return `<label>Archetype <input name="archetype" value="${esc(value)}" placeholder="modern-cafe" autocomplete="off"><small>free text until factory/archetypes/restaurant.json exists</small></label>`;
  const known = archetypes.list.some(a => a.id === value);
  return `<label>Archetype <select name="archetype">
  ${option('', value ? '(clear: let classify decide)' : '(not set: classify decides)', value)}
  ${!known && value ? option(value, `${value} (unknown)`, value) : ''}
  ${archetypes.list.map(a => option(a.id, a.label === a.id ? a.id : `${a.label} · ${a.id}`, value)).join('')}
</select>${p.config?.archetype && p.config.archetype !== p.state.archetype ? `<small>config says ${esc(p.config.archetype)}; a value here wins</small>` : ''}</label>`;
}

export function placePage({ p, archetypes, jobs, registered }) {
  const s = p.state;
  const slug = p.slug;
  const status = s.status;
  const last = jobs[0] ?? null;
  const lastLines = last ? readLog(last, { tail: 40 }) : [];
  const can = (to) => p.allowed.includes(to);
  const jobBtn = (action, label, type, opts = {}) => actionButton(slug, action, registered.includes(type) ? label : `${label} (not registered)`, opts);
  const website = p.place?.website || p.config?.business?.instagram || '';

  const header = `<div class="page-head">
  <div>
    <h1>${esc(p.name)} <span class="tag status ${esc(status)}">${esc(statusLabel(status))}</span></h1>
    <div class="muted">${esc([p.city, p.vertical, p.archetype].filter(Boolean).join(' · '))}
      ${s.flags?.hasRealWebsite ? ' · <span class="tag warn">has website</span>' : ''}${s.flags?.fixture ? ' · <span class="tag">fixture</span>' : ''}
      ${p.place?.maps_url ? ` · <a href="${esc(p.place.maps_url)}" target="_blank" rel="noopener">Maps</a>` : ''}
      ${website ? ` · <a href="${esc(website)}" target="_blank" rel="noopener">${esc(website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</a>` : ''}
      ${s.pagesUrl ? ` · <a href="${esc(s.pagesUrl)}" target="_blank" rel="noopener">${esc(s.pagesUrl.replace(/^https?:\/\//, ''))}</a>` : ''}
    </div>
  </div>
  <div class="head-links">
    ${p.hasBuild ? `<a class="btn" href="/places/${esc(slug)}/demo/">Demo view</a>` : '<span class="muted">no build yet</span>'}
  </div>
</div>`;

  const previews = `<section class="previews">
  ${p.previews.mobile ? `<a href="/places/${esc(slug)}/preview/mobile" target="_blank"><img src="/places/${esc(slug)}/preview/mobile" alt="Mobile preview of ${esc(p.name)}" loading="lazy"></a>` : '<div class="empty tall">no mobile preview</div>'}
  ${p.previews.desktop ? `<a href="/places/${esc(slug)}/preview/desktop" target="_blank"><img src="/places/${esc(slug)}/preview/desktop" alt="Desktop preview of ${esc(p.name)}" loading="lazy"></a>` : '<div class="empty tall">no desktop preview</div>'}
</section>`;

  const actions = `<section class="panel">
  <h2>Actions</h2>
  <div class="btn-row">
    ${jobBtn('regenerate-theme', 'Regenerate theme', 'generate')}
    ${jobBtn('regenerate-copy', 'Regenerate copy', 'generate')}
    ${jobBtn('regenerate', 'Regenerate all', 'generate', { confirm: 'Regenerate theme and copy from scratch?' })}
    ${jobBtn('photos', 'Fetch photos', 'photos')}
    ${jobBtn('build', 'Build', 'build')}
  </div>
  <div class="btn-row">
    <form method="post" action="${act(slug, 'qa')}" class="inline">
      <button class="btn" type="submit"${registered.includes('qa') ? '' : ' disabled'}>Run QA${registered.includes('qa') ? '' : ' (not registered)'}</button>
      <label class="check"><input type="checkbox" name="vision" value="off"> no vision</label>
      <label class="check"><input type="checkbox" name="build" value="on"> rebuild first</label>
    </form>
  </div>
  <div class="btn-row">
    ${actionButton(slug, 'approve', 'Approve → ready', { kind: 'primary', disabled: !can('ready'), confirm: 'Approve this Demo as ready to show?' })}
    ${actionButton(slug, 'reject', 'Decline', { kind: 'danger', disabled: !can('declined'), confirm: 'Mark this Place as declined?' })}
    ${status === 'failed' ? actionButton(slug, 'retry', 'Retry → found') : ''}
    ${status === 'declined' ? actionButton(slug, 'reopen', 'Reopen → found') : ''}
    ${jobBtn('deploy', 'Deploy', 'deploy', { confirm: `Deploy ${p.name} to Cloudflare Pages?${s.domain ? ` Custom domain ${s.domain} must be attached in Cloudflare by hand.` : ''}` })}
  </div>
  <form method="post" action="${act(slug, 'status')}" class="inline-form">
    <label>Change status <select name="to"${p.allowed.length ? '' : ' disabled'}>${p.allowed.length ? p.allowed.map(t => option(t, statusLabel(t))).join('') : option('', 'final status')}</select></label>
    <label>Reason <input name="reason" placeholder="why" autocomplete="off"></label>
    <button class="btn" type="submit"${p.allowed.length ? '' : ' disabled'}>Move</button>
  </form>
  <p class="muted small">Allowed from ${esc(statusLabel(status))}: ${p.allowed.length ? p.allowed.map(statusLabel).map(esc).join(', ') : 'none (final)'}.</p>
</section>`;

  const fields = `<section class="panel">
  <h2>Fields</h2>
  <form method="post" action="/places/${esc(slug)}/save" class="form grid-form">
    <label>Contact person <input name="person" value="${esc(s.contact?.person ?? '')}" autocomplete="off"></label>
    <label>Phone <input name="phone" value="${esc(s.contact?.phone ?? '')}" placeholder="+383 4x xxx xxx" autocomplete="off" inputmode="tel"><small>also written to config.json business.phone</small></label>
    ${archetypeField(p, archetypes)}
    <label>Instagram handle <input name="instagram" value="${esc(s.instagram?.handle ?? '')}" placeholder="latarte.ks" autocomplete="off"><small>${s.instagram?.how ? `set by ${esc(s.instagram.how)}` : 'a hand-entered handle wins over discovery'}</small></label>
    <label>Follow-up <input name="followUp" type="date" value="${esc(dateOnly(s.followUp))}"></label>
    <label>Price agreed (€) <input name="priceAgreed" type="number" min="0" step="1" value="${esc(s.priceAgreed ?? '')}" inputmode="numeric"></label>
    <label>Paid on <input name="paidAt" type="date" value="${esc(dateOnly(s.paidAt))}"></label>
    <label>Domain <input name="domain" value="${esc(s.domain ?? '')}" placeholder="restorant-x.com" autocomplete="off"></label>
    <label class="span2">Feedback for the next regeneration <input name="feedback" value="${esc(s.feedback ?? '')}" placeholder="One sentence: warmer colours, fewer pizza items…" autocomplete="off"></label>
    <div class="actions span2"><button class="btn primary" type="submit">Save</button></div>
  </form>
</section>`;

  const notes = `<section class="panel">
  <h2>Notes</h2>
  <form method="post" action="/places/${esc(slug)}/note" class="inline-form">
    <label class="grow">Add a note <input name="text" placeholder="Owner is the son, speaks German" autocomplete="off" required></label>
    <button class="btn" type="submit">Add</button>
  </form>
  ${s.notes?.length ? `<ul class="notes">${[...s.notes].reverse().map(n => `<li><span class="muted n">${esc(stamp(n.at))}</span> ${esc(n.text)}</li>`).join('')}</ul>` : ''}
  <form method="post" action="/places/${esc(slug)}/notes" class="form">
    <label>notes.md <small>visit notes, fed into every regeneration</small><textarea name="md" rows="${Math.min(18, Math.max(5, p.notesMd.split('\n').length + 1))}" spellcheck="false">${esc(p.notesMd)}</textarea></label>
    <div class="actions"><button class="btn" type="submit">Save notes.md</button></div>
  </form>
</section>`;

  const jobsBlock = `<section class="panel">
  <h2>Jobs</h2>
  ${last ? `<p class="muted">Latest: <a href="/jobs/${esc(last.id)}">${esc(last.type)}</a> <span class="tag ${esc(last.status)}" data-job-status="${esc(last.id)}">${esc(last.status)}</span> ${esc(stamp(last.createdAt))}${last.error ? ` <span class="err">${esc(last.error)}</span>` : ''}</p>${logBlock(last, lastLines, { reloadOnDone: true })}` : '<p class="muted">No jobs yet.</p>'}
  ${jobs.length > 1 ? `<ul class="joblist">${jobs.slice(1).map(j => `<li><a href="/jobs/${esc(j.id)}">${esc(j.type)}</a> <span class="tag ${esc(j.status)}">${esc(j.status)}</span> <span class="muted n">${esc(stamp(j.createdAt))}</span>${j.error ? ` <span class="err">${esc(j.error)}</span>` : ''}</li>`).join('')}</ul>` : ''}
</section>`;

  const history = `<section class="panel">
  <h2>History</h2>
  <ul class="history">${[...(s.log ?? [])].reverse().map(l => `<li><span class="muted n">${esc(stamp(l.at))}</span> ${l.from ? `${esc(statusLabel(l.from))} → ` : ''}<b>${esc(statusLabel(l.to))}</b>${l.reason ? ` <span class="muted">${esc(l.reason)}</span>` : ''}</li>`).join('')}</ul>
</section>`;

  const raw = `<details class="panel"><summary>Raw files</summary>
<div class="two">
  <div><h3>state.json</h3><pre class="log small">${esc(JSON.stringify(s, null, 2))}</pre></div>
  <div><h3>place.json</h3><pre class="log small">${p.place ? esc(JSON.stringify({ ...p.place, photos: `[${p.place.photos?.length ?? 0} photos]`, review_snippets: `[${p.place.review_snippets?.length ?? 0} reviews]` }, null, 2)) : 'none'}</pre></div>
</div></details>`;

  return `${header}
<div class="detail">
  <div class="main-col">
    ${previews}
    <section class="panel"><h2>QA</h2>${qaBlock(s.qa)}</section>
    ${jobsBlock}
    ${history}
    ${raw}
  </div>
  <div class="side-col">
    ${actions}
    ${fields}
    ${notes}
  </div>
</div>`;
}

