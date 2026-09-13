# site-factory

Google Maps listing → Demo site → shown in person → intake → paid → live. One Place per folder under `places/`, one status
per Place, every step a job. The Portal drives it; the CLI runs the same jobs. Windows-friendly (Node only). The words
(Place, Demo, Skeleton, Archetype, Portal, …) are defined in `CONTEXT.md`; the repo is the CRM (`docs/adr/0001`).

## Setup (once per machine)

```
npm install
cp .env.example .env              # see "Operator setup" below for every line
claude login                      # copy, theme, classification, curation and QA vision run through your Claude Code login, no API key
npx playwright install chromium   # screenshots, the QA hero check, the scraper
npm i -g wrangler && wrangler login   # deploy (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in .env)
```

## The Portal

```
npm run portal                    # http://localhost:4400, bound to 0.0.0.0 so a phone on the same Wi-Fi can open it (PORT, HOST override)
```

Everything happens here: `/` the board (one column per status), `/places/<slug>` the Place (previews, QA results, job
logs, contact and CRM fields, archetype, Instagram handle, notes, feedback, every action), `/places/<slug>/demo/` the
Demo view (the built site with a Rebuild button), `/search` lead search, `/jobs` the queue with live logs over SSE,
`/due` follow-ups due today, `/clients` paid and live Places. The Portal sets `AUTO_COMMIT=1`, so every state and config
write is a commit; `git pull` on another machine restores the whole CRM. Keys: `/` focuses search, `g b|j|s|d|c` jump
between pages.

The flow per Place, all from the Portal:

1. **Lead search** (`/search`): a vertical keyword plus a city. Every open business of that vertical becomes
   `places/<slug>/` with `place.json` (raw, key-free Google record) and `state.json` as `found`. A Place whose Google
   website is a real site is flagged `hasRealWebsite` and skipped by "generate all".
2. **Generate** (Place → Regenerate all, or `generate-all` from `/jobs`): the chain `photos → generate → build → qa`.
   `photos` builds the pool (Google photos, Instagram through Apify, sizes, one vision call for scores and picks),
   `generate` classifies the archetype, writes Albanian copy and a theme from the Place's own photos, `build` runs astro
   and screenshots, `qa` runs the hard and soft checks and lands the Place in `qa_passed` or `qa_failed` with reasons.
3. **Fix and regenerate**: the phone field, the archetype select, the Instagram handle, `notes.md`, one feedback
   sentence; then Regenerate theme, Regenerate copy or Regenerate all. A Place in `qa_failed` shows exactly what to fix.
4. **Approve** (`qa_passed → ready`) and open the Demo view on your phone in front of the owner. Mark `shown`,
   `interested`, `intake_received`, `paid` as the conversation moves; set the follow-up date and price.
5. **Deploy** (Place → Deploy) once paid: `sf-<slug>.pages.dev`, `paid → live`, the URL on the Place. Custom domain is a
   field on the Client and a manual step in Cloudflare (Registrar, then Pages → Custom domains).

## Statuses

`found → generating → qa_failed | qa_passed → ready → shown → interested → intake_received → paid → live → churned`,
plus `failed` (a job threw; retry → `found`) and `declined` (dropped at any stage; reopen → `found`). The table in
`factory/lib/state.mjs` lists every allowed move; anything else is refused with a message. Approval is only the
`qa_passed → ready` click. Regenerate goes back through `generating` from `qa_failed`, `qa_passed`, `ready`,
`intake_received` and `live`.

## CLI (the same jobs, in the foreground)

```
npm run leads:api -- "restorant" "Prishtinë" --pages 3   # lead-search job: places/<slug>/{place,state}.json per new Place + leads/out/<query>-<city>.json cache
npm run demo -- <slug> [--only theme|copy] [--feedback "..."] [--intake their.intake.json] [--dry-run]   # generate job (chains photos, build, qa)
npm run theme -- <slug> [--dry-run]                       # generate --only theme
npm run demo:batch -- [--limit N] [--dry-run]             # generate-all: every found Place without a real website
npm run job -- photos <slug> [--stage discover,fetch,store,curate] [--no-vision] [--rediscover] [--posts N]
npm run qa -- <slug> [--no-vision] [--build]              # qa job: builds when the build is older than config.json
npm run build -- <slug>                                   # verify checks, astro, local photos copied in, screenshots
npm run verify -- <slug>                                  # config checks + preview-mobile.png / preview-desktop.png if built
npm run dev -- <slug>                                     # astro dev at localhost:4321
npm run deploy -- <slug>                                  # wrangler only, no status change; `npm run job -- deploy <slug>` is the job (writes pagesUrl, paid → live)
npm run job -- <type> [slug] [--param k=v] [--no-k]       # any registered job: noop, build, deploy, lead-search, photos, generate, generate-all, qa
npm test                                                  # node:test over factory/**/*.test.mjs
node factory/migrate/hours.mjs                            # one-off: normalise hours in older configs (idempotent)
node factory/migrate/clients-to-places.mjs                # one-off: state.json + place.json for folders that predate places/
```

`npm run leads:scrape` (`leads/scrape-maps.mjs`) is **parked**: it still writes the old flat leads shape and does not
create Places. Use `leads:api`.

## Lead filtering (`leads:api`)
Google text search returns homes, street addresses and unrelated places alongside businesses. The job keeps a result only
if it is a real business (has a Google place type beyond address/area types), is `OPERATIONAL` and matches the vertical's
type list (restaurant/cafe/bar/bakery…). Phone is not required; a missing phone fails QA later, not generation. A
`website` does not exclude a Place: Facebook, Instagram, linktr.ee and WhatsApp links count as no website; a real one sets
`state.flags.hasRealWebsite` and the Place stays on the board but out of "generate all". Every dropped result is in the
job log with its reason. Flags: `--types cafe,bar` overrides the type list, `--all` skips filtering. Rerunning a search
refreshes `place.json` for known Places and never touches their `state.json`.

## Photos: the pool
`photos.json` per Place is the pool (`docs/adr/0002`): every Google photo (up to 10, with author attribution) and up to
20 Instagram posts, each resized to 1600 and 800 wide webp. With the `R2_*` lines set, files go to the Cloudflare R2
bucket and the config carries public URLs; without them `places/<slug>/photos/` is the store (gitignored) and `build`
copies the referenced files into the build. Instagram handle discovery: the Google website link, else a Claude web
search with a strict name match, else the handle typed in the Portal (manual always wins; `--rediscover` redoes a found
one). Curation is one vision call that scores every photo and picks the hero and gallery; `--no-vision` takes the first
landscape Google photo. Google photos render with "Foto nga <author>" and "Powered by Google".

## QA gate
`qa` builds if needed, then runs the hard checks (build exists, every image answers, phone or WhatsApp present, at least
6 items, contrast on every theme surface, hero overflow at 390 px, no long dash, no foreign-language leak) and, unless
`--no-vision`, five soft scores 1–5 from Claude over the two previews (first viewport, hero suits the place, nothing cut
off, menu reads as a menu, theme fits the photos). Pass = every hard check ok and every score ≥ 3; the reasons land in
`state.qa` and on the Place page. A missing phone is a warning at build and a hard failure here (item 30).

## Verify + previews
`npm run verify -- <slug>` checks that config.json has the fields the Skeleton cannot do without (business.name,
hero.headline, hero.sub, at least 3 items, seo.title, seo.description), warns when both phone and WhatsApp are empty
(QA fails it) and when hero.image and gallery are both empty. If `places/<slug>/build/index.html` exists it also saves
`preview-mobile.png` (390x844) and `preview-desktop.png` (1280x800), full page, via Playwright. `build` runs the same
checks before astro and the same screenshots after.

## Intake
They say yes → send `intake/index.html` (host it anywhere). It downloads a `.intake.json`;
`npm run demo -- <slug> --intake their.intake.json` regenerates with their answers overriding everything (their menu is
evidence, their photos lead). Edit `places/<slug>/config.json` by hand for anything else; rebuild from the Demo view.

## Where things live
- `places/<slug>/` everything about one Place: `place.json` (raw Google record, photos as names, reviews as objects, no
  key), `state.json` (status, CRM fields, `qa`, `log`), `config.json` (what the Skeleton builds: copy, `archetype`,
  `itemGroups`, `theme` with `layout`, object photos `{ src, source, author }`, `items[].source` evidence | filler,
  `testimonials`), `photos.json` (the pool), `notes.md` (visit notes, read by every regeneration), `jobs/<id>.json` job
  records (`.log` gitignored), `preview-*.png`; `build/` and `photos/` are gitignored. Folders starting with `_` are not
  Places (`_fixtures/` for the Skeleton's layout fixtures). Optional `credit: { label, url }` in `config.json` drives the
  footer link "Uebfaqe nga <label>" and survives regeneration.
- `portal/` the Portal: `server.mjs` (routes, static, SSE, Demo view), `router.mjs`, `actions.mjs` (every POST: jobs by
  name, transitions, field saves), `data.mjs`, `pages/*.mjs`, `public/portal.css|js`. Plain `node:http`, no framework.
- `factory/jobs/` the jobs: `index.mjs` the registry (`noop`, `build`, `deploy`, `lead-search`, `photos`, `generate`,
  `generate-all`, `qa`), `run.mjs` the foreground runner, one file per job. `factory/batch.mjs` is `generate-all`.
- `factory/lib/` shared code: `paths.mjs` (every path under `places/`), `state.mjs` (status enum, transitions, reads and
  writes), `place.mjs` (`place.json`, `hasRealWebsite`, `photoUrl` adds the key at fetch time only), `jobs.mjs` (the
  one-worker queue with log files and events), `git.mjs` (auto-commit when `AUTO_COMMIT=1`), `claude.mjs` (`askJson`, the
  one structured Claude call), `archetypes.mjs` + `classify.mjs` (archetype presets and classification),
  `place-photos.mjs` (which photos a config uses: intake → pool picks → Google), `photos/` (the pool: `google.mjs`,
  `instagram.mjs`, `store.mjs`, `curate.mjs`, `pool.mjs`), `copy-checks.mjs` (dash and language checks), `qa/` (`hard.mjs`,
  `soft.mjs`, fixtures), `slug.mjs`, `hours.mjs`, `proc.mjs`.
- `factory/demo.mjs` (copy + config from a Place folder), `factory/theme.mjs` (the theme from the Place's photos,
  `fixTheme` repairs contrast, snaps fonts, validates `layout`), `factory/archetypes/restaurant.json` (seven archetypes:
  label, copy brief, item groups, layout defaults, font bias), `verify.mjs`, `build.mjs`, `deploy.mjs`, `dev.mjs`,
  `migrate/`. `factory/hooks/design-skills.mjs` is the Claude Code hook that makes the design skills mandatory for
  `template/src` edits (see CLAUDE.md).
- `template/` the Skeleton: one Astro site, zero client JS. `CLIENT=<slug>` picks the config. **The Skeleton is the
  structure, not the look.** It draws every surface from the theme tokens (`bg`, `ink`, `primary`, `accent`, `muted`,
  `display`, `body`, `displayWeight`, `radius`, `frame`, `weights`, `note`) and the layout variants
  (`hero` photo | split | type, `menu` list | cards | board, `gallery` grid | strip | single | none, `rhythm` tight | airy,
  `order` menu-first | about-first). Text on every coloured surface is computed at build time by contrast. Product truth
  in `PRODUCT.md`, the direction contract in `template/.impeccable/surfaces/template-src.md`, the recorded system in
  `DESIGN.md`.
- `template/src/verticals/*.json` per-vertical labels, item groups, the fallback theme (used only when generation
  throws) and the copy brief. **Only `restaurant` is live. `dentist`, `auto` and `guesthouse` are parked stubs**: they
  carry a placeholder theme, no archetypes and no copy brief worth the name, and render on the same structure. Do not
  generate for them until someone picks them up.
- `leads/` `places-api.mjs` (thin CLI over the `lead-search` job), `scrape-maps.mjs` (parked), `out/` the search cache
  (gitignored).
- `docs/` `BACKLOG.md`, `adr/`, `handoff/S1..S6.md` (what each build stream left for the others).
- `.claude/skills/` design skills for Claude Code (impeccable, design-taste-frontend, emil-design-eng, animate,
  review-animations). `skills-lock.json` pins them; re-run `npx impeccable install -y --project --providers=claude-code`
  on a fresh clone.

## Operator setup

| `.env` line | Needed for | Notes |
| --- | --- | --- |
| `GOOGLE_PLACES_KEY` | lead search, Google photos | Restrict it to the Places API. It never lands on disk: `place.json` stores photo names and `photoUrl()` adds the key at fetch time. Configs generated before the pool existed still carry the old key in their photo URLs; rotate the key in Google Cloud and regenerate those Places. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | deploy | Or `wrangler login`. |
| `APIFY_TOKEN` | Instagram posts | Optional. Free plan; the actor is `apify/instagram-scraper`. Without it the pool is Google only, with a log line. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | photo pool in R2 | Optional. Bucket with public access (r2.dev subdomain or a custom domain) and a token with object read and write. Unset means the local store. First live run: `npm run job -- photos <slug> --stage store`, twice; the second reports 0 uploads. |
| `AUTO_COMMIT` | commits on every state and config write | The Portal sets it to 1; leave it unset in the terminal and in tests. `AUTO_COMMIT=0` turns it off for the Portal. |

Also per machine: `claude login`, `npx playwright install chromium`, `wrangler login`. Several sessions on one machine:
`git worktree add ../sf-<name> <branch>` so builds do not collide.

## Known gaps (on purpose)
- Google's Places policy forbids caching photos and Instagram photos belong to the restaurant; the pool exists anyway
  (`docs/adr/0002`). Demos are shown in person, Google attribution is rendered, and a declined Place's photos can be
  deleted.
- Two Google listings of the same business become two Places (the slug gets a place-ID suffix); decline one in the
  Portal.
- No invoicing, no contact form backend (WhatsApp + tel are the funnel). Add Formspree or a Cloudflare Worker if a
  client insists.
- Custom domains: buy via Cloudflare Registrar, attach in Pages → Custom domains. Not automated.
- The scraper (`leads/scrape-maps.mjs`) is parked; the Places API is the path (~$0.03–0.05 per Place with photos).
