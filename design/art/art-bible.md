# Art Bible: SNAP IQ

> **Status**: Draft
> **Owned By**: art-director
> **Last Updated**: 2026-10-31
> **Art Director Sign-Off (AD-ART-BIBLE)**: SKIPPED 2026-10-31 — solo mode

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

**Governing idea:** simple masses, honest proportions, hard geometry on the field, and one soft shape reserved for the open receiver (1.1 the cue outranks the picture, 1.2 his eyes, 1.3 grounded broadcast, not cartoon).

**Character silhouettes (read at 28 CSS px height, PRD §7.6)**
- Thumbnail test: each player filled solid black at 28 px must still read by role in about 1 s from silhouette and posture. A pose or sizing change that fails it is blocked.
- Heights are only 1.80–1.92 m, so roles differ by width, stance and lean, not height. One signature trait per role:
  - **Linemen (OL, DL):** widest, lowest mass, shoulder bulk; static or short-stepping. Reads as a wall (target width-to-height about 0.55 in stance; confirm against the renderer).
  - **Rushers (edge, blitzers):** a forward-leaning wedge toward the camera, arms spreading as he closes. The only role that leans toward Sahar.
  - **Receivers (WR, TE, RB):** tall, narrow vertical line, arms swinging, small head; a TE is wider than a WR.
  - **Defensive backs (CB, S):** slim, upright, square to the receiver; hip-turn or backpedal. A sliding upright shape mirroring a receiver.
  - **LB:** mid-width upright block that steps forward or shuffles laterally; wider than a DB, less hunched than a DL.
- Helmet and shoulders carry the read at distance; the helmet is the highest-contrast detail on a defender.
- Real proportions only: no exaggerated heads or limbs, no outlines; edge darkening stays at 1 px.
- His own players are see-through (alpha 0.34): a calm mass that never competes with the rush.

**Environment geometry**
- Field: strong horizontals (yard lines, mow stripes) converging to the horizon in true perspective; leading lines to the first read and the rush. The near field is mostly plain grass.
- Line of scrimmage: the only continuous solid horizontal in broadcast blue.
- Stadium: a low, dark, soft horizontal mass of stands. The four light towers are the only bright verticals, kept above the horizon band; tower glow never reaches the receiver band. The crowd is never brighter than the players.
- One continuous field, no separate zone outside the sidelines (STYLE.md); no hard-edged signage in the sight lines.

**UI shape grammar (the HUD echoes the broadcast look)**
- Status (score bug, play clock, level): rounded rectangles on dark glass, 6–8 px radius, condensed type.
- Controls (movement pad, throw buttons): circular thumb targets, at least 44 px, translucent.
- Ally throw glyphs ◆ ● ▲ ■ ★: crisp-edged on small tags, never feathered or glowing.
- Field markers: chevrons, arcs and dashed lines only. Blind-side marker: inward chevron wedges at the off-hand screen edge. Pocket edge: dashed, distinct from the solid line of scrimmage.
- Boards (call, Breakdown, report) and the home screen: 12 px radius cards, thin rules, no flourishes.
- At most 3 corner radii in the product: 6, 12, full circle.

**Hero versus supporting shapes**
1. Hero: the open-receiver glow (feathered ground ellipse with a faint upright rim), the nearest closing rusher, and at stop 2 the first-read target.
2. Action: other defenders, the line of scrimmage, the hot-clock ring, the edge flicker.
3. Supporting: his own line (see-through), yard lines and numbers, HUD chrome, throw tags.
4. Ambient: sky, stands, crowd, light towers.
- The open-receiver glow is the only soft, round, additive shape on the field; everything else is hard-edged or shaded, so the open man pops by curvature, not colour alone.
- Hierarchy by size, lightness and motion first, colour second. Rush and blind-side cues are shapes (wedge, lean, chevron) so they survive colour loss.

## 4. Color System

**Principle (1.1, 1.3):** lightness first, hue second, never colour alone. The field is a muted dark stage; only the defense and the open receiver are bright.

**Primary palette** (from the current `STYLE` in `src/game/eyes.js`, plus Signal Gold)

| Name | Hex | Role |
|---|---|---|
| Night Navy | #03050C → #16233F | sky and stadium ambient; cool, dark |
| Turf Green | #215F36, stripe #1A4F2D | the field stage; muted, mid-dark |
| Paint White | #EEF2F6 (numbers at 0.82 alpha); jersey #F4F5F8 | yard lines, numbers, defense jersey |
| Defense Red | #B5122B (helmet, numbers); alert #E0465E | defense identity; edge alerts and defense tags |
| Team Blue | #5B8DEF jersey, #1C3A8C helmet | his team (see-through in drills) |
| Signal Gold (new, owner 2026-10-31) | #FFD84D, core #FFF4C2 | the open receiver, on the field only; replaces the current green glow (rgba(107,203,147) / #2F7D4F), which sat too close to the turf |
| Glass Ink | #080C16 at 0.72–0.82 alpha | HUD ground, controls, dark cards |

- Light-bank key rgba(255,250,235): the field pool and bloom tint, the only warm in night scenes.
- The white defense jersey is the brightest large object on screen, on purpose.

**Semantic colours**
- **Open receiver:** Signal Gold feathered ground glow and its tag. Never on a button, HUD element or UI chrome; the only additive-blend element on the field; never used for danger.
- **Pressure / danger:** defenders white with red trim; edge alerts and defense tags #E0465E. No red glow on rushers (Section 2).
- **Blind side:** off-hand-edge chevron wedges in #E0465E with a flicker; same family as danger, separated by shape, position and motion.
- **His team:** Team Blue, see-through; tag border #6EA0FF. **The defense:** white jersey, red helmet and numbers; tag border #E0465E.
- **Line of scrimmage:** broadcast blue #4C8DFF, solid, with a 0.28-alpha glow band. Risk: close in hue to Team Blue; accepted because one is a line and one a see-through figure. If playtest shows confusion, move the line toward cyan; do not touch Team Blue.
- **Pocket edge:** Paint White at about 60% alpha, dashed, 1.5× yard-line weight; check it does not read as a yard line where they cross.
- **Hot clock:** HUD ring only, white shrinking to orange #FF9A3C over the last second; orange never appears on the field; the ring always shows a number.
- **Result:** right = mint #3DDC97 with a check; wrong = slate #8FA0BC with an arrow and "next time" copy. No red for a miss.

**Colour temperature**
- Sky and stands cool and dark; field and players warm-white key over cool ambient; Home warm indoor; Breakdown neutral-cool paper; run report cool navy with one warm accent; the call cool slate.
- Mood shifts are lightness, saturation and vignette, never a whole-screen tint.

**UI palette and divergences**
- In-drill HUD: dark glass rgba(8,12,22,0.72–0.82), borders rgba(255,255,255,0.12–0.32), white text; text contrast ≥ 4.5:1, touch targets ≥ 44 px.
- HUD red #C8102E → #8E0B21 (brand and cue red): score pill and cue banner only, never on the field or the glow.
- Mint and slate only in result banners; hot-clock orange only in the ring.
- Light screens use the `:root` variables in `src/game/index.html` (--ink #1C2430, --paper #FFFFFF, --ground #E9ECEF, --off #1F5FD1, --def #C94A16, --ok #2F7D4F). Offense and defense colours used as text must meet 4.5:1 on paper; gold is never text on paper.

**Colourblind safety (must pass deuteranopia and protanopia)**

| Pair | Risk | Backup |
|---|---|---|
| Red helmet vs turf | about 1.1:1 luminance; fails alone | the white jersey (about 6:1 on turf) carries the defense; the helmet is never the sole cue |
| Red edge alert vs turf | hue lost | shape (chevron wedge), motion (flicker), later panned audio |
| Blind-side red vs other danger red | same hue | chevrons on the off-hand edge only |
| Gold glow vs hot-clock orange | near-identical for red-green deficiency | place (field vs HUD), shape (ground ellipse vs shrinking ring), digits on the ring |
| Gold vs turf | passes, about 5.5:1 | still paired with the ellipse and a pulse |
| Team Blue vs defense | lightness differs strongly | tags differ: offense shape glyph + key, defense jersey number |
| Line-of-scrimmage blue vs Team Blue | similar hue | a line vs a figure |
| Mint vs slate result | similar lightness for some | check vs arrow icon, different copy |

- Acceptance (before Section 7 sign-off): screenshots of each drill state through deuteranopia and protanopia simulation, plus a greyscale pass; the open receiver, nearest rusher and blind-side marker must stay identifiable.

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
