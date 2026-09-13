// The generate job: one Place folder -> config.json, then build and qa are queued for it.
//   node factory/jobs/run.mjs generate <slug> [--only theme|copy] [--feedback "one sentence"] [--intake file.json] [--archetype id]
// Status: any status the table lets reach `generating` (found, qa_failed, qa_passed, ready, intake_received, live)
// moves to generating first; a thrown error moves the Place to failed. Classification runs unless state.archetype was
// set by hand (that value wins and is never overwritten). params.feedback is stored in state.feedback so the Portal
// shows what the last regeneration was asked for. params.chain false skips the build and qa jobs; params.dryRun (or
// --dry-run) generates and logs the result but changes no status and writes nothing.
import fs from 'node:fs';
import { generateDemo } from '../demo.mjs';
import { isRegistered } from '../lib/jobs.mjs';
import { canTransition } from '../lib/state.mjs';

export async function run(ctx) {
  const { slug, params } = ctx;
  if (!slug) throw new Error('generate needs a Place');
  if (!ctx.state) throw new Error(`${slug} has no state.json`);
  if (!ctx.place) throw new Error(`${slug} has no place.json`);
  const only = params.only || undefined;
  const feedback = typeof params.feedback === 'string' ? params.feedback.trim() : undefined;
  const intake = params.intake ? JSON.parse(fs.readFileSync(String(params.intake), 'utf8')) : {};
  if (params.intake) ctx.log(`intake: ${params.intake}`);
  const dryRun = params.dryRun === true || params['dry-run'] === true;

  if (dryRun) {
    const result = await generateDemo(slug, { intake, only, feedback, archetype: params.archetype, log: ctx.log });
    ctx.log(`[dry-run] archetype ${result.archetype.id} (${result.archetype.how}); nothing written`);
    if (only !== 'copy') ctx.log(`[dry-run] theme:\n${JSON.stringify(result.config.theme, null, 2)}`);
    if (only !== 'theme') ctx.log(`[dry-run] copy:\n${JSON.stringify({ tagline: result.config.business.tagline, hero: { headline: result.config.hero.headline, sub: result.config.hero.sub }, items: result.config.items, testimonials: result.config.testimonials }, null, 2)}`);
    return { dryRun: true, archetype: result.archetype, theme: result.theme, photos: result.photos };
  }

  if (ctx.state.status !== 'generating') {
    if (!canTransition(ctx.state.status, 'generating')) throw new Error(`${slug} is ${ctx.state.status}; cannot generate from there`);
    ctx.setStatus('generating', `generate${only ? ` --only ${only}` : ''}${feedback ? ' with feedback' : ''}`);
  }
  if (feedback !== undefined && feedback !== ctx.state.feedback) ctx.writeState({ feedback });

  try {
    const result = await generateDemo(slug, { intake, only, feedback, archetype: params.archetype, log: ctx.log });
    ctx.writeConfig(result.config);
    ctx.log(`config.json written: archetype ${result.archetype.id} (${result.archetype.how}), ${result.config.items.length} items (${result.config.items.filter(i => i.source === 'evidence').length} evidence), ${result.config.testimonials.length} testimonials, photos ${result.photos.from}${result.theme.fallback ? ', FALLBACK THEME' : ''}`);

    if (params.chain !== false) {
      for (const type of ['build', 'qa']) {
        if (await isRegistered(type)) { const j = ctx.enqueue(type, { slug, params: {} }); ctx.log(`queued ${type} ${j.id}`); }
        else ctx.log(`${type} is not registered yet; not queued (the Place stays generating until qa runs)`);
      }
    }
    return { archetype: result.archetype, theme: result.theme, photos: result.photos, only: only ?? 'all' };
  } catch (e) {
    ctx.reloadState();
    if (canTransition(ctx.state.status, 'failed')) ctx.setStatus('failed', `generate: ${e.message}`);
    throw e;
  }
}
