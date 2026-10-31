# Art Bible: SNAP IQ

> **Status**: Draft
> **Owned By**: art-director
> **Last Updated**: 2026-10-31
> **Art Director Sign-Off (AD-ART-BIBLE)**: [Not yet reviewed]

`/art-bible` writes these nine sections in this order and replaces each
section's `[To be designed]` line as that section is approved. A section still
holding its placeholder is incomplete; a later run fills only those.

## 1. Visual Identity Statement

**The one rule:** Real broadcast-night football, seen from Sahar's own eyes. When a choice is ambiguous, make the football cue (rusher, open receiver, blind side) the brightest, clearest thing on screen, *then* make it look real.

**1. The cue outranks the picture.** (Serves: feeling like a real QB, which means reading the rush and the open man.)
- Test: when realism and the legibility of a football cue are ambiguous, choose legibility, expressed through light, contrast and motion on the field, never through outlines, neon or UI chrome.
- The defense and the open receiver are the brightest, most saturated things on screen; the stadium and his own line stay muted.
- The open-receiver glow lives on the field, never on a button (docs/plans/instinct.md); his own players stay see-through (PRD §7.5).
- Minimum projected player height 28 CSS px (PRD §7.6).
- Contrast carried by lightness, not hue alone; colour plus shape, never colour alone.
- The glow must read as stadium-lit light, not an arcade effect (docs/STYLE.md: no neon).

**2. Always his eyes, always honest.** (Serves: every rep seen through his own eyes; PRD P3, never remove information.)
- Test: when a camera, framing or effect choice is ambiguous, choose what a QB's eyes at 1.64 m would actually see, and show where he is looking.
- Natural-lens view of about 100°, true perspective; no sky camera in drills; top-down only in Learn and Breakdown.
- The screen always shows where he is looking (PRD §7.5); anyone off-screen gets an edge marker.
- Difficulty never hides, shrinks or blurs a cue; it only removes aids such as glows (P3).
- No flash or shake during the read before the ball is out; effects (shake, bloom, blur, vignette) may never cover a cue.

**3. Night-game real, not cartoon.** (Serves: "a real QB … under the lights"; the Madden-real broadcast look.)
- Test: when style is ambiguous, choose the grounded broadcast option (real proportions, shaded forms, warm stadium light) over outlines, flat fills and arcade colour.
- Warm-white key light from the light banks, soft contact shadows, helmet gloss, slight bloom and vignette.
- Crowd and stands present but dark and soft, never brighter than the players.
- Two uniforms differing strongly in lightness, readable at 30 yards; original teams and uniforms only (no NFL teams, players or logos).
- Madden is a reference for look and atmosphere only.

**Cost rule (2D canvas, 2020 iPad, 60 fps):** realism is painted, not modelled (pre-rendered stadium panorama, cached vignette and grain, per-frame gradients only for players, helmets and shadows). When realism and 60 fps conflict, frame rate wins: drop an effect, never a cue.

## 2. Mood & Atmosphere

[To be designed] — for each major game state (exploration, combat, victory,
defeat, menus — whichever this game has): the emotional target, lighting
character (time of day, colour temperature, contrast), 3–5 atmospheric
descriptors, and energy level. Each state must look distinct from the others.

## 3. Shape Language

[To be designed] — character silhouette philosophy (readable at thumbnail
size, one distinguishing trait per archetype), environment geometry, UI shape
grammar, and hero versus supporting shapes.

## 4. Color System

[To be designed] — a primary palette of 5–7 colours with their meaning in this
world, semantic colour usage, per-area colour temperature rules, the UI palette
and where it diverges, and colourblind safety: which semantic colours need a
shape, icon or sound backup.

## 5. Character Design Direction

[To be designed] — the player character's visual archetype, how players tell
enemies, NPCs and allies apart at a glance, expression and pose style, and how
much detail survives at game camera distance (LOD philosophy).

## 6. Environment Design Language

[To be designed] — architectural style and its tie to the world's culture,
texture philosophy (painted, PBR or stylised, and why), prop density rules per
area type, and environmental storytelling guidelines.

## 7. UI/HUD Visual Direction

[To be designed] — diegetic versus screen-space HUD, typography (personality,
weight, size hierarchy, minimum readable size), iconography style, UI animation
feel, and any art-direction versus readability conflict and how it was decided.

## 8. Asset Standards

[To be designed] — file formats, naming convention, texture resolution tiers,
LOD levels, export settings, and the engine's hard limits (poly budgets per
asset category, texture memory, material slots). Where an art preference and a
technical limit disagree, record both and the trade-off chosen.

## 9. Reference Direction

[To be designed] — 3–5 references (games, films, art styles or artists). For
each: the specific element to take from it, and what to avoid so the result
does not read as a copy.
