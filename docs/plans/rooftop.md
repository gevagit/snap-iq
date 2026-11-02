# Plan: Rooftop Run (replaces Pocket Instinct)

Owner decisions, 2026-10-31. Pocket Instinct is scrapped ("it looked dull, no hook") for a game with nothing to do
with football that trains the same instincts: keep your eyes up for the one who comes open while you get away from
what is coming at you. The routine game and the Football Bible are unchanged.

## The game
A courier on neon rooftops at night, seen through his own eyes (first person, owner's pick). Every **play** is a pass
rush made of drones (owner, 2026-11-01: "truly mimic the way pass rush operates"). He tosses the package to a friend
whose lantern lights; a catch sends him leaping to the next roof. **A hit or a snatched package ends the run.**

### Before the snap (a GO button every play)
- He sees **the box** (owner, 2026-11-02: the line and the second level, no DBs, up to 8): a front picked by level,
  4-3, 3-3 and 4-2 at first, then 3-4, 4-4, 5-3, 5-2, all on the line (6-0, 7-0), 6-1 and 6-2. His **5 protectors**
  stand in front of him, each with a **strength 0-99**, and his **RB**. Protectors get weaker as the levels rise.
- **Line drones** nearly always rush; at higher levels an inside one sometimes drops out after the snap.
- **Second-level drones** are the **threats (?)**: each may blitz or drop out, and at higher levels some blitz a beat
  late (a delayed blitz). A threat that creeps in (lower, closer) is a tell: honest about 90% of the time at first,
  about 65% at the top. The rush is anywhere from 3 to 8: early pressure from the line, later pressure from depth,
  and whoever is left over when the box outnumbers his 5 + RB comes free, each at its own moment.
- He may keep the **RB in** on one threat (tap it, or its number), or leave him out to run a short route.

### After the snap
- **Protectors hold their drones with beams** for up to 4 s (a 99), less the weaker they are; a spare protector helps
  (double team). A beam **flickers** just before it breaks: the moment to feel it.
- **Inside drones** that break free lock on (red) and dart straight: step off the red line.
- **Edge drones** that break free **go around him**, out wide and in behind him to where he stood, chasing him sideways
  and back: only **stepping up** beats them (they overrun behind him), then sideways if something else is coming. Off
  screen, he feels them: a red glow builds on that edge and their buzz is in that ear.
- **A drone nobody blocks** (more rushers than protectors, or a **protection bust**: a lineman whiffs) comes at him from
  the snap, about a second away: throw hot, or escape.
- **The RB:** kept in on a threat that blitzes, he picks it up (a weaker block); kept in on one that drops out, he runs
  his route after all; left out, he is a receiver on his own roof (a short throw). Wrong call: the blitzer comes free.
- Each play shows its box and how many of it rushed ("4-3 box · 5 rushing").

### Lanterns
- Each friend runs a route by how far out he is: **quick** (lights at about 1.8-2.4 s), **intermediate** (2.4-3.2 s),
  **deep** (3.2-4.2 s). Each rusher beyond four lights them a quarter second sooner and makes more of them come open
  (fewer left in coverage); fewer rushers, later and fewer.
- A lantern stays lit **1 to 3 s** (owner). **Every lit lantern that goes out while he still holds the package costs
  points**; once the ball is out, the rest do not count (owner).

### Checked on every play (npm run validate, tests)
- Whatever the RB call (in on any threat, or out), a person who reacts 0.25 s after a drone breaks free or locks on and
  taps a short combo gets through and gets the ball out.
- Edges really need the step up: a sideways-only player gets caught (test); a stronger protector holds longer, never
  past 4 s; blitzers show the tell far more often than droppers; more rushers light lanterns sooner.

- **Feet:** one step per key press or joystick flick (a sharp flick is a longer step); righty or lefty layout.
- **Last-second dodge:** getting clear of a drone that was on him only in the last 0.3 s scores a bonus.
- **Guide:** for his first five runs, prompts say what to do now (step up, off its line, toss to 2...).
- **Hands:** numbered buttons, friends numbered left to right (the RB too when he runs a route); before the snap the
  same buttons pick the threat for the RB.

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
