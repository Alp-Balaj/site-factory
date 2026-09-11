// Usage: npm run dev -- <slug>   (live preview of one client)
import { spawnSync } from 'node:child_process';
const slug = process.argv[2] || 'demo-restaurant';
spawnSync('npx', ['astro', 'dev'], { cwd: 'template', stdio: 'inherit', shell: true, env: { ...process.env, CLIENT: slug } });
