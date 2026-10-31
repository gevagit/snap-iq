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

**Global rules**
- Every drill state is a night game under the lights (1.3). Mood changes come from contrast, vignette, saturation and light level, never from a new colour scheme or a screen-wide tint.
- No mood effect may cover a cue (1.2). Before the ball is out: no flash, shake, bloom or blur on the read.
- Energy scale: 1 = still, 5 = peak. Two states are indoor, with no stadium light: Breakdown (film room) and Home (locker room).

**Rushers: imposing, not dark (owner, 2026-10-31)**
- Threat comes from lightness contrast, scale and motion only; never darkness, red glow, outlines or skull-like effects. His-eyes perspective already grows a closing rusher; do not exaggerate it.
- Levers: contact shadow lengthens and darkens up to +30% inside about 6 yd; white jersey against turf stays at full contrast; lean and stride in the pose model, wide-armed reach at about 2 yd; screen-edge flicker for off-screen rushers, strongest on the off-hand side.
- Cap: no rusher cue may exceed the open-receiver glow in saturation or bloom. The rusher is the biggest, whitest thing; the open-receiver glow is the loudest.

**Routine game**

| State | Emotion | Light | Descriptors | Energy | Carrier |
|---|---|---|---|---|---|
| The call (huddle) | calm confidence, "I know the plan" | dark slate card, white play diagram; cool, mid contrast | ordered, quiet, clipboard-clean | 2 | crisp route diagram on a flat dark card, play name in condensed type |
| Routine at the line | held breath, controlled tension | full night: warm-white key, deep sky, high contrast, soft contact shadows | coiled, taut, bright, clean | 3, rising with the clock | the glowing line of scrimmage; play-clock pill white, hot-clock orange only near zero |
| Stop 1 (at the snap) | release: everything starts | no change; a stop-frame beat | sudden, frozen, exact | 4–5 (one beat) | all 11 defenders caught mid-first-step; the screen shows where his eyes turn; no flash or shake |
| Stop 2 (1 s later) | clarity and decision pressure, "now read it" | night key; vignette tightens about 8% at the edges only, centre at full lightness | stilled, clear, deliberate | 2 | first-read target at centre with the look marker; defense at its most separated from the turf |
| Result | a plain, fair verdict, never shame | unchanged night field under dark glass | steady, honest, quick, kind | 3 right / 2 wrong | right: +6% key for 400 ms, mint check banner, crowd swell; wrong: slate "next time" banner, no red, no shake |
| Breakdown | curious, in control, "ah, that's why" | bright film-room paper board, neutral-cool, low contrast, no stadium | airy, analytical, patient | 1 | ink-on-paper routes and coverage, scrub slider; light, where the call is dark |

**Pocket Instinct**

| State | Emotion | Light | Descriptors | Energy | Carrier |
|---|---|---|---|---|---|
| Ready (SNAP) | coiled, hushed, "here it comes" | night field, crowd about 10% dimmer, contrast held high | hushed, loaded, still | 2 | SNAP button in dark glass with a slow 1 Hz outline breathe, never in the open-receiver colour; defense set with a visible lean |
| Live rush | controlled panic and flow; the peak | highest contrast of any state; vignette tightens with the nearest rusher (cap about 12%, edges only) | sharp, crowded, fast, loud | 5 | growing white rushers, off-hand edge flicker, the open-receiver glow (the loudest signal), the 3 s hot-clock ring; higher levels add speed and numbers, never hide cues (P3) |
| Completion | release, relief, pride | +6% key for 400 ms, soft bloom on ball and catch, only after the catch | warm, bright, rising | 4, back to 3 as the next snap starts | crowd swell, multiplier tick, the glow collapsing into the catch |
| Hit or interception | a fair sting, "got me, go again" | saturation drops about 60% for 600 ms, vignette closes slightly; a short shake is allowed (ball dead); hold on the cause; a pale ring on the defender who picked it | heavy, muted, abrupt, fair | 4 on impact, then 1 | desaturated held frame on the hitter or picker; no red flash, no "GAME OVER" slam |
| Run report | reflective pride, "what I did, what to fix" | dim desaturated last frame under dark glass; cool navy plus one warm accent | tidy, numerate, encouraging | 1–2 | big hang-time number in condensed type; blind-side vs throwing-side split bars; dark glass, where the Breakdown is light paper |

**Home ("locker room")**
- Emotion: belonging and readiness, "my locker, my number". Warm, low-contrast indoor evening: slate-navy ground with a warm lamp wash from the top; no sky, no field. The only state where warm tone dominates.
- Descriptors: warm, safe, personal, steady. Energy 1.
- Carrier: the "Sahar · #4 · QB" nameplate and rank bar in jersey-number stencil weight and condensed type; CSS gradients only, no bought art.

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
