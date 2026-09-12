# site-factory

Turns Google Maps listings of small businesses in Kosovo into one-page websites, first as unsolicited demos, then as paid sites. This file is the glossary: what the words mean, nothing about how the code does it.

## Language

### The pipeline

**Place**:
One business as Google knows it: a place ID with a name, address, photos, hours and reviews. Every record in the factory starts as a Place.
_Avoid_: lead, listing, result

**Lead search**:
One query against Google (a vertical keyword plus a city) and the raw Places it returned. A cache of what Google said, not the record of truth.
_Avoid_: leads file

**Prospect**:
A Place for which a Demo has been generated and that has not yet paid. The sales conversation happens with a Prospect.
_Avoid_: client (until they pay), lead

**Client**:
A Place whose owner has paid for the site. The only thing that turns a Prospect into a Client is money.
_Avoid_: customer (that word is reserved for the restaurant's own customers)

**Demo**:
The generated site for a Prospect, built from Google and Instagram data alone, before the owner has said anything. Shown to the owner locally, not published.
_Avoid_: preview (that is the act of looking at a Demo), draft

**Intake**:
The owner's own answers (name, phone, hours, menu, photos) collected after they say yes. Intake overrides everything generated.

**QA gate**:
The automatic check a Demo must pass before it is worth a human look: the page renders, the name is visible, no image is broken, text is readable.

**Approval**:
The human decision that a Demo is ready to show. Comes after the QA gate, never instead of it.

### The site

**Skeleton**:
The one Astro template: the fixed structure of sections and the way each surface draws from the Theme. Has no look of its own.
_Avoid_: template (ambiguous with "kinds of templates"), layout

**Vertical**:
The line of business a Place is in (restaurant, dentist, auto, guesthouse). Decides which sections, labels and item groups the Skeleton renders.
_Avoid_: category, type, template

**Archetype**:
A kind of business within a Vertical (for restaurants: grill house, modern café, patisserie, pizza and fast food, traditional family restaurant, fine dining, bar). Decides the copy brief and the default layout variants; chosen by Claude from the Place's data and photos.
_Avoid_: template, style, kind

**Theme**:
The whole per-Place look: colour tokens, two typefaces, corner and edge language, and the layout variants. Generated from the Place's own photos, repaired for contrast. The Theme is the Place's identity; the Skeleton only renders it.
_Avoid_: style, design, template, palette (palette is only the colour part)

**Layout variant**:
One of a few fixed shapes for a section of the Skeleton (for example, how the hero or the menu is arranged). Part of the Theme; chosen per Place, not written per Place.

**Photo pool**:
Every photo the factory has for a Place, from Google and from Instagram, before any is chosen for the site.

### The operator

**Portal**:
The local web app the operator uses instead of the command line: run lead searches and generation, see every Place and its Status, approve, regenerate, track Prospects and Clients.
_Avoid_: console, dashboard, admin, web

**Demo view**:
The mode of the Portal that opens one Place's Demo for viewing, on the operator's own devices.
_Avoid_: preview mode, demo mode

**Status**:
Where a Place is in the pipeline, from found to live or declined. One status per Place, held with the Place, not with the Lead search.
