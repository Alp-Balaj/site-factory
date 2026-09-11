# site-factory

Lead → demo site → intake → build → deploy. One command per step, Windows-friendly (Node only).

```
npm install
cp .env.example .env          # fill GOOGLE_PLACES_KEY (+ Cloudflare for deploy)
claude login                  # demo copy is generated via your Claude subscription (Claude Code login), no API key
npx playwright install chromium   # needed for the scraper and for verify/build screenshots

npm run leads:api -- "restorant" "Prishtinë" --pages 3     # -> leads/out/restorant-prishtine.json (no-website only)
npm run leads:scrape -- "restorant" "Prishtinë" --max 60    # free alternative, brittle
npm run demo -- leads/out/restorant-prishtine.json 0        # -> clients/<slug>/config.json (Albanian copy via Claude)
npm run dev -- <slug>                                       # preview at localhost:4321
npm run verify -- <slug>                                    # config sanity check + preview-mobile.png / preview-desktop.png if built
npm run build -- <slug>                                     # -> clients/<slug>/build
npm run deploy -- <slug>                                    # -> https://sf-<slug>.pages.dev (wrangler)
```

## Flow per client
1. Lead list is the "thirsty community": businesses in one vertical + city with no website.
2. `demo` builds a site from Google data alone, before you contact them. Deploy it; send the link.
3. They say yes → send `intake/index.html` (host it anywhere). It downloads a `.intake.json`.
4. `npm run demo -- <leads.json> <place_id> --intake their.intake.json` regenerates the config with their answers overriding everything.
5. Edit `clients/<slug>/config.json` by hand for anything else. Rebuild, redeploy. Edit requests later = same loop.

## Where things live
- `leads/` collectors. Output schema: place_id, name, address, phone, website, rating, reviews_count, lat/lng, photos[], hours[], review_snippets[], vertical, city, status.
- `template/` one Astro site, zero client JS, fonts + CSS vars from config. `CLIENT=<slug>` picks the config.
- `template/src/verticals/*.json` per-branch labels, item groups, default theme, and the copy brief for Claude. **Only `restaurant` has been looked at properly; the other three are stubs.**
- `clients/<slug>/config.json` single source of truth per client. Commit these; they are your CRM.
- `factory/` glue scripts.

## Known gaps (on purpose)
- Photos from the Places API URLs embed your API key and expire; for a paying client, download them into `clients/<slug>/photos/` and point `gallery`/`hero.image` at copies you host.
- No invoicing, no contact form backend (WhatsApp + tel are the funnel). Add Formspree or a Cloudflare Worker if a client insists.
- Scraper selectors will break; Places API is the reliable path (~$0.03–0.05 per lead with photos).
- Custom domains: buy via Cloudflare Registrar, attach in Pages → Custom domains. Not automated.
