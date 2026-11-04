# Plan: the pre-snap routine, v2 (owner, 2026-11-04)

Purpose: instill a solid pre-snap operation. One rep = one play from **our playbook** (the owner's PDF) against a
defensive look built to attack that formation. He runs the whole operation in **under 40 seconds**, snaps, and gets
a **scorecard**. The owner can **edit every right answer** in the web app.

## The rep
0. **Down & distance** (owner, 2026-11-04: step 1 of every routine, and it decides the right reads). The call card
   shows the down, distance and field position. He answers the **yardage** (short 1-2 / medium 3-6 / long 7+, as
   in the glossary) and whether it is a **must-convert down** (3rd or 4th). On a must-convert down his first read is
   the first route in the play's order that gets past the line to gain; otherwise the play's own order. The owner
   can set the reads for any play and situation in the editor.
1. **Huddle: the call.** The call card shows our play as the coach sends it (play name, formation, protection).
   He taps it to break the huddle; the 40 s clock starts.
2. **Everyone set.** Offense aligned right on 70% of reps; on the rest one player is out of place (off the line,
   covered, wrong split, wrong side, back in the wrong spot). He taps "All set" or taps the player.
3. **Safeties.** For each safety: **depth** (deep / middle / low), **position** (over the hash, middle of the field,
   over #2, outside), **stance** (square, eyes on QB / turned, eyes on a receiver / creeping).
4. **Corners.** For each corner: **depth** (press / off ~5 / off 7+), **leverage** (inside / head-up / outside),
   **stance** (square, eyes on QB / turned in on the receiver).
5. **Box.** He taps who is what: **down linemen**, **edges**, **linebackers**, and marks **possible blitzers**.
6. **Protection.** Slide direction (left / right / none), the back's job (block left / block right / free release /
   check release), and whether to adjust (who he's responsible for if they bring one more: hot or sight adjust).
**Run plays** (owner, 2026-11-04) run the full routine without reads and footwork, and add a **run check**: "Is this
   look good for this run?" Yes / Can to pass (no pass play named yet). Starting rule for the key, to confirm: can
   to pass when the box has more defenders than the play has blockers plus one.
7. **Reads.** Taps his progression: **1, 2, checkdown**. Only on plays that have a progression (the play says so).
   **Look off the safety** (owner, 2026-11-04): when one of his reads is deep (go, post, corner, seam, wheel), he
   taps the safety who guards that throw and the side he looks to first to move him (to confirm: the other side).
8. **Footwork.** His drop for this play: 1-step / 3-step / 5-step / gun catch-and-throw / boot / sprint-out
   (the menu comes from the playbook).
9. **Key defender.** Taps the defender whose move tells him where to go with the ball.
10. **Run lane.** If the snap is bad or nobody is open: which lane (A gap left/right, B gap, C gap / edge, or
    scramble to his throwing-hand side).
11. **Last scan.** On some reps the defense **changes its look** while he works (a corner goes from off to cloud,
    2 high rotates to 1 high, a linebacker creeps up to blitz, a safety walks down). Before the snap he answers
    "Same look" or taps what changed, and fixes any answer it affects (the key, the protection, the reads).

Then the **snap**: the play runs for about a second and freezes so he sees the truth (unchanged from today).

## Clock and scoring
- One 40 s clock for the whole operation (the owner tunes it in content). The steps are always in this order;
  he can go back to a step before the snap.
- **Scorecard** at the end of each rep: every step right / wrong / missed, the right answer next to his, his time,
  and the step he is slowest on. A workout summary after the last rep.

## Our plays, their defenses
- **Offense:** every play in the owner's PDF becomes a play in `content/playbook/` (formation, each player's
  alignment and route, protection, read progression, footwork, run lanes). The game shuffles them.
- **Defensive backs** (owner): usually 5-7 yards off; on about every 4th or 5th play at least one presses; on 5% of
  plays everyone presses in man. Fronts include 4-3, 3-4, 4-4, 5-3, 6-2, 4-2-5 and 3-3 stack.
- **Defense:** for each formation, several **looks** built to attack it (e.g. vs. trips: cover 3 with the safety
  rolled to trips, a trips check with the backside corner on an island, a nickel pressure from the field). Each
  look sets every defender's alignment, depth, leverage and stance, what it may change to in the last scan, and
  what it does at the snap.
- Football content: everything starts `reviewed: false` and appears in drills only with the playtest setting until
  the owner signs it off.

## Answer editor (parent area, in the web app)
- Pick a play and a look: the field from above with the full answer key, step by step.
- Change any answer by tapping (a defender, a choice, the order of the reads). Mark a look "reviewed".
- Edits save **in this browser** (no account yet) and take effect at once on this device (owner, 2026-11-04: edit
  in the web app). **Export** gives a file to send to Claude, who commits it so every device and every future build
  gets it (and the football checks run on it).
- The owner fills in the reads, footwork and key for the plays the PDF has no notes on (14, 15, 37, 38, 40-46) in
  the editor.

## Order of work
1. Playbook content from the PDF + the looks per formation, for review.
2. Answer keys for every step (computed from the play and the look; the editor overrides them).
3. The rep UI (his-eyes view, step track, 40 s clock), the last-scan shift, the scorecard.
4. The answer editor and export.

## Built (first playable, 2026-11-04)
- Start Workout runs this routine: 6 of our plays, each against a look for its formation, in playtest until the
  owner signs the playbook off. Every step is graded; the scorecard shows his answer next to the right one.
- Steps as built: down & distance (yardage, must-convert), the call card, everyone set, safeties (depth, where),
  corners (press/off, leverage), box (down linemen, the edges, linebackers, who may blitz), protection (can we block
  them all), the run check (runs), reads (or the side, on a pick-a-side play), the look-off (deep reads), footwork,
  key defender, run lane, last scan (same look, or what changed: the defense moves while he watches).
- Not yet: stance questions (the his-eyes players don't show a stance difference yet, so it isn't asked: P3), the
  post-snap read after the freeze, and the classic workout's Breakdown for these plays.
- The answer editor: Parent settings, Answer keys. Edits stay on the device; Export gives the file to commit.
