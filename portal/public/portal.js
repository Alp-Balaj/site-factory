// The little client JS: tail a job log over SSE, confirm before risky posts, keep the log scrolled.
(function () {
  'use strict';

  // <pre data-job-log="<id>" [data-reload-on-done] [data-quiet]>: append every log line as it arrives.
  document.querySelectorAll('[data-job-log]').forEach(function (el) {
    var id = el.getAttribute('data-job-log');
    if (!id || !window.EventSource) return;
    var quiet = el.hasAttribute('data-quiet');
    var es = new EventSource('/jobs/' + encodeURIComponent(id) + '/events');
    var atBottom = function () { return el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
    // The stream replays the whole log file first, so the server-rendered tail is replaced, not duplicated.
    es.addEventListener('hello', function () { if (!quiet) el.textContent = ''; });
    es.addEventListener('log', function (e) {
      if (quiet) return;
      var stick = atBottom();
      var data = JSON.parse(e.data);
      el.textContent += (el.textContent ? '\n' : '') + data.line;
      if (stick) el.scrollTop = el.scrollHeight;
    });
    es.addEventListener('change', function (e) {
      var data = JSON.parse(e.data);
      document.querySelectorAll('[data-job-status="' + id + '"]').forEach(function (tag) {
        tag.textContent = data.status;
        tag.className = 'tag ' + data.status;
      });
      if (data.status === 'done' || data.status === 'failed') {
        es.close();
        if (el.hasAttribute('data-reload-on-done')) setTimeout(function () { location.reload(); }, 600);
      }
    });
    es.addEventListener('end', function () { es.close(); });
    es.onerror = function () { /* the browser retries; when the job is gone the server answers 404 and we stop */ };
    if (!quiet) el.scrollTop = el.scrollHeight;
  });

  // <form data-confirm="Question?">: ask before submitting.
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-confirm]');
    if (form && !window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
  });

  // Keyboard: "/" focuses the first text input on the page, "g b" / "g j" / "g s" jump to Board / Jobs / Search.
  var pending = '';
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') {
      var input = document.querySelector('main input:not([type="hidden"]):not([type="checkbox"]), main textarea');
      if (input) { e.preventDefault(); input.focus(); }
      return;
    }
    if (pending === 'g') {
      var to = { b: '/', j: '/jobs', s: '/search', d: '/due', c: '/clients' }[e.key];
      pending = '';
      if (to) location.href = to;
      return;
    }
    pending = e.key === 'g' ? 'g' : '';
  });
})();
