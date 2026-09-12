---
version: 1
slug: "template-src"
primary_target: "template/src"
related_targets: []
---

# Surface: the one-page restaurant site (template/src)

Scope: Persuade. Audience: the owner on a phone first, their customers second. Job: recognise the place in one viewport, read what they cook and when, tap call or WhatsApp. Proof on hand: name, up to five Google photos, rating, hours, Claude-drafted menu. Constraints: zero client JS, seven config tokens per client, any name length, zero to five photos, Albanian copy from config only.

## Direction contract

THESIS: The page is a kilim hung on the oda wall. A committed madder-red woven field carries the restaurant's name, and every content block is a patch set inside stepped borders. It refuses the category default: a full-bleed photo with a white serif name floated on top and cream sections below.

OWN-WORLD: Madder red field (primary), wool-black ground (bg), undyed-wool ink, ochre for the single bright control (accent), a dark green band as the muted surface. Borders are stepped-diamond and zigzag bands drawn with CSS repeating gradients on a 4px stitch unit. Rules are stitch rules: 4px dashes in ink. Corners are sharp everywhere. Photos are rectangular patches with a 4px undyed frame. Display type is Unbounded, wide and geometric, set tight; body is Onest; every figure is tabular in a fixed decimal column. With every word removed, the bands, patches and stitch rules still read as a rug.

STORY: The owner sees their name woven large over their own photo and dishes and reads it as more dignified than their Facebook page. A customer learns what is cooked, that it is open now, and taps WhatsApp.

FIRST VIEWPORT: Phone 390 wide. A zigzag border band, ochre on madder, across the top edge. The name in Unbounded 800 filling the width on the madder field, tagline beneath in Onest. The hero photo as a framed patch inside the field; without a photo, a large woven diamond motif patch in ochre and green. Along the field's bottom edge the hours fringe: today's hours in tabular figures. Locked at the bottom, the two-button bar: "Thirr" undyed on wool-black, "WhatsApp" on ochre, same proportion at every width. Desktop 1280 and up: the field splits, name and tagline and hours left, photo patch right, the border bands framing the whole viewport like the rug's edge.

FORM: The kilim on the oda wall, candidate 4 of 7 on the ordered grounded list, assigned by seed key 8d35d2bf, code-led. Signature interaction: the weave-in. On load the border bands and the name reveal with a clip-path inset sweeping from the left like a shuttle passing, once, 600ms exponential ease-out; nothing else animates on load. Menu rows reveal their stitch rule with scroll-driven animation where supported, already drawn under reduced motion. Hover or press on a menu row turns its stitch rule ochre in 160ms. Buttons press to scale 0.97.

Raises kept from the hand: unequal patches with stitched captions (quilt); one highlighted element per section (zine); one tabular figure at a fixed column (nixie); gallery repacks in whole cells (doujin); the locked anchor bar (broadcast); one reading axis on phones (rain).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
