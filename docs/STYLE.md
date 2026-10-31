# SNAP IQ visual style guide

Owner direction (2026-10-30): **look like Madden, seen from the quarterback's own eyes.** Madden's camera hovers
behind the play; ours is his natural-lens view at eye height (PRD §7.5), so everything here is judged from 1.64 m
above the turf, a few yards behind the line. Every visual change follows this file and is checked against it with
a screenshot before it is pushed.

## The reference
- **Madden:** broadcast-real players (proportioned bodies, pads, glossy helmets with cages, fabric jerseys with
  numbers on front, back and shoulders), stadium lighting, a living crowd, a TV score bug. Realistic, not cartoon.
- **What changes for his eyes:** no camera above the play. His own line fills the foreground from behind (backs,
  shoulders, helmets), the rush comes straight at him and grows as it closes, receivers are small and far, the sky
  and stands sit behind the defense. His own players stay see-through (PRD §7.5) so they never hide the read.

## The field
- **One continuous field.** Grass right out to the walls; the sidelines and the yard lines are white paint, nothing
  else. No different colour or shape outside the sidelines.
- Real turf: mowing stripes every 5 yards, slight texture, wear around the line of scrimmage.
- Real markings: yard lines every 5 yards, hash marks every yard, yard numbers on both sides (upright to a player on
  the field), the line of scrimmage as a broadcast-style overlay line, never painted.
- Perspective is true: a line d yards ahead of his eyes sits at horizon + k/d on screen, so lines bunch toward the
  horizon and the near field is mostly grass.

## Players
- Real proportions (no puppets): helmet with cage and stripe, shoulder pads, jersey over pads with numbers, pants
  with knee pads, socks, cleats, gloves. Linemen bigger than receivers.
- Animation comes from the renderer's pose model (stance, run, block, rush, backpedal, catch) driven by the
  engine's positions; feet planted, no sliding.
- Two uniforms with strong contrast in lightness, not only hue (his team vs the defense), readable at 30 yards.

## Light and atmosphere
- Default: **night game under stadium lights.** Warm-white key light from the light banks, soft contact shadows under
  every player, gloss on helmets, a little bloom on lights and white paint, slight vignette.
- Crowd and stands present but soft and dark, never brighter than the players.
- Contrast budget: the defense and the open receiver are the brightest, most saturated things on screen; the
  stadium and his own line are muted.

## HUD
- Broadcast feel: one compact score bug (hang time, multiplier, level), condensed type, no clutter.
- Controls translucent and quiet; the open-receiver glow is the loudest signal and lives on the field, never on a
  button (docs/plans/instinct.md).
- Minimum touch target 44 px; text contrast 4.5:1.

## Feel ("juice")
- A short camera shake and impact flash on a hit; a ball with motion blur and a spiral; turf kicked up on a plant;
  a crowd swell on a completion; panned rush sound from the side it comes from (helps the blind side).
- Effects never hide the field: no flash or shake during the read before the ball is out.

## Rendering (owner, 2026-10-31: stay in 2D)
- The his-eyes view stays the 2D canvas renderer (src/game/eyes.js): no 3D engine or bought models. The look comes
  from the palette above, shading instead of outlines, a pre-rendered stadium panorama that turns with his head,
  light towers with glow, turf stripes and grain, soft contact shadows, a vignette, and the effects below.

## Performance (PRD §14.5)
- 60 fps on the 2020 iPad: the stadium, vignette and grain are drawn once per screen size and reused every frame;
  per-frame gradients only for players, helmets and shadows.

## Don't
- No cartoon outlines, no neon arcade palettes, no flat fills.
- No real NFL players, teams, logos or likenesses.
- No separate-looking zone outside the sidelines.
