# PRODUCT.md

Product truth for the site-factory Skeleton. The Skeleton renders one static page per Place from `places/<slug>/config.json`, written by the factory's `generate` job and driven from the Portal (the operator's local web app: lead search, generation, QA results, approval, Demo view, deploy). Facts marked *(inferred)* come from the README and the codebase, confirmed in the init round on 2026-09-12; everything else was answered by the owner of the factory. Updated 2026-09-13 for `places/`, the Portal and the photo pool.

## Platform
web

## Stack
Astro 5 static build, zero client JavaScript, CSS inlined at build. One Skeleton serves every Place; per-Place differences live in `places/<slug>/config.json` (copy, photos, hours, the archetype, the theme tokens: bg, ink, primary, accent, muted, display, body, displayWeight, radius, frame, weights, and the layout variants: hero photo | split | type, menu list | cards | board, gallery grid | strip | single | none, rhythm tight | airy, order menu-first | about-first). The theme is generated per restaurant from its own photos by Claude vision (factory/theme.mjs) and repaired for contrast; the archetype (seven kinds of restaurant) sets the copy brief and the layout defaults. Fonts are loaded from Google Fonts. Photos come from the photo pool (`photos.json`: Google Places photos with author attribution plus Instagram posts, resized to 1600 and 800 wide webp) stored in Cloudflare R2 or, without credentials, next to the Place and copied into the build. Deployed per Place from the Portal to Cloudflare Pages at `sf-<slug>.pages.dev`, after payment.

## Users
- **Primary judge: the restaurant owner, on their phone.** The operator shows them the Demo in person, from the Portal's Demo view on a phone or laptop, on a mid-range Android or iPhone; they decide in seconds whether it feels like their place and worth paying for. They did not ask for it. Most have never had a website; their online presence is a Facebook or Instagram page. Demos are not published; only a paid site goes live.
- **Secondary: the restaurant's customers.** Locals in Prishtina and other Kosovo towns on a phone, deciding where to eat, checking hours, calling or opening WhatsApp. Albanian speakers.

## Product Purpose
Turn a Google Maps listing into a website good enough that a small restaurant owner pays for it after one look. For customers: name, what they cook, prices, hours, how to reach the place, one tap to call or WhatsApp.

## Positioning
Sits alongside serious hospitality sites (Noma, Septime, Bar Isabel) in craft, not in scale: one page, real food photos, honest prices. Against the owner's current alternative, a Facebook page, it has to look like a step up in dignity, not a template. *(inferred)* No online ordering, no reservations system; WhatsApp and the phone are the funnel.

## Operating Context
Phone first, often outdoors or in the restaurant itself, sometimes on slow mobile data. Hours and phone number are the most-read facts. The owner views the demo once, in a spare minute; there is no onboarding. Copy is Albanian; prices in euros; day names and hours come from Google in Albanian.

## Capabilities and Constraints
- One page, sections: hero, menu (grouped items with prices), about, gallery, hours, contact with map, sticky call/WhatsApp bar on phones, footer credit.
- Everything visual must work for any restaurant name (2 to 30 characters), 0 to 9 photos (one hero and up to 8 gallery photos from a pool of up to 30), 6 to 20 menu items, with or without a Google rating, with or without testimonials. Photos may be absent at demo stage (hero "type", gallery "none"); the page must still look finished.
- Only the restaurant vertical is live. `dentist`, `auto` and `guesthouse` are parked stubs: placeholder presets that render on the same structure, with no archetypes and no copy brief worth the name. Nothing is generated for them.
- Generated menu items carry `source`: `evidence` (mentioned in reviews, Instagram captions or the owner's intake) or `filler` (a typical example for the archetype); fillers render with a small "shembull" tag so the owner is never misled. Google photos render the author's name and "Powered by Google".
- A Demo passes the QA gate (hard checks: build, images, phone, items, contrast, hero overflow at 390 px, no long dash, no foreign-language leak; soft checks: five vision scores) before a human approves it.
- Zero client JS is a hard constraint. Motion is CSS only (transitions, `@starting-style`, scroll-driven where supported), always under `prefers-reduced-motion`.
- The template is a skeleton: structure only, no look of its own. The theme tokens in config.json are the whole per-client look and come from the restaurant's photos; the template may add tokens but must keep sensible defaults in the vertical preset and must never bake in a colour, face, corner, edge or ornament.
- No new copy may be hardcoded in components; labels come from `template/src/verticals/<vertical>.json`.

## Brand Commitments
None inherited by the template. Each client's brand is derived from the client: colours, faces, corners and edges come from their own photos and name, repaired for contrast, and the owner can override them at intake. Two earlier template looks (dark green with gold and Fraunces; the madder-red kilim with stepped-diamond bands and Unbounded 800) are anti-references: both were one house style stamped on every client, which is exactly what the factory must not do.

## Evidence on Hand
- Google rating and review count per business (real, shown when present).
- Google Places photos (real, up to 10, with author attribution) and up to 20 Instagram posts when the handle is found; one vision pass scores them and picks the hero and gallery.
- Google reviews: up to 5 snippets with first name and rating; positive ones become testimonials in the reviewer's words.
- Hours from Google.
- Menu items and prices are generated by Claude from the listing, the reviews and the Instagram captions at demo stage and replaced by the owner's answers after intake. Evidence items are grounded in those texts; fillers are labelled. Treat prices as plausible, not verified, until intake.
- The operator's visit notes (`notes.md`) and one feedback sentence feed every regeneration.

## Product Principles
- The owner must recognise their place in the first viewport: name, photo, what they cook.
- Phone and WhatsApp reachable within one thumb move at every scroll position on a phone.
- Real photos lead where they exist; where they do not, the page stays finished, never a grey placeholder box.
- Prices are read as a menu, not as a data table.

## Accessibility & Inclusion
WCAG AA contrast on every surface including coloured ones. Keyboard focus visible. Hours and prices in tabular numerals. Albanian diacritics (ë, ç) must render in every chosen font. Reduced motion honoured. Text sizes readable at arm's length on a phone.
