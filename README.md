# site-factory

Lead → demo site → intake → build → deploy. One command per step, Windows-friendly (Node only).

```
npm install
cp .env.example .env          # fill GOOGLE_PLACES_KEY (+ Cloudflare for deploy)
claude login                  # demo copy is generated via your Claude subscription (Claude Code login), no API key
npx playwright install chromium   # needed for the scraper and for verify/build screenshots

npm run leads:api -- "restorant" "Prishtinë" --pages 3     # -> leads/out/restorant-prishtine.json (open businesses of that vertical; phone/website not filtered)
npm run leads:scrape -- "restorant" "Prishtinë" --max 60    # free alternative, brittle
npm run demo -- leads/out/restorant-prishtine.json 0        # -> clients/<slug>/config.json (Albanian copy via Claude)
npm run dev -- <slug>                                       # preview at localhost:4321
npm run verify -- <slug>                                    # config sanity check + preview-mobile.png / preview-desktop.png if built
npm run build -- <slug>                                     # -> clients/<slug>/build
npm run deploy -- <slug>                                    # -> https://sf-<slug>.pages.dev (wrangler)
npm run demo:batch -- leads/out/restorant-prishtine.json --limit 5   # demo+build+deploy every lead with status "new"
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
5. Edit `clients/<slug>/config.json` by hand for anything else. Rebuild, redeploy. Edit requests later = same loop.

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
and gallery are both empty. If `clients/<slug>/build/index.html` exists it also saves `clients/<slug>/preview-mobile.png`
(390x844) and `preview-desktop.png` (1280x800), full page, via Playwright. `npm run build` runs the same checks before astro
and the same screenshots after, so a bad config fails before the build starts. Both need `npx playwright install chromium` once.

## Where things live
- `leads/` collectors. Output schema: place_id, name, address, phone, website, rating, reviews_count, lat/lng, photos[], hours[], review_snippets[], vertical, city, status.
- `template/` one Astro site, zero client JS, fonts + CSS vars from config. `CLIENT=<slug>` picks the config.
  The visual world is "the kilim": woven border bands, patches with a 4px frame, stitch rules, the name set huge on a colour field.
  It is driven entirely by the seven theme tokens; text on each coloured surface is picked at build time from `ink`/`bg` by
  contrast, so any token set stays readable. Product truth lives in `PRODUCT.md`, the direction contract in
  `template/.impeccable/surfaces/template-src.md`, the recorded system in `DESIGN.md` (impeccable reads all three).
  A client's `config.json` snapshots the preset theme at demo time; to move an old client onto new preset tokens, copy
  `theme` from the vertical JSON into its config.
- `template/src/verticals/*.json` per-branch labels, item groups, default theme, and the copy brief for Claude. **Only `restaurant` has been designed; the other three still carry their stub themes (light, Instrument Sans) and render on the same structure.**
- `clients/<slug>/config.json` single source of truth per client. Commit these; they are your CRM.
  Optional top-level `credit: { label, url }` drives the footer link "Uebfaqe nga <label>"; defaults to `Alp` and `https://REPLACE-ME.com` when absent, so set it once per client (or put your own site there).
- `factory/` glue scripts. `factory/hooks/design-skills.mjs` is the Claude Code hook that makes the design skills mandatory for `template/src` edits (see CLAUDE.md).
- `.claude/skills/` design skills for Claude Code (impeccable, design-taste-frontend, emil-design-eng, animate, review-animations). `skills-lock.json` pins them; the impeccable binary is gitignored, re-run `npx impeccable install -y --project --providers=claude-code` on a fresh clone.

## Known gaps (on purpose)
- Hours from Google come as `8:00 p.d. – 11:00 m.d.` in the Albanian locale; `demo` normalises them to `08:00 - 23:00`. Older configs keep whatever they were generated with.
- Photos from the Places API URLs embed your API key and expire; for a paying client, download them into `clients/<slug>/photos/` and point `gallery`/`hero.image` at copies you host.
- No invoicing, no contact form backend (WhatsApp + tel are the funnel). Add Formspree or a Cloudflare Worker if a client insists.
- Scraper selectors will break; Places API is the reliable path (~$0.03–0.05 per lead with photos).
- Custom domains: buy via Cloudflare Registrar, attach in Pages → Custom domains. Not automated.
