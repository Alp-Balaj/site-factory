// Usage: node factory/migrate/hours.mjs [--dry-run]
// One-off: rewrites `hours[].time` in every places/*/config.json to the "08:00 - 23:00" form demo.mjs writes today.
// Older configs kept whatever Google gave ("8:00 p.d. – 11:00 m.d."). Idempotent: clean configs are left untouched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseHours } from '../lib/hours.mjs';
import { configPath, listPlaces, readJson, writeJson } from '../lib/paths.mjs';

export function migrateHours({ dryRun = false, log = console.log } = {}) {
  const changed = [];
  for (const slug of listPlaces()) {
    const file = configPath(slug);
    if (!fs.existsSync(file)) continue;
    const config = readJson(file);
    if (!Array.isArray(config.hours)) continue;
    const next = normaliseHours(config.hours);
    const diffs = next.filter((h, i) => h.time !== config.hours[i]?.time);
    if (!diffs.length) continue;
    for (const [i, h] of next.entries()) if (h.time !== config.hours[i].time) log(`${slug}: ${config.hours[i].day}: "${config.hours[i].time}" -> "${h.time}"`);
    if (!dryRun) writeJson(file, { ...config, hours: next });
    changed.push(slug);
  }
  log(changed.length ? `${dryRun ? 'would rewrite' : 'rewrote'} hours in ${changed.length} config(s): ${changed.join(', ')}` : 'every config already has clean hours');
  return changed;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  migrateHours({ dryRun: process.argv.includes('--dry-run') });
}
