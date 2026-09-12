// factory/archetypes/<vertical>.json: the kinds of business inside a vertical (CONTEXT.md: Archetype). Each entry
// carries the copy brief, item groups, default layout variants and a font bias for the theme prompt. Only
// restaurant has a file; the other verticals fall back to a single entry built from the vertical preset.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const archetypesDir = path.resolve(here, '..', 'archetypes');
const verticalsDir = path.resolve(here, '..', '..', 'template', 'src', 'verticals');

// { vertical, default, archetypes: { id: { id, label, copyBrief, itemGroups, layout, fontBias } } }
export function loadArchetypes(vertical = 'restaurant') {
  const file = path.join(archetypesDir, `${vertical}.json`);
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [id, a] of Object.entries(data.archetypes)) a.id = id;
    return data;
  }
  // parked verticals: one archetype made from the preset, so generation still runs
  const presetFile = path.join(verticalsDir, `${vertical}.json`);
  if (!fs.existsSync(presetFile)) throw new Error(`unknown vertical "${vertical}" (${presetFile} not found)`);
  const preset = JSON.parse(fs.readFileSync(presetFile, 'utf8'));
  return {
    vertical, default: vertical,
    archetypes: { [vertical]: { id: vertical, label: vertical, copyBrief: preset.copyBrief ?? '', itemGroups: preset.itemGroups ?? [], layout: {}, fontBias: '' } },
  };
}

export const archetypeIds = (vertical) => Object.keys(loadArchetypes(vertical).archetypes);

// The archetype object for an id; the vertical's default when the id is empty or unknown (with a note in `fallbackReason`).
export function resolveArchetype(id, vertical = 'restaurant') {
  const data = loadArchetypes(vertical);
  if (id && data.archetypes[id]) return data.archetypes[id];
  const a = data.archetypes[data.default];
  return { ...a, fallbackReason: id ? `archetype "${id}" is not in ${vertical}.json` : 'no archetype set' };
}
