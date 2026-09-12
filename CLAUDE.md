# site-factory

README.md is the operating manual (commands, flow, where things live). This file only adds what the repo does not show.

## Design skills are mandatory for template UI work

Before any edit under `template/src/` (components, layouts, styles, pages, vertical presets), load all three with the Skill tool, in this order:

1. `impeccable` — design direction and critique (`/impeccable craft|audit|polish <target>`); reads `PRODUCT.md` and `DESIGN.md` at the repo root.
2. `design-taste-frontend` — typography, layout, spacing, anti-slop rules.
3. `emil-design-eng` — motion and interaction polish (`animate`, `review-animations` for deeper passes).

A PreToolUse hook (`factory/hooks/design-skills.mjs`) rejects Edit/Write under `template/src/` until all three have been loaded in the current session. If an edit is blocked, load the missing skills and retry; do not work around the hook with Bash.

Constraints the skills do not know: the template ships zero client JS, so motion is CSS-only (no GSAP, no framer-motion). Copy is Albanian and comes from `config.json`; never hardcode text in components.
