// GET /jobs      queue, running job with a live log, the last 50 finished.
// GET /jobs/:id  one job: record, log (live when still running).
import { duration, esc, stamp } from '../html.mjs';

export function jobRow(j) {
  return `<tr>
  <td class="n"><a href="/jobs/${esc(j.id)}">${esc(stamp(j.createdAt))}</a></td>
  <td>${esc(j.type)}</td>
  <td>${j.slug ? `<a href="/places/${esc(j.slug)}">${esc(j.slug)}</a>` : '<span class="muted">—</span>'}</td>
  <td><span class="tag ${esc(j.status)}" data-job-status="${esc(j.id)}">${esc(j.status)}</span></td>
  <td class="n">${esc(duration(j.startedAt, j.endedAt))}</td>
  <td class="err">${esc(j.error ?? '')}</td>
</tr>`;
}

const table = (rows) => `<div class="scroll"><table class="tbl"><thead><tr><th>When</th><th>Type</th><th>Place</th><th>Status</th><th>Took</th><th>Error</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

export function jobsPage({ running, queued, finished, types }) {
  return `<div class="page-head"><h1>Jobs</h1><span class="muted">one worker, FIFO · types: ${types.map(esc).join(', ')}</span></div>
<form method="post" action="/jobs" class="form inline-form">
  <label>Run <select name="type">${types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></label>
  <label>Place <input name="slug" placeholder="slug (optional)" autocomplete="off"></label>
  <label>Params <input name="params" placeholder="k=v k2=v2" autocomplete="off"></label>
  <button class="btn" type="submit">Enqueue</button>
</form>
<h2>Running</h2>
${running ? `${table([jobRow(running)])}${logBlock(running, [])}` : '<p class="muted">Idle.</p>'}
<h2>Queued <span class="count">${queued.length}</span></h2>
${queued.length ? table(queued.map(jobRow)) : '<p class="muted">Nothing waiting.</p>'}
<h2>Finished <span class="count">${finished.length}</span></h2>
${finished.length ? table(finished.map(jobRow)) : '<p class="muted">No finished jobs yet.</p>'}`;
}

// A log <pre>. Live jobs get data-job-log, and portal.js tails /jobs/:id/events into it.
export function logBlock(job, lines, { live = job.status === 'queued' || job.status === 'running', reloadOnDone = false } = {}) {
  return `<pre class="log" ${live ? `data-job-log="${esc(job.id)}"${reloadOnDone ? ' data-reload-on-done' : ''}` : ''}>${lines.map(esc).join('\n')}</pre>`;
}

export function jobPage({ job, lines }) {
  const back = job.slug ? `<a href="/places/${esc(job.slug)}">← ${esc(job.slug)}</a>` : '<a href="/jobs">← jobs</a>';
  return `<div class="page-head"><h1>${esc(job.type)} <span class="tag ${esc(job.status)}" data-job-status="${esc(job.id)}">${esc(job.status)}</span></h1>${back}</div>
<dl class="kv">
  <dt>Id</dt><dd><code>${esc(job.id)}</code></dd>
  <dt>Place</dt><dd>${job.slug ? `<a href="/places/${esc(job.slug)}">${esc(job.slug)}</a>` : '—'}</dd>
  <dt>Params</dt><dd><code>${esc(JSON.stringify(job.params ?? {}))}</code></dd>
  <dt>Created</dt><dd>${esc(stamp(job.createdAt))}</dd>
  <dt>Started</dt><dd>${esc(stamp(job.startedAt))}</dd>
  <dt>Ended</dt><dd>${esc(stamp(job.endedAt))} ${job.startedAt ? `<span class="muted">(${esc(duration(job.startedAt, job.endedAt))})</span>` : ''}</dd>
  ${job.error ? `<dt>Error</dt><dd class="err">${esc(job.error)}</dd>` : ''}
  ${job.result !== undefined ? `<dt>Result</dt><dd><code>${esc(JSON.stringify(job.result))}</code></dd>` : ''}
</dl>
<h2>Log</h2>
${logBlock(job, lines)}
${job.slug && job.type === 'build' ? `<p><a class="btn" href="/places/${esc(job.slug)}/demo/">Open demo</a></p>` : ''}`;
}
