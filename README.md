# site-factory

Lead → demo site → intake → build → deploy. One command per step, Windows-friendly (Node only).

```
npm install
cp .env.example .env          # fill GOOGLE_PLACES_KEY (+ Cloudflare for deploy)
claude login                  # demo copy is generated via your Claude subscription (Claude Code login), no API key
npx playwright install chromium   # needed for the scraper and for verify/build screenshots

npm run leads:api -- "restorant" "Prishtinë" --pages 3     # -> leads/out/restorant-prishtine.json (open businesses of that vertical; phone/website not filtered)
npm run leads:scrape -- "restorant" "Prishtinë" --max 60    # free alternative, brittle
npm run demo -- leads/out/restorant-prishtine.json 0        # -> places/<slug>/config.json (Albanian copy + a theme from the place's photos, via Claude)
npm run theme -- <slug>                                     # regenerate only the theme from the photos in config.json (--dry-run to preview)
npm run dev -- <slug>                                       # preview at localhost:4321
npm run verify -- <slug>                                    # config sanity check + preview-mobile.png / preview-desktop.png if built
npm run build -- <slug>                                     # -> places/<slug>/build
npm run deploy -- <slug>                                    # -> https://sf-<slug>.pages.dev (wrangler)
npm run demo:batch -- leads/out/restorant-prishtine.json --limit 5   # demo+build+deploy every lead with status "new"

npm run job -- <type> [slug] [--param k=v]                  # run one job in the foreground through the queue (types: noop, build, deploy, …)
npm test                                                    # node:test over factory/**/*.test.mjs
node factory/migrate/hours.mjs                              # one-off: normalise hours in older configs (idempotent)
node factory/migrate/clients-to-places.mjs                  # one-off: state.json + place.json for folders that predate places/
```

## Lead filtering (`leads:api`)
Google text search returns homes, street addresses and unrelated places alongside businesses. The collector keeps a result only if it
is a real business (has a Google place type beyond address/area types), is `OPERATIONAL`, matches the vertical's type list
(restaurant/cafe/bar/bakery..., dentist, car_repair/car_wash..., lodging/hotel/guest_house...). Phone is not required. Having a
`website` does not exclude a lead: it is often just a Facebook/Instagram link, so read that field per lead before skipping one.
Every dropped result is printed with its reason. Flags: `--types cafe,bar` overrides the type list (needed for keywords that are not
one of the four verticals), `--all` skips filtering and dumps everything.

## Flow per client
1. Lead list is the "thirsty community": businesses in one vertical + city with no real website (a Facebook/Instagram link counts as none).
2. `demo` builds a site from Google data alone, before you contact them. Deploy it; send the link.
3. They say yes → send `intake/index.html` (host it anywhere). It downloads a `.intake.json`.
4. `npm run demo -- <leads.json> <place_id> --intake their.intake.json` regenerates the config with their answers overriding everything.
5. Edit `places/<slug>/config.json` by hand for anything else. Rebuild, redeploy. Edit requests later = same loop.

## Batch demos
`npm run demo:batch -- <leads.json> [--limit N] [--dry-run] [--no-deploy]` runs demo -> build -> deploy for every lead with
`status: "new"` (up to `--limit`), one after the other, and continues when a lead fails. After each lead it writes back into
the leads file: `status` (`demo_deployed`, or `demo_built` with `--no-deploy`, or `failed`), `slug`, `demo_url` (the pages.dev URL),
and `error` when it failed. The file is saved after every lead, so a crash mid-batch loses nothing; rerun the same command and
it picks up the remaining `new` leads. `--dry-run` lists what would happen and writes nothing (no Claude calls either).
To retry a failed lead, set its status back to `"new"`. Exit code is 1 if any lead failed.

## Verify + previews
`npm run verify -- <slug>` checks that config.json has the fields the template cannot do without (business.name,
business.phone or whatsapp, hero.headline, hero.sub, at least 3 items, seo.title, seo.description) and warns when hero.image
and gallery are both empty. If `places/<slug>/build/index.html` exists it also saves `places/<slug>/preview-mobile.png`
(390x844) and `preview-desktop.png` (1280x800), full page, via Playwright. `npm run build` runs the same checks before astro
and the same screenshots after, so a bad config fails before the build starts. Both need `npx playwright install chromium` once.

## Where things live
- `leads/` collectors. Output schema: place_id, name, address, phone, website, rating, reviews_count, lat/lng, photos[], hours[], review_snippets[], vertical, city, status.
- `template/` one Astro site, zero client JS. `CLIENT=<slug>` picks the config.
  **The template is the skeleton, not the look.** It fixes structure (sections, order, the name filling a phone, the price column,
  the locked call/WhatsApp bar) and draws every surface from the client's theme tokens: `bg`, `ink`, `primary`, `accent`, `muted`,
  `display`, `body`, `displayWeight`, `radius` (corner language), `frame` (edge: none/line/thick), `weights` (Google Fonts weights
  per family) and a `note`. Text on each coloured surface is computed at build time from `ink`/`bg` by contrast, so any token set
  stays readable. Product truth lives in `PRODUCT.md`, the direction contract in `template/.impeccable/surfaces/template-src.md`,
  the recorded system in `DESIGN.md` (impeccable reads all three).
- The theme comes from the restaurant itself. `factory/theme.mjs` sends the lead's Google photos, name, category and reviews to
  Claude (vision, via your Claude Code login) and gets back a palette, two faces from a curated Google Fonts catalogue, a corner and
  an edge language, plus a one-line `note` saying what drove it. `fixTheme` then repairs contrast (ink/bg 7:1, readable text on every
  coloured surface, accent visible on bg) and snaps fonts and weights to the catalogue. `demo` runs it for every lead (falling back to
  the vertical's plain theme if the call fails); `npm run theme -- <slug>` reruns it for an existing client from the photos in its
  config. `verify` warns when a hand-edited theme would be repaired. Intake's `theme.primary` still overrides.
- `template/src/verticals/*.json` per-branch labels, item groups, the fallback theme (used only when generation fails), and the copy brief for Claude. **Only `restaurant` has a proper fallback; the other three still carry stub themes (light, Instrument Sans) and render on the same structure.**
- `places/<slug>/` everything about one Place (see `CONTEXT.md` for the words). `config.json` is the site config the Skeleton
  builds from; `state.json` holds the status and the CRM fields (every status change goes through `factory/lib/state.mjs`,
  which refuses moves outside the transition table); `place.json` is the raw, key-free Google record; `jobs/<id>.json` and
  `.log` are job records; `build/` and `photos/` are gitignored. Commit the rest; the repo is the CRM (`docs/adr/0001`).
  Optional top-level `credit: { label, url }` in `config.json` drives the footer link "Uebfaqe nga <label>"; defaults to `Alp` and `https://REPLACE-ME.com` when absent, so set it once per client (or put your own site there).
- `factory/lib/` shared code: `paths.mjs` (every path under `places/`), `state.mjs` (status enum, transitions, `state.json`
  reads and writes), `slug.mjs`, `hours.mjs`, `jobs.mjs` (the one-worker job queue with log files and events), `git.mjs`
  (auto-commit of state and config writes when `AUTO_COMMIT=1`, which the Portal sets). `factory/jobs/index.mjs` is the job
  registry (`noop`, `build`, `deploy`; the streams add theirs), `factory/jobs/run.mjs` runs one job from the terminal.
- `factory/` glue scripts. `factory/hooks/design-skills.mjs` is the Claude Code hook that makes the design skills mandatory for `template/src` edits (see CLAUDE.md).
- `.claude/skills/` design skills for Claude Code (impeccable, design-taste-frontend, emil-design-eng, animate, review-animations). `skills-lock.json` pins them; the impeccable binary is gitignored, re-run `npx impeccable install -y --project --providers=claude-code` on a fresh clone.

## Known gaps (on purpose)
- Hours from Google come as `8:00 p.d. – 11:00 m.d.` in the Albanian locale; `demo` normalises them to `08:00 - 23:00`. Older configs keep whatever they were generated with.
- Photos from the Places API URLs embed your API key and expire; for a paying client, download them into `places/<slug>/photos/` and point `gallery`/`hero.image` at copies you host.
- No invoicing, no contact form backend (WhatsApp + tel are the funnel). Add Formspree or a Cloudflare Worker if a client insists.
- Scraper selectors will break; Places API is the reliable path (~$0.03–0.05 per lead with photos).
- Custom domains: buy via Cloudflare Registrar, attach in Pages → Custom domains. Not automated.
