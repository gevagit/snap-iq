# Plan: Pocket Instinct (replaces the Pocket workout)

Owner decisions, 2026-10-29. Replaces the Bubble "Pocket workout" (PRD §8.4) completely; the routine game stays.

## The game
An endless survival run from his eyes. Each **snap** the rush comes and allies (receivers) work downfield; he
moves to stay free and throws to an ally who comes open. A completion starts the next snap at once, a bit faster
and harder. **The run ends when a hitter gets him** (or a throw is picked off). Best run = longest hang time.

- **Feet (right thumb):** the pad: climb (step up), drop (step back), slide, escape. Hitters come the ways real
  rushers do (content/pocket/rules.yaml, signed off): around the edge (climb beats it), up the middle (slide
  beats it), from several points (escape beats it), unblocked (ball out or dodge).
- **Eyes:** 3-5 allies downfield, each with a shadow defender. An ally comes open for a **window** (his shadow
  falls off him); windows open anywhere, often wide, so he has to see them without looking straight at them.
- **Hands (left thumb, his throwing hand):** fixed buttons, one per ally, with the shape that floats over that
  ally (◆ ● ▲ ■ ★), always in the same place, so his thumb learns them and his eyes stay downfield. The open
  glow is on the ally, never on the button. Throw it away: legal only outside the free-blocking zone.
- **Desktop:** WASD / arrows move (Shift runs); J K L ; Space throw to ◆ ● ▲ ■ ★; T throws it away; a mouse
  click on an ally throws to him. **Game controller:** left stick moves, A B X Y RB throw, LB throws it away.

## Scoring (owner: OK)
- **Hang time:** time he survives with the ball, counted only up to the hot clock (3 s) per ball, so holding
  the ball is never the way to score.
- **Score = hang time x multiplier;** the multiplier grows with each completion in a row and resets on an
  incompletion or throwaway. An interception (throw into a tight shadow) ends the run.

## Progression (from proven brain-training games)
- Ramp inside a run: every few snaps the level goes up: faster rush, shorter windows, more allies (3 to 5), two
  and three hitters, unblocked hitters, more from his blind (off-hand) side, signalled by the screen-edge flicker.
- Multiple-object tracking (NeuroTracker-style), later levels: allies and decoys look alike; his allies flash at
  the snap and he has to keep track of them.
- Adaptive start: the next run starts a couple of levels below where the last one ended.
- Short runs, a best-run ghost, the daily streak.
- Run report: hits by direction, reaction time to each pressure, windows caught and missed by side (blind side
  vs throwing side), right moves by pressure type, ball time.
- Players look like players from the start (owner), a bit more realistic than now.

## Rules
- Pocket physics, moves and the free-blocking zone come from reviewed content; the game's own numbers (windows,
  levels, scoring) are new content (content/instinct/rules.yaml, reviewed: false) for the owner to sign off.
- Deterministic: same seed + same inputs give the same run (golden replays). Invariant: every snap can be
  survived and completed with the right move and a throw to the first window.

## Later
Swipe-to-throw option, Field Mode version, panned audio, decoy tracking levels, the read engine's real routes.
