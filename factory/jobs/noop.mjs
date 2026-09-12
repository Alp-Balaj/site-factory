// The job that does nothing: five log lines over five seconds, so the queue, the log stream and the Portal's SSE tail
// can be exercised without Claude, Google or Cloudflare.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function run(ctx) {
  const lines = Number(ctx.params.lines ?? 5);
  const delay = Number(ctx.params.delayMs ?? 1000);
  for (let i = 1; i <= lines; i++) {
    ctx.log(`noop ${i}/${lines}${ctx.slug ? ` for ${ctx.slug}` : ''}`);
    if (i < lines) await sleep(delay);
  }
  if (ctx.params.fail) throw new Error(String(ctx.params.fail === true ? 'asked to fail' : ctx.params.fail));
  return { lines };
}
