// The QA gate as a job: build when the build is older than config.json, screenshots, hard checks, soft checks (Claude
// vision unless params.vision is false / --no-vision), then state.qa and the status move.
//
//   node factory/jobs/run.mjs qa <slug> [--no-vision] [--build]
//
// state.qa follows the contract: { at, passed, vision, hard[], soft[], reasons[] }; pass = every hard check ok and every
// soft score >= 3. The Place moves generating -> qa_passed | qa_failed with the reasons; a Place that is not in
// generating (a rerun by hand) takes the same move when the table allows it, or goes through generating when it can
// (qa_passed -> generating -> qa_failed), and otherwise keeps its status with state.qa updated.
//
// A build that fails is a hard failure ("build"), not a crashed job, so the Place lands in the review queue with the
// astro error as the reason. Item 30 lives in the phone check: a Place with no phone builds and then fails here.
import fs from 'node:fs';
import path from 'node:path';
import { build as buildPlace } from '../build.mjs';
import { canTransition } from '../lib/state.mjs';
import { buildDir, configPath, previewPath } from '../lib/paths.mjs';
import { takeScreenshots } from '../verify.mjs';
import { runHard } from '../lib/qa/hard.mjs';
import { runSoft, softFailures } from '../lib/qa/soft.mjs';

const mtime = (file) => (fs.existsSync(file) ? fs.statSync(file).mtimeMs : -1);

// True when there is no build or config.json changed after it.
export function needsBuild(slug) {
  const html = path.join(buildDir(slug), 'index.html');
  return !fs.existsSync(html) || mtime(html) < mtime(configPath(slug));
}

export const hasPreviews = (slug) => ['mobile', 'desktop'].every(v => fs.existsSync(previewPath(slug, v)));

export function reasonsOf(hard, soft) {
  return [
    ...hard.filter(h => !h.ok).map(h => `${h.id}: ${h.detail || 'failed'}`),
    ...softFailures(soft).map(s => `${s.id}: ${s.score}/5 ${s.reason}`.trim()),
  ];
}

// Moves the Place to `to` (qa_passed | qa_failed) the way the table allows from where it is. Returns the status.
export function settle(ctx, to, reason) {
  const from = ctx.reloadState()?.status;
  if (!from) throw new Error(`${ctx.slug}: no state.json`);
  if (from === to) { ctx.log(`status stays ${from}`); return from; }
  if (canTransition(from, to)) return ctx.setStatus(to, reason).status;
  if (canTransition(from, 'generating') && canTransition('generating', to)) {
    ctx.setStatus('generating', 'qa rerun');
    return ctx.setStatus(to, reason).status;
  }
  ctx.log(`status stays ${from} (${to} is not reachable from there); state.qa updated`);
  return from;
}

// deps lets tests swap the build, the screenshots and the two check runners.
export async function run(ctx, deps = {}) {
  const { build = buildPlace, screenshots = takeScreenshots, hard = runHard, soft = runSoft } = deps;
  const slug = ctx.slug;
  if (!slug) throw new Error('qa needs a Place');
  if (!ctx.config) throw new Error(`${configPath(slug)} not found (generate first)`);
  if (!ctx.state) throw new Error(`${slug}: no state.json`);
  const vision = ctx.params.vision !== false;
  const log = ctx.log;

  let buildError = null;
  if (ctx.params.build === true || needsBuild(slug)) {
    log(needsBuild(slug) ? 'build is missing or older than config.json, building' : 'building (asked)');
    try { await build(slug, { screenshots: true, log }); }
    catch (e) { buildError = e?.message ?? String(e); log(`build failed: ${buildError}`); }
  } else if (!hasPreviews(slug)) {
    log('previews missing, taking screenshots');
    const shots = await screenshots(slug);
    for (const p of Object.values(shots)) log(`-> ${p}`);
  }

  log('hard checks');
  const hardResults = await hard(slug, { config: ctx.config, log });
  if (buildError) {
    const b = hardResults.find(h => h.id === 'build');
    if (b) { b.ok = false; b.detail = `build failed: ${buildError}`; }
  }

  let softResults = [];
  if (!vision) log('soft checks skipped (--no-vision)');
  else if (buildError) log('soft checks skipped: the build failed');
  else if (!hasPreviews(slug)) log('soft checks skipped: no previews');
  else {
    log('soft checks (Claude vision)');
    softResults = await soft(slug, { config: ctx.config, archetype: ctx.state.archetype || ctx.config.archetype, log });
  }

  const reasons = reasonsOf(hardResults, softResults);
  const passed = reasons.length === 0;
  const qa = { at: new Date().toISOString(), passed, vision: vision && softResults.length > 0, hard: hardResults, soft: softResults, reasons };
  ctx.writeState({ qa });
  log(passed ? 'QA passed' : `QA failed: ${reasons.join('; ')}`);

  const status = settle(ctx, passed ? 'qa_passed' : 'qa_failed', passed ? 'qa passed' : `qa failed: ${reasons.join('; ')}`);
  return { passed, status, reasons };
}
