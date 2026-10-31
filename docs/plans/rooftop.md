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
| Rusher | Hunter drone (cyan eye while it hunts) |
| The moment to move | The drone **locks on** (eye turns red) and flies straight: cut sideways then, not before |
| Edge, push, collapse, free rusher | Patterns: swoop (from a side), dive (head-on), pincer (both sides), blindside (two from his off-hand side), double, swarm, early (a lantern lights before the wave gets there). Every drone launches in front of him, inside his view, and blinks there for a second first (owner, 2026-10-31: no drone out of nowhere) |
| Open receiver | A friend whose lantern lights |
| Interception | A toss while the watcher is still on him: snatched, the run ends |
| Incompletion | A toss before the lantern is fully lit: dropped, the streak starts over |
| Hot clock | Hold the package past 5 s and more drones come |

- **Feet (taps, owner 2026-10-31):** he moves one step per tap, never by holding: on the iPad a quick swipe anywhere
  on the right half of the screen (only the direction counts, never where the thumb lands, so he never looks at it);
  on a computer one press of W A S D or the arrows; on a controller the d-pad or a flick of the stick. Tapping fast
  goes further. Drones lead him while they hunt, so moving early does not work: wait for the lock-on (ring turns red),
  then step aside. The lock-on comes 0.85 s before impact at level 1 and never later than 0.55 s; every round is
  checked to be beatable by one tap 0.25 s after the lock-on.
- **Always in view (owner 2026-10-31):** drones launch within 28 degrees of straight ahead. A drone that can still get
  him (hovering, hunting, or locked on with its line on him) stays inside his view: checked on every round for the
  right play and by a random-tapping test; in the last quarter second of a locked-on drone's run his head turns
  toward it if it nears the edge.
- **Guide:** for his first five runs, prompts say what to do now (drone coming, step sideways, toss to ◆), and the
  lit friend's button glows gold.
- **Eyes:** 3-5 friends across his view; lanterns light anywhere, often on his blind (off-hand) side as levels go up.
- **Hands (his throwing thumb):** fixed buttons, one per friend, each with the shape over that friend (◆ ● ▲ ■ ★),
  always in the same place. On a computer: W A S D move (Shift sprints), Y U I O P toss left to right across the
  view, Space starts, click a friend. A game controller works (left stick, X Y A B RB).

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
