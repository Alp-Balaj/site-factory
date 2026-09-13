// The one shared layout: top nav, flash, page body. Every page returns a body string and passes it through here.
import { esc } from '../html.mjs';

const NAV = [
  ['/', 'Board'],
  ['/search', 'Search'],
  ['/jobs', 'Jobs'],
  ['/due', 'Due'],
  ['/clients', 'Clients'],
];

export function layout({ title, active = '', flash = null, body, wide = false, queueNote = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Portal</title>
<link rel="stylesheet" href="/public/portal.css">
<script src="/public/portal.js" defer></script>
</head>
<body>
<header class="top">
  <a class="brand" href="/">site-factory</a>
  <nav aria-label="Sections">
    ${NAV.map(([href, label]) => `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
  </nav>
  ${queueNote ? `<span class="queue-note">${queueNote}</span>` : ''}
</header>
${flash ? `<div class="flash ${esc(flash.kind || 'info')}" role="status">${flash.html ?? esc(flash.text)}</div>` : ''}
<main class="${wide ? 'wide' : ''}">
${body}
</main>
</body>
</html>`;
}
