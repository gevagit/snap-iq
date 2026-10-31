# Plan: Rooftop Run (replaces Pocket Instinct)

Owner decisions, 2026-10-31. Pocket Instinct is scrapped ("it looked dull, no hook") for a game with nothing to do
with football that trains the same instincts: keep your eyes up for the one who comes open while you get away from
what is coming at you. The routine game and the Football Bible are unchanged.

## The game
A courier on neon rooftops at night, seen through his own eyes (first person, owner's pick). Each **round** a wave of
hunter drones comes for him; friends on the rooftops around him each have a watcher drone on them. When a watcher
drifts off its friend, the friend's **lantern lights** (gold). He tosses the package to a lit friend; a catch sends him
running and leaping to the next roof, a little faster each time. **A hit or a snatched package ends the run.**

| Pocket idea | Rooftop Run |
|---|---|
| Rusher | A drone. A **darting** drone locks on (eye and ring turn red) and flies a straight line, drawn red on the roof: get off the line. A **diving** drone comes in high, locks on his spot, follows him sideways and dives onto it, with a red ring on the roof: step up under it or drop back (sideways can't shake it, like an edge keeping him in the pocket) |
| Rush concepts | Waves, named after the rush they copy (the glossary term once signed off, a plain name until then): head-on, edge rush (speed rush), dive, free drone (free rusher: throw hot), push up the middle (bull rush), four-drone rush, blitz, crossfire (stunt), pocket collapse, everybody comes (all-out blitz). Drones aim at him, at the lane one step beside him (an edge taking it away), across (a stunt), or at the spot in front of or behind him |
| What a wave asks | Checked on every round: `any` dodge; `up_or_back` (a sideways-only player fails); `combo` (a one-direction player fails: up then around, back then around) |
| Open receiver | A friend whose lantern lights; friends are numbered 1, 2, 3... left to right |
| Interception | A toss while the watcher is still on him: snatched, the run ends |
| Incompletion | A toss before the lantern is fully lit: dropped, the streak starts over |
| Hot clock | Hold the package past 5 s and more drones come |

- **Feet (owner's son, 2026-10-31):** one step per press of an arrow key (holding does nothing more); on the iPad a
  one-finger joystick that appears where the finger lands on the right half of the screen: each flick is a step, a
  sharp flick a longer, faster one. Controller: d-pad or a flick of the stick. Drones lead him while they hunt, so
  moving early does not work. The lock-on comes 0.85 s before impact at level 1 and never later than 0.55 s.
- **The right play** looks ahead when a drone locks on (after a person's 0.25 s reaction): it tries combos of up to
  three taps on a copy of the round and keeps the shortest that gets him through. Every round must be beatable that
  way, every wave must ask for what it says, and standing still must get him hit.
- **Always in view:** drones launch within 28 degrees of straight ahead; a drone that can still get him stays in view
  (checked on every round and by a random-tapping test); his head turns toward a locked-on one at the edge.
- **Last-second dodge:** a drone that was on him when it locked on, dodged in the last 0.3 s: a bonus, bigger the
  later he got clear ("LAST SECOND!" / "CLOSE CALL").
- **Guide:** for his first five runs each wave's hint shows with its name, prompts say what to do now, and the lit
  friend's number button glows gold.
- **Hands (his throwing thumb):** numbered buttons 1-5 side by side; on a computer the number keys. A game controller
  works (X Y A B RB toss the 1st to 5th from the left).

## Hooks (owner: all four)
- **Near miss:** a drone that passes close without hitting scores points (times the streak).
- **Streak lights the city:** each catch in a row raises the multiplier, lights more windows and neon, and adds a
  layer to the music. A drop dims it again.
- **Rooftop jumps:** after each catch he runs and leaps the gap to the next roof.
- **Ghost and unlocks:** a bar shows him ahead of or behind his best run at the same moment; his best score unlocks
  jacket and trail colours (all drawn in code), picked in the locker on the home screen.

## Scoring
Catch: 100 + 40 per second left on the hot clock, times the streak (1 + 0.25 per catch in a row, up to ×4).
Near miss: 25 times the streak. All numbers in `content/rooftop/rules.yaml`, for the owner to tune by playing.

## Run report
Score and best; deliveries and level; near misses; drones dodged and how fast he cut after a lock-on; lanterns caught
on his blind side vs his throwing side, with how fast he spotted them; what ended the run, with one tip; unlocks.

## Rules
- Not football: no glossary terms, no NFHS rules; the settings sit outside the Football Bible batches.
- Deterministic: same seed + same inputs give the same run (golden replay test). Seeded RNG only.
- Invariant (`npm run validate`, tests): every round at every level can be completed with the right play (stand, cut
  at the lock-on, toss to the first lit lantern), and standing still gets him hit (except early rounds).
- His blind side is his off-hand side (from his profile's throwing hand), never hard-coded left/right.
- 2D canvas, cached city layers and glow sprites; 2020 iPad budget (16 ms a frame, DPR ≤ 2).

## Later
Panned drone audio by side, more patterns (decoy drones, moving friends), daily challenge seed, a Breakdown replay
of the last round from above.
