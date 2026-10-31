# Game Brief: SNAP IQ

**One-sentence pitch:** An iPad game that trains Sahar, an 11-year-old left-handed youth QB, in his pre-snap routine, defensive reads and pocket instincts, with every rep seen through his own eyes.

## Core loop
- **Routine game:** the call → his routine on the play clock → snap → two stops (at the snap, then 1 s later) → Breakdown.
- **Pocket Instinct:** snap → dodge the rush → throw to the open receiver → the next snap comes faster.

## Player goal & fail state — what "working" looks like
- Routine game: right answers and XP per rep.
- Pocket Instinct: the run ends on a hit or an interception; best hang time wins.

## MVP — what must exist to be the game
- The routine game and Pocket Instinct (both built).
- Signed-off football content.
- Breakdowns.
- Progress saved on the device.

## Out of scope — not building this
- Live AI or network calls during play; speech recognition.
- A 3D engine or bought models (owner, 2026-10-31: stay in 2D).
- Multiplayer.
- Real NFL teams, players or logos.

## Build order
1. PRD §16 phases: the playable slice (now) → backend → remaining drills.

---
**Who it's for / what they feel:** Sahar, at the line and in the pocket under the lights, feeling like a real QB.

**Art & audio direction:** Madden-real broadcast look from the QB's eye height: a night game under stadium lights, 2D canvas (`docs/STYLE.md`).

**Reference game:** Madden NFL. Keep its broadcast-real players, stadium atmosphere and score panel; drop its camera behind the play, game modes and licensing.
