// GET /places/:slug/demo/  The Demo view: the built site in a full-window iframe plus a floating bar with Rebuild.
// The Skeleton document itself is served untouched at /places/:slug/demo/index.html (root-absolute asset paths get the
// demo prefix on the way out; the build inlines its CSS and ships no JS, so there is little to rewrite).
import { esc } from '../html.mjs';

export function demoPage({ p, building, flash }) {
  const base = `/places/${esc(p.slug)}/demo/`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.name)} · Demo</title>
<link rel="stylesheet" href="/public/portal.css">
<script src="/public/portal.js" defer></script>
</head>
<body class="demo-body">
${p.hasBuild
    ? `<iframe class="demo-frame" src="${base}index.html" title="${esc(p.name)}"></iframe>`
    : `<main><div class="page-head"><h1>${esc(p.name)}</h1></div><p class="note">No build yet for <code>${esc(p.slug)}</code>. Run Build first.</p></main>`}
<div class="demo-bar" data-demo-bar>
  <a href="/places/${esc(p.slug)}" title="Back to the Place">← ${esc(p.name)}</a>
  ${flash ? `<span class="demo-flash ${esc(flash.kind)}">${esc(flash.text)}</span>` : ''}
  ${building
    ? `<span class="demo-flash info" data-job-log="${esc(building.id)}" data-reload-on-done data-quiet>building… <a href="/jobs/${esc(building.id)}">log</a></span>`
    : `<form method="post" action="/places/${esc(p.slug)}/actions/build"><input type="hidden" name="back" value="demo"><button class="btn small" type="submit">Rebuild</button></form>`}
</div>
</body>
</html>`;
}
