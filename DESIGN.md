---
name: Site Factory Template
description: A kilim hung on the oda wall; one woven page per client, seven config tokens, zero client JavaScript.
colors:
  wool-black: "#1A1717"
  undyed-wool: "#F3ECDD"
  madder-red: "#B5311F"
  ochre: "#D9A441"
  kilim-green: "#2E5A4B"
  on-primary: "#F3ECDD"
  on-accent: "#1A1717"
  on-muted: "#F3ECDD"
typography:
  display:
    fontFamily: "Unbounded, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, calc((100vw - 2.5rem) / var(--chars, 8) * 1.5), 6rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Unbounded, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Unbounded, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  lede:
    fontFamily: "Onest, system-ui, sans-serif"
    fontSize: "clamp(1.15rem, 2.2vw, 1.4rem)"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "Onest, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontFamily: "Onest, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  none: "0"
spacing:
  stitch: "4px"
  xs: "0.5rem"
  sm: "1rem"
  md: "1.5rem"
  lg: "2rem"
  xl: "3rem"
  section: "clamp(3rem, 7vw, 5.5rem)"
components:
  button-primary:
    backgroundColor: "{colors.ochre}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.none}"
    padding: "0.8rem 1.4rem"
    height: "3.25rem"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, #D9A441 86%, white)"
    textColor: "{colors.on-accent}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "currentColor"
    rounded: "{rounded.none}"
    padding: "0.8rem 1.4rem"
    height: "3.25rem"
  button-outline-hover:
    backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)"
  patch-muted:
    backgroundColor: "{colors.kilim-green}"
    textColor: "{colors.on-muted}"
    rounded: "{rounded.none}"
    padding: "1.25rem 1.25rem 1.5rem"
  patch-primary:
    backgroundColor: "{colors.madder-red}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.none}"
    padding: "1.25rem 1.25rem 1.5rem"
  sticky-bar-button:
    backgroundColor: "{colors.wool-black}"
    textColor: "{colors.undyed-wool}"
    rounded: "{rounded.none}"
    padding: "0.8rem 0.75rem"
    height: "3.75rem"
---

# Design System: Site Factory Template

## Overview

**Creative North Star: "The Kilim on the Oda Wall"**

The page is a woven rug hung flat on a wall. A madder-red field carries the restaurant's name at the top and the contact block at the bottom; between them the wool-black ground holds every content block as a patch of cloth set inside a 4px undyed frame. Two decorative devices exist and no others: the 4px stitch unit (stitch rules, patch frames, dashed dividers) and a 24px stepped-diamond tile used as a CSS mask (border bands, the no-photo motif, the rating diamonds). With every word removed, the bands, patches and stitch rules still read as a rug.

The system is defined in token roles, not fixed colours. Every client ships seven theme tokens from `config.json` (`bg`, `ink`, `primary`, `accent`, `muted`, `display`, `body`) plus an optional `displayWeight`; `Base.astro` injects them as `--bg`, `--ink`, `--primary`, `--accent`, `--muted`, `--font-display`, `--font-body`, `--display-weight`, and computes `--on-primary`, `--on-accent`, `--on-muted` at build time by WCAG contrast ratio (whichever of ink or bg contrasts more with the surface) and `color-scheme` from bg luminance (dark below 0.4). Everything in `global.css` derives from those roles. The hex values in the frontmatter are the restaurant vertical's reference instance (`template/src/verticals/restaurant.json`), not the system.

It refuses the category default: no full-bleed photo with a white serif name floated on top, no cream sections beneath, no rounded corners, no shadows, no client JavaScript. Density is confident and phone-first: the name fills the 390px width, prices sit in a fixed right column, the call and WhatsApp buttons are locked to the bottom edge of every phone viewport.

**Key Characteristics:**
- Token-role world: seven client tokens, three computed on-colours, one stylesheet; the restaurant set is the reference instance
- Field and ground: primary-coloured hero and contact bands, bg-coloured content ground, patches in muted or primary
- Two devices only: the 4px stitch unit and the 24px stepped-diamond mask
- Sharp corners everywhere, 4px solid ink patch frames, no shadows, no gradients except stitch dashes
- Unbounded (800 where the vertical asks) set tight at line-height 1; Onest body; tabular figures
- Motion is CSS only: one weave-in on load, scroll-driven stitch reveal on menu rows, 160ms hover and press
- All copy from config and vertical labels; every element survives 0 photos, 2 to 30 character names, 6 to 20 items

## Colors

Five token roles per client and three computed on-colours; the restaurant instance is a wool-black ground with a madder field, undyed ink, a single ochre control and a dark green patch.

### Primary
- **Madder Red** (`--primary`, #B5311F in the restaurant set): the woven field. Background of the hero header and the contact section, the `theme-color` meta, the scrollbar thumb, the small inner diamond of the no-photo motif, and the largest menu group's patch. Text on it is `--on-primary` (computed; undyed wool in the reference set).

### Secondary
- **Ochre** (`--accent`, #D9A441): the single bright control. Primary button fill, the stepped-diamond border bands, the large diamond of the no-photo motif, the filled portion of the rating diamonds, link underlines, text selection, the focus ring, `accent-color` and `caret-color`, and the stitch rule of a hovered menu row. Text on it is `--on-accent` (computed; wool-black in the reference set).

### Tertiary
- **Kilim Green** (`--muted`, #2E5A4B): the muted patch surface. Default `--patch` fill for menu groups, the hours list, the hero photo frame background, the map frame. Text on it is `--on-muted` (computed; undyed wool in the reference set).

### Neutral
- **Wool Black** (`--bg`, #1A1717): the ground. Page background, the sticky bar background, scrollbar track. Drives `color-scheme`.
- **Undyed Wool** (`--ink`, #F3ECDD): the thread. Body text on the ground and the 4px solid frame around every patch, on every surface.
- **Ink 2** (`color-mix(in srgb, currentColor 74%, transparent)`): secondary text; the lede under section headings and the footer line. Follows whatever surface it sits on.
- **Ink 3** (`color-mix(in srgb, currentColor 40%, transparent)`): the default stitch rule colour and the unfilled rating diamonds.

### Named Rules
**The Role Not Hex Rule.** Components reference `--bg`, `--ink`, `--primary`, `--accent`, `--muted` and the computed `--on-*` only. No component may hardcode a colour; a new client with different tokens must stay readable without touching CSS.

**The Follow-The-Surface Rule.** Secondary text and rules are `currentColor` faded via `color-mix`, never a fixed neutral. On a patch the text colour is set once (`--on-muted` or `--on-primary`) and every faded tone inside follows it.

**The One Bright Control Rule.** Ochre is the only colour that asks for a tap. It fills exactly one primary button per surface (WhatsApp) plus the fixed decorative bands and rating; it never fills a patch or a heading.

## Typography

**Display Font:** Unbounded (with system-ui, sans-serif), loaded from Google Fonts at 400-700 plus the vertical's `displayWeight` (800 for restaurant)
**Body Font:** Onest (with system-ui, sans-serif), 400-700

**Character:** Wide, geometric and heavy against a plain humanist body. Display lines are set at line-height 1 with -0.02em tracking and `text-wrap: balance`; the body is 17px at 1.55 with tabular numerals on by default so hours and prices align without a monospace face.

### Hierarchy
- **Display** (`--display-weight` or 700, `clamp(2.5rem, calc((100vw - 2.5rem) / var(--chars) * 1.5), 6rem)`, 1): the restaurant name only. `--chars` is the longest word in the name, set inline by Hero, so the name fills the phone width whatever its length; `overflow-wrap: anywhere` is the floor.
- **Headline** (700, `clamp(1.75rem, 4vw, 2.75rem)`, 1): section headings (Menyja, Për ne, Orari, Na gjeni, the about title). 1rem below.
- **Title** (700, 1.25rem, 1): menu group names inside patches. The brand link in the desktop nav is the same face at 1rem.
- **Lede** (400, `clamp(1.15rem, 2.2vw, 1.4rem)`, 1.35): the hero headline under the name, max 34ch, in `--on-primary`. The section lede below headings is body size in Ink 2 at max 44ch.
- **Body** (400, 1.0625rem, 1.55): paragraphs at max 60ch. Menu item names, hours times and prices are 600; the rating figure is 700.
- **Small** (400, 0.9rem): menu item descriptions (max 30ch) and the footer line.

### Named Rules
**The Fixed Column Rule.** Every figure is tabular (`font-variant-numeric: tabular-nums` on body). Prices sit in a right-aligned column of `min-width: 6.5ch`, `white-space: nowrap`; hours times are 600 and never wrap.

**The Longest Word Rule.** The name is sized from its longest word, not its character count, so "Te Liria" and "Liburnia" both fill 390px without breaking mid-word.

**The No Label Rule.** There is no uppercase label style, no kicker, no eyebrow. Section context is carried by the headline and the lede in Ink 2.

## Layout

One column, one reading axis, one page. The container is `.wrap`: `width: min(100% - 2.5rem, 70rem)`, centred, so the phone gutter is 1.25rem each side and desktop caps at 1120px. Sections carry `padding-block: clamp(3rem, 7vw, 5.5rem)` and consecutive sections drop their top padding so the rhythm is one block of air between blocks.

The single breakpoint is 800px. Below it: the desktop nav is hidden, the hero's inline CTAs are hidden (the sticky bar carries them), the body gets `padding-bottom: calc(3.75rem + env(safe-area-inset-bottom))` for the bar, menu groups and gallery stack in one or two columns, hours and contact stack. At 800px and up: the hero field becomes a `1.1fr 1fr` grid (name, headline, CTAs left; photo patch right spanning two rows, square, max 30rem; the hours fringe under the words at max 28rem), menu patches go to two columns with `grid-auto-flow: dense`, the largest group spans both columns and sets its rows in two CSS columns (an orphaned last group also spans), the gallery repacks into whole cells (first photo large, spanning all rows), contact and map sit side by side.

Spacing steps observed: the 4px stitch; 0.35rem row gaps inside fringes; 0.5rem, 0.75rem, 1rem, 1.25rem, 1.5rem, 2rem, 3rem for gaps and padding; patch padding `1.25rem 1.25rem 1.5rem`; menu rows `0.8rem` top and `0.75rem` bottom; hours rows `0.7rem`. Photo patches are 4:3 on phones; the hero patch is 1:1 on desktop.

Order is fixed: Hero, Items, About, Gallery, Hours, Contact, StickyBar. Gallery and Hours render nothing when their data is empty.

## Elevation & Depth

No shadows anywhere. Depth is tonal and material: the primary field and the bg ground are two cloths, the muted or primary patches are pieces sewn on top, and the 4px solid ink frame around every patch is the seam. The fixed sticky bar sits on the ground colour and separates from the page with a 2px top border only (ink on the call button, ochre on the WhatsApp button). The map iframe carries `filter: grayscale(.2)` so it reads as printed on cloth rather than a live window.

### Named Rules
**The Flat Weave Rule.** Nothing lifts. No `box-shadow`, no blur, no gradient fills except the 4px stitch dash pattern. A surface is distinguished by its token colour and its frame, never by shade.

## Shapes

Every corner is sharp: `border-radius` is never set. Rectangles are the only silhouette for content; the only non-rectangular geometry is the stepped diamond, a 24x24 SVG tile with 3px steps, applied as a `mask-image` so it takes any token colour.

- **Patch frame:** `border: 4px solid var(--ink)`, background `var(--patch, var(--muted))`. Photos, menu groups, the hours list, the hero photo and the map all use it. Images inside are `object-fit: cover`.
- **Band:** a strip `calc(var(--stitch) * 6)` = 24px tall filled with `--accent`, masked by the motif at 24px repeat-x, so it renders as a chain of diamonds. Top and bottom of the hero, top of contact, top of footer.
- **Stitch rule:** 2px tall, `repeating-linear-gradient(90deg, var(--rule, var(--ink-3)) 0 4px, transparent 4px 8px)`. Dividers between menu rows and hours rows; `--rule` is set to `currentColor` at 45% inside patches, and to `--accent` on hover.
- **Motif patch:** when there is no hero photo, the patch shows a diamond at 62% of its size in `--accent` with a diamond at 28% in `--primary` centred inside it.
- **Rating diamonds:** five tiles (120x24) in Ink 3, with an `--accent` overlay clipped to `calc(var(--r) * 100%)` of the width.

## Components

### Buttons
Woven, framed, pressable. Inline-flex, `min-height: 3.25rem`, `padding: 0.8rem 1.4rem`, weight 700, no wrap, no underline, sharp corners.
- **Shape:** rectangle, 2px solid border (0 radius)
- **Primary (`.btn.primary`):** background and border `--accent`, text `--on-accent`. Used once per surface: "Rezervo në WhatsApp" in the hero, contact and sticky bar.
- **Outline (`.btn`):** transparent, `border: 2px solid currentColor`, text inherits the surface. "Menyja" in the hero, "Thirr" in the sticky bar.
- **Hover** (fine pointer only): outline gets `currentColor` at 12%; primary lightens to `color-mix(in srgb, var(--accent) 86%, white)`; 160ms.
- **Press:** `transform: scale(.97)` with the 160ms exponential ease-out.
- **Focus:** the global `outline: 3px solid var(--accent); outline-offset: 3px`.

### Patches (Cards / Containers)
- **Corner Style:** sharp
- **Background:** `--patch`, defaulting to `--muted`; the largest menu group sets `--patch: var(--primary)` and `color: var(--on-primary)`, every other group `--muted` and `--on-muted`
- **Shadow Strategy:** none (see Elevation & Depth)
- **Border:** 4px solid `--ink`
- **Internal Padding:** `1.25rem 1.25rem 1.5rem` for menu groups; `0.5rem 1.25rem` for the hours list; photo and map patches have none

### Menu Row (signature)
A grid `1fr auto` with a 1rem column gap, items aligned at baseline, `padding-block: .8rem .75rem`. The name (600) stacks its description as `small` at 0.9rem / 400 / max 30ch. The price (600) sits right-aligned in a `min-width: 6.5ch` column. An absolutely positioned `.stitch` spans the top edge as the divider. On hover with a fine pointer the row sets `--rule: var(--accent)` and the stitch turns ochre in 160ms. Under `@supports (animation-timeline: view())` and `prefers-reduced-motion: no-preference` the stitch is sewn in left to right (`clip-path: inset(0 100% 0 0)` to `inset(0)`) over `entry 0%` to `entry 40%` of the row's view timeline; otherwise it is already drawn.

### Hours List and Hero Fringe
Definition lists of `dt` day (capitalised) and `dd` time (600, nowrap) in a space-between flex row. In the Hours section the rows sit in a muted patch at max 30rem and divide with the stitch rule drawn as a background. In the hero fringe (up to three compacted rows, or the first row plus a "Shih orarin e plotë" link when the week is irregular) rows divide with `2px dashed` `--on-primary` at 45%.

### Navigation
Desktop only (hidden below 640px): a flex row inside the hero field with the name in Unbounded 700 at 1rem (`-0.01em`) on the left and the phone number at weight 600 on the right, both undecorated links, `min-height: 4rem`. No menu, no hamburger; the page is one scroll.

### Sticky Bar (signature)
Phones only (hidden at 800px and up). `position: fixed` to the bottom, `z-index: 10`, background `--bg`, `padding-bottom: env(safe-area-inset-bottom)`. Two equal-width grid columns: "Thirr" as an outline button and "Rezervo në WhatsApp" as a primary button, each `min-height: 3.75rem`, 1rem text, `padding-inline: .75rem`, with borders reduced to a 2px top edge (ochre on the primary). Same proportion at every width.

### Weave-in (signature motion)
Under `prefers-reduced-motion: no-preference`, elements with `.weave` start at `clip-path: inset(0 100% 0 0)` via `@starting-style` and transition to `inset(0)` over 600ms with `cubic-bezier(0.23, 1, 0.32, 1)`; `.weave.late` adds a 140ms delay. Applied to the hero words and the hero photo patch only. Nothing else animates on load.

### Rating
A flex row: the five rating diamonds, then `<b>4.6</b> nga 212 vlerësime në Google`, then an optional "Lexoji vlerësimet" link to the Maps URL. Rendered only when both a numeric rating and a review count exist.

## Do's and Don'ts

### Do:
- **Do** reference colours by role (`--bg`, `--ink`, `--primary`, `--accent`, `--muted`) and put text on coloured surfaces in the matching computed `--on-*` variable.
- **Do** frame every content block as a patch: 4px solid `--ink` border, `--patch` fill, sharp corners.
- **Do** build every decorative edge from the two devices: the 4px stitch dash or the 24px stepped-diamond mask in a token colour.
- **Do** set figures tabular and give prices a fixed right column (`min-width: 6.5ch`).
- **Do** keep the 800px breakpoint as the only layout switch, and keep the sticky call/WhatsApp bar reachable at every scroll position below it.
- **Do** gate every animation behind `prefers-reduced-motion: no-preference` and, for scroll-driven work, `@supports (animation-timeline: view())`, with the resting state already drawn.
- **Do** read all copy from `config.json` and `verticals/<vertical>.json` labels.

### Don't:
- **Don't** add client JavaScript; motion is CSS transitions, `@starting-style`, and scroll-driven animation only.
- **Don't** set `border-radius`, `box-shadow`, blur, or gradient fills; the weave is flat and sharp.
- **Don't** hardcode a hex in a component or assume ink is light and bg is dark; another client's token set may invert the scheme.
- **Don't** float the name over a full-bleed photo or use a white serif on a photo; the name sits on the primary field beside a framed patch.
- **Don't** add uppercase labels, kickers or eyebrows above headings; headline plus Ink 2 lede is the whole hierarchy.
- **Don't** fill a patch or a heading with `--accent`; ochre is reserved for the primary button, bands, rating fill and hover stitch.
- **Don't** hardcode Albanian strings in components or introduce a second display face.
