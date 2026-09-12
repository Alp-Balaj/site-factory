# Backlog

Everything to add or fix in the factory, as agreed in the grilling session of 2026-09-12. Vocabulary is in `CONTEXT.md`. Items are unordered inside each group; scopes are split later. `[fix]` corrects something wrong today, `[add]` is new.

## Decisions this list rests on

- Demos are not published. They are shown to the owner in person from the operator's own laptop or phone. Deploy becomes a per-Place action after the owner is interested, not a batch step.
- Volume is 10 to 20 Demos a week, generated on one computer through the Claude Code login.
- Only the restaurant vertical is in scope. Dentist, auto and guesthouse stay as stubs.
- The Skeleton stays zero client JS. The Portal may use JS freely.
- Instagram photos are used without consent as theme input and placeholders. Photos are copied into Cloudflare R2 even though Google's Places policy forbids caching photos; the risk is accepted knowingly.
- The repo is the CRM. No database.

## A. Data model and pipeline

1. `[fix]` Rename `clients/` to `places/`. Migrate the three existing folders.
2. `[add]` `places/<slug>/state.json`: status, contact person, contact phone, timestamped notes, next follow-up date, price agreed, paid date, domain, and a log of every status change with timestamp and reason.
3. `[add]` Status enum with allowed transitions: `found` → `generating` → `qa_failed` | `qa_passed` → `ready` → `shown` → `interested` | `declined` → `intake_received` → `paid` → `live` → `churned`; `failed` with retry back to `found`. Approval is only the `qa_passed` → `ready` change.
4. `[fix]` Lead search writes each new Place into `places/` as `found`; `leads/out/` becomes a raw cache of what Google returned, never read for status again.
5. `[fix]` Places whose Google website is a real site (not Facebook or Instagram) are flagged at lead search and excluded from "generate all found". They stay visible in the Portal.
6. `[fix]` Slug collisions: two Places with the same name must not overwrite each other. Add a short place ID suffix on collision.
7. `[add]` Job queue: one worker, one job at a time, each job's log streamed live and saved under the Place. Generation, QA, build, deploy and lead search are all jobs. CLI commands become thin wrappers over the same job functions.
8. `[add]` Auto-commit after every state or config change, so `git pull` on another device restores the whole CRM.
9. `[add]` Tests for `fixTheme`, `parseHours`, `slugify`, the status transition table, and the hard QA checks. Nothing more.
10. `[fix]` One-off migration that normalises hours in older configs to `08:00 - 23:00` form.

## B. Photos

11. `[fix]` The Google API key is embedded in every photo URL inside committed configs and is therefore in git history. Rotate the key. Store Google photo names, not URLs, and add the key only at fetch time.
12. `[fix]` Take all 10 Google photos per Place instead of 6.
13. `[add]` Instagram handle discovery, in order: Google's website field when it is an Instagram link; a Claude web search for name plus city with a profile-name match check; a hand-entered field in the Portal.
14. `[add]` Instagram photos and captions via the Apify Instagram scraper on its free plan, up to 20 posts per Place. Token in `.env`.
15. `[add]` Photo pool in Cloudflare R2: originals and resized web versions per Place. Configs reference R2 URLs, so any device builds the same site. Expired Google URLs stop being a problem.
16. `[add]` Curation pass: one Claude vision call over the whole pool scores each photo (food, room, exterior, people, text-heavy, dark, orientation), picks the hero and the gallery, and explains the choice in the theme note. The same pass feeds the theme call.
17. `[add]` Google's author attribution and "Powered by Google" text under Places photos, shown until the owner's own photos replace them.

## C. Archetype, theme, layout

18. `[add]` Seven restaurant archetypes: grill house, modern café, patisserie and bakery, pizza and fast food, traditional family restaurant, fine dining, bar and night. Default when nothing fits: modern café. Each carries a copy brief, item groups, default layout variants and a font bias for the theme prompt. Claude classifies from Google types, name, reviews and photos; the Portal lets the operator change it.
19. `[add]` Layout variants as Theme tokens, all CSS-only, chosen by the theme call: hero `photo` | `split` | `type`; menu `list` | `cards` | `board`; gallery `grid` | `strip` | `single` | `none`; rhythm `tight` | `airy`; order menu-first or about-first. The Skeleton renders every combination; `type` is the no-photo hero.
20. `[add]` The theme call receives the curated photos, the archetype and the optional feedback sentence (item 24).
21. `[fix]` The vertical fallback theme is used only when generation fails; keep it plain.

## D. Copy

22. `[add]` Evidence-grounded menu: the copy call receives Instagram captions and Google reviews; each item carries a `source` of `evidence` or `filler`; filler items are shown as "shembull" on the Demo until intake replaces them.
23. `[add]` Testimonials section from the Google review snippets, first name only, with its label in the vertical preset.
24. `[add]` "Regenerate with feedback": one typed sentence from the operator reaches both the theme and the copy call.
25. `[add]` `places/<slug>/notes.md` for what the operator learned at the visit, fed into every regeneration.
26. `[fix]` Verify copy: no long dash, no obvious foreign-language leak. Today the prompt forbids the dash but nothing checks.

## E. QA gate

27. `[add]` Hard checks, computed: build succeeded; every image in the built page loads; phone or WhatsApp present; at least 6 items; contrast passes; no hero text overflow at 390px measured with Playwright; copy checks from item 26.
28. `[add]` Soft checks, Claude vision over the two previews, each scored 1 to 5: name and photo recognisable in the first viewport; hero photo suits the place; nothing cut off; menu reads as a menu; theme fits the photos. Scores and reasons saved in `state.json`.
29. `[add]` Fail on any hard failure or any soft score below 3. Failed Places go to the review queue with reasons.
30. `[fix]` A Place with no phone is generated and then fails QA with "no phone", so it lands in review. The Portal phone field plus regenerate fixes it.

## F. Portal

31. `[add]` Plain Node HTTP server rendering HTML pages with minimal inline JS and server-sent events for live job logs. No framework, no build step.
32. `[add]` Pages: pipeline board grouped by status; Place detail (screenshots, QA scores, log, editable fields, archetype, Instagram handle, actions: regenerate theme, regenerate copy, regenerate all, feedback, approve, reject, change status, notes, follow-up date); lead search form; jobs page; "due today" follow-up list; Clients list (paid and live) with domain and paid date.
33. `[add]` Demo view: one button on the Place detail that serves `places/<slug>/build` in the browser on this computer, with a rebuild button.
34. `[add]` Deploy as a per-Place action from the Portal (Cloudflare Pages, existing script), with a custom domain field on the Client.

## G. Documentation and cleanup

35. `[fix]` README, PRODUCT.md and CLAUDE.md updated for the Portal, `places/`, the status enum and the R2 photo pool.
36. `[fix]` Mark dentist, auto and guesthouse presets as parked stubs in the README.
