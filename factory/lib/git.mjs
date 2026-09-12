// Auto-commit after state or config writes (ADR 0001: the repo is the CRM). Active only when AUTO_COMMIT=1, which the
// Portal sets for its own process; CLI runs and tests leave it off. Never pushes, never throws: a failed commit is a warning.
import { spawnSync } from 'node:child_process';

export const autoCommitEnabled = () => process.env.AUTO_COMMIT === '1';

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

// Stages `paths` (a string or an array) and commits them with `message`. Returns true when a commit was made.
export function commit(paths, message) {
  if (!autoCommitEnabled()) return false;
  const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
  if (!list.length) return false;
  try {
    const add = git(['add', '--', ...list]);
    if (!add.ok) { console.warn(`auto-commit: git add failed: ${add.err}`); return false; }
    const staged = git(['diff', '--cached', '--quiet', '--', ...list]);
    if (staged.ok) return false; // nothing changed in these paths
    const c = git(['commit', '--quiet', '-m', message, '--only', '--', ...list]);
    if (!c.ok) { console.warn(`auto-commit: git commit failed: ${c.err}`); return false; }
    return true;
  } catch (e) {
    console.warn(`auto-commit: ${e.message}`);
    return false;
  }
}
