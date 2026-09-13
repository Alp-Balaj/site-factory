# site-factory

README.md is the operating manual (commands, flow, where things live); CONTEXT.md is the glossary. This file only adds what the repo does not show.

## Shape of the repo, in one breath

- `places/<slug>/` is one Place: `place.json` (raw Google record, key-free), `state.json` (the status and the CRM fields; every status change goes through `transition()` in `factory/lib/state.mjs`, which refuses moves outside the table), `config.json` (what the Skeleton builds), `photos.json` (the pool), `notes.md`, `jobs/`. Folders starting with `_` are not Places. The repo is the CRM: commit `state.json`, `config.json`, `place.json`, `photos.json`, job records; never `build/`, `photos/` or `.log` files.
- Everything runs as a job through the one-worker queue (`factory/lib/jobs.mjs`, registry `factory/jobs/index.mjs`): `lead-search`, `photos`, `generate` (chains `photos` when the pool is missing, then `build` and `qa`), `generate-all`, `qa`, `build`, `deploy`. The Portal (`portal/`, `npm run portal`) enqueues them by name and sets `AUTO_COMMIT=1`; the CLI is `node factory/jobs/run.mjs <type> [slug] [--k v]`.
- The Google Places key is never written to disk: `place.json` holds photo names and `photoUrl()` in `factory/lib/place.mjs` adds the key on the way to a fetch. Do not copy that function. Config photos come from the pool (`photos.json`); the `place.json` fallback in `factory/lib/place-photos.mjs` is the one path that writes a keyed URL into `config.json`, and `generate` avoids it by running `photos` first.
- Only the restaurant vertical is live. `dentist`, `auto` and `guesthouse` under `template/src/verticals/` are parked stubs; do not extend them or generate for them unless asked.
- The Portal is English and may use JS; the Skeleton is Albanian and ships zero client JS.

## Design skills are mandatory for template UI work

Before any edit under `template/src/` (components, layouts, styles, pages, vertical presets), load all three with the Skill tool, in this order:

1. `impeccable` — design direction and critique (`/impeccable craft|audit|polish <target>`); reads `PRODUCT.md` and `DESIGN.md` at the repo root.
2. `design-taste-frontend` — typography, layout, spacing, anti-slop rules.
3. `emil-design-eng` — motion and interaction polish (`animate`, `review-animations` for deeper passes).

A PreToolUse hook (`factory/hooks/design-skills.mjs`) rejects Edit/Write under `template/src/` until all three have been loaded in the current session. If an edit is blocked, load the missing skills and retry; do not work around the hook with Bash.

Constraints the skills do not know: the template ships zero client JS, so motion is CSS-only (no GSAP, no framer-motion). Copy is Albanian and comes from `config.json`; never hardcode text in components.
