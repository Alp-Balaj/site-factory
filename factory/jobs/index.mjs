// The job registry. Every stream appends one line; the queue (factory/lib/jobs.mjs) looks types up here.
// build and deploy wrap the existing scripts; noop exists so the queue can be exercised without credentials.
import * as noop from './noop.mjs';
import * as generate from './generate.mjs';
import * as generateAll from '../batch.mjs';
import { build } from '../build.mjs';
import { deploy } from '../deploy.mjs';
import { canTransition } from '../lib/state.mjs';

const buildJob = {
  async run(ctx) {
    if (!ctx.slug) throw new Error('build needs a Place');
    const dir = await build(ctx.slug, { screenshots: ctx.params.screenshots !== false, log: ctx.log });
    ctx.log(`built ${dir}`);
    return { dir };
  },
};

const deployJob = {
  async run(ctx) {
    if (!ctx.slug) throw new Error('deploy needs a Place');
    const url = await deploy(ctx.slug, { log: ctx.log });
    ctx.log(`live at ${url}`);
    if (ctx.state) {
      ctx.writeState({ pagesUrl: url });
      if (canTransition(ctx.state.status, 'live')) ctx.setStatus('live', `deployed to ${url}`);
    }
    return { url };
  },
};

export const jobs = {
  noop,
  build: buildJob,
  deploy: deployJob,
  generate,
  'generate-all': generateAll,
};
