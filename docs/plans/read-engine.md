# Plan: the read engine (owner playtest feedback, 2026-10-26)

Status: agreed direction, not built. Start here next session. Builds on PR #6 (two stops after the snap, his own
reads) once it is merged.

## What is wrong today (owner, after 4 test plays)
1. **The "correct" answer is often wrong.** It is a geometry cut-off (first of his reads with 2.5 yd of room when
   the ball arrives), not the read. In one play H got open on screen, but the answer was someone else.
2. **The defense covers the concept perfectly every time.** Zone and man defenders are coded to pick up the right
   receiver at the right moment, so the key defender never has to choose and there is nothing to read.
   Owner's example: Z comeback and H post on the right. The key (the boundary DB over Z) has to choose between
   carrying H's post or sitting on Z's comeback, and the other one comes open. A slot corner who plays it right can
   take the conflict away; a safety who was not looked off can jump the post.
3. **The safety ignores his eyes**, so the look-off question does nothing.
4. **The ball question shows only his reads** (up to 3). It must show **every** eligible receiver running a route,
   plus roll out / keep it and run / throw it away. His reads stay marked 1-2-3.
5. **The run side is always his escape lane** (his throwing hand). It must come from the defense: the possible run
   side is where the defense is in man and its defenders have turned to run with receivers who are not open (no
   one is spying or looking at him).
6. **One answer is too strict.** There can be more than one correct answer, but always one **best choice**:
   - best choice: ✓, full points;
   - admissible (correct but not best): its own symbol (not ✓, not ✗) and part of the points; the Breakdown says
     what the best choice was and why;
   - wrong: ✗.

## The fix
1. **Several outcomes per play (4-5 "pan-outs").** For each concept against each coverage, content lists the
   choices the key defender can legally make, and where it matters the safety and the slot/apex defender
   (carry the vertical or sit on the short route; jump the post or stay deep; help or not). The seed picks one
   combination, so the same call plays out differently and some reps are covered (roll out, run or throw it
   away are then the answer).
2. **The answer comes from the read rule in /content**, e.g. "key: boundary DB; carries the post → comeback;
   sits on the comeback → post; safety drives on the post → comeback". Each outcome lists:
   - its best choice;
   - its admissible choices;
   - a one-line why, in glossary words.
   Separation stays only as a validation check: a best or admissible receiver that is not actually open fails
   `npm run validate`, so the play is never shown.
3. **His eyes move the safety.** Looked off: the middle safety drifts toward where he looked first. Not looked
   off: the safety can jump the first read.
4. **Run side and roll-out from the defense** (item 5 above): which side is man, which defenders have turned their
   backs, free rushers, room in front. Not from his throwing hand alone.
5. **Every receiver on the ball question** (item 4), with best / admissible / wrong grading (item 6).

## How the owner flags answers
- **"Flag this answer" in the Breakdown.** He picks what he thinks the best choice is and adds a note. The flag
  keeps the play ID (seed + rep), which is shown on screen. "Copy my flags" puts them all on the clipboard to paste
  to Claude. Each flag becomes a unit test (seed → expected best choice), so a fixed mistake cannot come back.
- **Read Lab page** (like the Play Lab): pick a concept and a coverage and see every outcome top-down with its
  best and admissible answers. He marks each one right or wrong, with the coach if needed. Only reviewed outcomes
  reach drills (review gate).

## First slice
Two or three concepts (including one with a comeback/post combination) against Cover 2 and Cover 3, every outcome
written and reviewed in the Read Lab, before widening.
