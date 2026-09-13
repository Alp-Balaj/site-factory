// Runs a command and forwards every output line to `log` (a job log, or console.log by default), so build and deploy
// stream through the job queue the same way they print in a terminal. Resolves with the exit code; never throws on a
// non-zero exit (the caller decides the message), throws only when the process cannot be spawned.
import { spawn } from 'node:child_process';

// The shell is needed so `npx` resolves on Windows too (npx.cmd), but Node warns (DEP0190) when an args array meets
// shell: true, so the command goes over as one quoted string instead.
const quote = (s) => (/^[\w./:=@%+-]+$/.test(s) ? s : `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`);

export function run(cmd, args, { cwd, env = process.env, log = console.log } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn([cmd, ...args].map(quote).join(' '), { cwd, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const forward = (stream) => {
      let rest = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        const lines = (rest + chunk).split(/\r?\n/);
        rest = lines.pop();
        for (const line of lines) if (line.trim()) log(line);
      });
      stream.on('end', () => { if (rest.trim()) log(rest); });
    };
    forward(child.stdout);
    forward(child.stderr);
    child.on('error', reject);
    child.on('close', code => resolve(code ?? 1));
  });
}
