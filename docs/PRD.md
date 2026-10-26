# SNAP IQ — Product Requirements Document

| | |
|---|---|
| **Version** | 1.5 (Look B; puppet players; natural lens; his read sets his eyes) |
| **Date** | 2026-10-25 |
| **Owner / admin** | gevagit (parent) |
| **Player** | Sahar, #4, 11, left-handed QB (plays SYFL youth; trains to NFHS high-school rules) |
| **Current phase** | Phase 2: Playable slice. Shell Game playable first (owner, 2026-10-26: "use what we have and create the actual game"); Bubble next. Bible batches 1 and 2 signed off by the owner with defaults |

---

## How to use this document (for Claude Code)

- This PRD is the build spec. Build in the phase order in §16. A phase starts only when the previous phase's acceptance criteria pass and the owner signs off.
- **All football content comes from `/content`** (the machine-readable Football Bible). Never invent football terms, alignments, rules or explanations in code. If something is missing, add it to `/content`, mark it `reviewed: false`, and tell the owner it needs coach review.
- **The game is deterministic.** No live AI calls anywhere in the app. Randomness only from the seeded RNG.
- When this PRD and coach-reviewed content disagree on football, the content wins; update the PRD.
- Terms like "Cover 3 Sky" or "9-technique" are defined in `/content/glossary.yaml` once Phase 1 exists; until then, Appendix A lists the seed terms.

---

## 1. Product summary

SNAP IQ is an iPad web game (installable PWA, playable offline) that trains a quarterback's football cognition:

1. collecting pre-snap information **automatically**, in a fixed routine;
2. inferring the right decisions from it (reads, protections, hots, run/RPO checks, escape lanes);
3. staying aware after the snap (rotations, pressure, pocket movement);
4. doing all of it **faster** (domain-specific processing speed and real-time decision making).

It's a set of short, connected drills run as one daily workout, plus a full-game mode, wrapped in a reward system built to make him want to come back every day.

## 2. Objectives

### 2.1 Training objectives (Sahar's needs, most critical first)
1. **Pocket movement and rollout:** when to climb, slide, or escape; which direction; designed rollouts (boot, sprint-out); throw vs. run vs. throw away.
2. **Pre-snap routine:** a memorized, automatic scan and his own adjustments (footwork, escape lane, progression, protection and blitz pickup, hot).
3. **Defensive reads:** the pre-snap picture and how it changes post-snap (rotations, disguises), including run/RPO conflict reads.

Cross-cutting: domain-specific processing speed, real-time decisions under time pressure, and **transfer to the field**.

### 2.2 Success measures
- **Combine results** (hold-out scenarios he has never practiced, §12): accuracy and decision time, Week 1 → Week 6 → Week 12. Numeric targets are set after the Week 1 baseline.
- **Engagement:** ≥ 5 active days per week; daily workout completed on ≥ 80% of active days.
- **Field (optional log):** the parent can record practice/game observations in the dashboard (pre-snap ID, handling pressure, sacks taken).

### 2.3 Non-goals for v1
Multi-profile UI (the data model is ready, §14.7), App Store build, live AI of any kind, VR, camera-based movement tracking, commercial-grade art, online multiplayer, monetization, a custom domain.

## 3. Users and roles

| Role | Access |
|---|---|
| **Player** (Sahar) | Plays everything outside the Parent area. |
| **Parent / admin** | Parent area behind a PIN: dashboard, settings, cadence builder, Scenario Lab, flagged reps. |
| **Football reviewer** | The owner reviews the Football Bible first. A specific coach is brought in (doc access only) when the owner wants more input. |
| **Future players** | Supported by the data model (profiles keyed by user); no UI in v1. |

## 4. Design principles (non-negotiable)

| # | Principle | What it means in practice |
|---|---|---|
| P1 | **Football accuracy first** | Every alignment, rule, tell and explanation comes from coach-reviewed content, uses a controlled vocabulary, and passes automated football invariants (§6.11). |
| P2 | **Deterministic** | Same scenario + seed ⇒ same play, same answer key, same feedback. No live AI. |
| P3 | **Never remove information** | Higher tiers get harder through less time, real disguises, more simultaneous elements and fewer highlight aids. Never by hiding, shrinking below legibility, or blurring cues (§7.6). |
| P4 | **Representative from day one** | Real football visuals and real decisions at every tier, simplified at Youth. Abstract shapes only in the 2-minute controls tutorial. |
| P5 | **Real response modes** | Taps and swipes that map to real decisions; "throw to the right receiver" is the answer, not naming a coverage. Saying calls out loud is prompted as a habit but never recognized or scored (no speech recognition). |
| P6 | **Consistent before variable** | Tells are honest at Youth, so cue→response mappings become automatic; disguises arrive gradually from JV. |
| P7 | **Learn → automate** | Labeled → faded → recall. Checklist → chunks → one call. Name it → act on it. |
| P8 | **Explain everything** | Every rep has a full Breakdown on demand, right or wrong (§9). |
| P9 | **Reward decision quality, not volume** | XP scales with accuracy and speed at his level; easy or repeated reps pay little (§11). |
| P10 | **Healthy engagement without a hard cap** | No daily limit. Fatigue detection, a spacing bonus, diminishing free-play XP and streak freezes (§10.7, §11). |

## 5. Platform and constraints

- **Primary device:** Sahar's iPad, an older model (about 2020, A12/A14 chip class, likely 10.2-inch) on the latest iPadOS, in landscape, Safari, installed to the Home Screen as a PWA. All performance and layout targets are set for this device class; wireframes use 1080 × 810. Also runs in desktop browsers for testing.
- **Hosting:** Netlify free subdomain (e.g. `snap-iq.netlify.app`). A custom domain can be added later with no code change.
- **Inputs:** touch (two thumbs, lefty layout), optional Bluetooth gamepad. Audio output through headphones (available) for directional pressure audio. **No speech recognition.**
- **Offline-first:** all gameplay runs on-device; progress syncs to the database when online.
- **Performance targets:**
  - 60 fps minimum during play (use 120 Hz where available).
  - Input-to-visual latency under 50 ms.
  - Flash timings accurate to ±1 frame.
  - Cold load under 3 s on Wi-Fi; instant afterwards (service worker).
- **Timing measurement:** decision times use `performance.now()` and event timestamps, measured from stimulus onset (the look appearing, the snap, the pressure event) to input.

---

## 6. Football foundation

The full content is the Phase 1 deliverable (Football Bible). This section fixes its structure and the rules the engine must honour.

### 6.1 Rule set and field
- **Rules: NFHS (high school), California CIF.** Never assume NFL or NCAA rules.
- **Phase 1 verifies the NFHS rules that touch QB decisions** and records them in `content/rules/nfhs.yaml`:
  - forward pass and intentional grounding (throwaway legality);
  - the free-blocking zone;
  - ineligible receivers downfield (critical for RPOs);
  - legal formation (7 on the line, at most 4 backs, numbering).
- **Field:** 53⅓ yards wide. NFHS hash marks are 53'4" (17.78 yd) from each sideline, so the hashes divide the field into thirds. From a hash, the boundary (short side) is about 17.8 yd to the sideline and the field (wide side) about 35.6 yd.

### 6.2 Coordinates
- **Scenario coordinates are relative to the ball:**
  - `x` = yards to the offense's right (+) or left (−) of the ball;
  - `y` = yards downfield from the line of scrimmage (+ = defense side, − = backfield).
- **Absolute field position** (sidelines, hashes, numbers) is derived from the ball's hash and yard line.
- **Landmarks** the engine must compute:
  - hashes, numbers, sidelines;
  - the tackle box and the box (tackle-to-tackle or tight end, about 6 yd deep);
  - the apex between #2 and the end man on the line;
  - receiver numbering (#1, #2, #3 from outside in) on each side;
  - field side and boundary side.

### 6.3 Scenario variables
Every rep is generated from these; all appear in the rep log.

| Group | Variables |
|---|---|
| Situation | Down, distance, yard line / field zone (backed up, open field, plus territory, field-goal range, red zone, goal line), **ball hash (left / middle / right)**, quarter, clock and whether it's running, score, timeouts for both teams (§6.12) |
| Offense | Personnel (10/11/12/20/21), formation and strength, play call (concept and side), protection, footwork, motion/shift, snap count |
| Defense | Personnel (base/nickel/dime), front and strength call, coverage, pre-snap shell, post-snap rotation, pressure, stunts, disguise level, per-defender alignment and tells (§6.6) |
| Engine | Seed, tier, level, jitter amounts, coordinator profile (opponent tendencies) |

**How the hash matters** (encoded as rules, explained in Breakdowns):
- Strength and rotation are often set to the field.
- Boundary corner technique and safety width depend on it.
- It changes how much room there is to escape: a boundary rollout has little room.
- It changes throw distance: field-side outs are longer and riskier.

### 6.4 Defensive menu by tier

| Tier | Fronts | Coverages & rotations | Pressures & stunts | Disguise |
|---|---|---|---|---|
| **Youth** | 4-3 / 4-2-5 even, 3-4 Okie, 3-3 stack | Cover 0, 1, 2, 3; no rotation | Single LB A/B-gap blitz, corner/nickel edge blitz | None. All tells honest. |
| **JV** | + Over/Under strength variations | + Cover 4 (Quarters), Cover 1 Robber, 2-Man; rotations: Sky, Buzz | + 5-man fire zone (3 under, 3 deep), double A-gap mug, T-E and E-T twists | Light, with honest tells most of the time |
| **Varsity** | + bear/tite looks | + Cover 6 (quarter-quarter-half), Cloud, two-high → one-high spins, one-high → two-high rotation | + simulated pressures (4 rush with a dropped DL), Cover 0 overloads | Pre-snap movement, late shuffles, fake blitz tells at realistic rates |
| **Elite** | Everything | + pattern-match quarters and match/bracket rules defined in the Bible | + creepers, late-timed pressures | Late, high-quality disguise |

### 6.5 Offensive menu (offense-agnostic)
Sahar may change teams, so the game teaches a broad, standard set. A team-specific system can be layered on later via aliases.

- **Formations:** Gun (2x2, 3x1/trips, bunch, empty 3x2), Pistol, under center (I, offset, singleback).
- **Personnel:** 10, 11, 12, 20, 21.
- **Pass concepts:**
  - Quick: Stick, Slant-Flat, Spacing, Snag.
  - Dropback: Smash, Flood/Sail, Curl-Flat, Mesh, Four Verts, Y-Cross, Dagger, Levels.
  - Play-action and movement: Boot/Naked, Sprint-out (both directions).
- **Protections:** 5-man slide (L/R), 6-man half-slide with RB check, big-on-big, 7-man max, play-action and boot protections.
- **Run / RPO:** inside zone with RPO tags (bubble, glance, stick), zone read, power read.
- **Footwork:**
  - Under center: 3/5/7-step.
  - Gun: catch-and-throw, 1-step, 3-step, 5-step; gun terminology is standardized in the Bible.
  - Play-action fakes, boot and sprint-out footwork.

### 6.6 Defender "tells" model
Every defender carries an alignment and a body-language state that the renderer shows and the drills test.

```yaml
# per defender, pre-snap
alignment:
  technique: 5            # DL/LB technique number where relevant (0-9, incl. 2i, 4i)
  shade: outside          # inside | head-up | outside, relative to the man he's over
  depth: 7.0              # yards, 0.5 precision
  width: { landmark: hash, relation: inside, yards: 1.5 }  # hash | numbers | apex | box | #1/#2/#3
  leverage: outside       # DBs vs. their receiver
stance:
  points: 2               # 2 | 3 | 4
  weight: back            # forward | neutral | back
  feet: square            # square | staggered | turned-in
orientation:
  facing: qb              # qb | receiver | gap
  eyes: backfield         # qb | backfield | receiver
movement: creeping        # static | creeping | rotating | bouncing | timing-snap | shuffling
truth:
  assignment: curl-flat   # what he actually does post-snap
  honest: true            # false = this is a disguise tell
```

**Catalog** (full list with meanings and reliability in the Bible):
- **Corners:**
  - leverage (inside, head-up, outside);
  - depth (press, about 5 yd, 7+ yd);
  - square with eyes on the QB (zone) vs. turned in with eyes on the receiver (man);
  - backpedal vs. turn-and-bail at the snap.
- **Safeties:**
  - depth to 0.5 yd;
  - width (on, inside or outside the hash; over #2);
  - posture (high and square, flat-footed, creeping, rolling);
  - asymmetry (one safety lower = rotation tell).
- **Linebackers / nickel:**
  - depth;
  - stacked, apexed, walked out, walked up, mugged in a gap;
  - **sitting** (weight back, eyes in the backfield) vs. **blitzing** (creeping, weight forward, timing the snap, angled at a gap) vs. **covering space** (depth, eyes on a receiver, hips open).
- **D-line:**
  - technique and shade;
  - 2-, 3- or 4-point stance;
  - weight forward vs. back;
  - wide splits (stunt hint);
  - a lineman standing up (possible drop).
- **Whole defense:**
  - shell and box count;
  - strength call;
  - reaction to motion (travel = man; bump = zone);
  - late shuffling.

**Reliability:** Youth tells are always honest. From JV up, each disguise tell is honest at a rate defined per tier and per coordinator profile.

### 6.7 Pocket and escape rules
Defined in `content/pocket/rules.yaml`. Logic is written in terms of the **throwing-hand side** and **off-hand side**, never hard-coded left/right.

- **Edge speed rush** (one or both edges) → **climb** (step up). The rushers run past.
- **Interior win or push** from one side → **slide** away (short shuffle steps, base kept), or escape outside if the lane closes.
- **Unblocked rusher** → hot or sight adjust **before** he arrives; this is the pre-snap Hot beat paying off.
- **Collapse from multiple points** → **escape**, preferring the throwing-hand side. Escaping to the off-hand side requires a reset (flip hips) before throwing, which costs time and is modeled.
- **Room:** the hash and sideline limit escape room. Into the boundary is tight; into the field is roomy.
- **Scramble:**
  - Throw if a receiver uncovers (eyes stay downfield).
  - Run when man-coverage defenders have turned their backs and a lane is open.
  - Throw away only when legal under the verified NFHS rule (§6.1).
- **Designed movement:** boot and sprint-out reads, including the boot read vs. the unblocked end, are defined in the Bible.
- **Ball security:** two hands on the ball while moving. It's a coaching cue in Breakdowns; it isn't simulated.

### 6.8 Run / RPO reads
- **Numbers:** box defenders vs. available blockers → run, pass, or RPO check.
- **Conflict defender:** identify the defender responsible for both run and pass (apex/overhang or LB). He fits the run → throw; he widens → give.
- **Zone read:** read the unblocked end. Crash → keep; stay or squeeze → give (exact rule per Bible).
- All RPOs must respect the NFHS ineligible-downfield rule (§6.1).

### 6.9 Left-handed QB specifics
- **Blind side = right side.** Pressure from the right that's outside his view is cued by a right-edge flicker plus right-panned audio, as in real life.
- **Natural rollout = left** (throwing-hand side). Rolling right requires flipping the hips.
- All footwork is defined by throwing-hand side and mirrored for a lefty; diagrams render left-handed.

### 6.10 Pre-snap routine (cadence)
The routine is taught as **4 chunks**, the unit of memorization. KNOW happens in the huddle; the other three at the line.

| Chunk | Beat | Question it answers |
|---|---|---|
| **KNOW** | 1. Situation | Down and distance, field zone, clock, score, timeouts: what does it change on this play (§6.12)? |
| **SEE** | 2. Shell | How many high safeties (2 / 1 / 0)? Depth and width vs. hashes? |
| | 3. Front & Mike | What front, which way is strength, who is the Mike (declared)? |
| | 4. Box | Box defenders vs. our blockers → run / pass / RPO check? |
| **THREATS** | 5. Pressure | Who could come (tells)? |
| | 6. Protection | Slide direction, RB responsibility, adjustment |
| | 7. Hot | If they bring more than we block, where does the ball go? |
| **PLAN** | 8. Read | Key defender and progression for this coverage |
| | 9. Feet | My drop/footwork for this play |
| | 10. Escape | If the pocket breaks, where do I go (protection weak point + hash/room + throwing hand)? |

**Default cadences** (in `content/cadences/defaults.yaml`):
- **Youth (7 beats):** Situation, Shell, Front & Mike, Box, Pressure, Read, Escape.
- **JV / Varsity (10 beats):** all ten.
- **Elite (10 beats + optional actions):** Motion check and Hard count.

**Custom cadence builder** (Parent area):
- Add and remove beats from the beat library, which also includes Defensive personnel, Motion check, Hard count and Check-with-me.
- Reorder beats and set the chunk grouping.
- Rename beats to team terminology (aliases).
- Choose an answer type per beat.
- Save multiple cadences per profile and choose the active one.

**Learn mode** teaches each beat before it is ever tested (§8.7).

### 6.11 Football invariants (automated, run on every content change and every generated scenario)
- 11 vs. 11. Legal offensive formation under NFHS (7 on the line, at most 4 backs, numbering rules). No defender in the neutral zone.
- Technique labels match actual offsets from the blockers. Shade labels match positions.
- The shell label matches safety count, depth and width.
- Coverage assignments are complete: man coverage covers every eligible receiver unless a defender is designated rusher, robber or spy. Deep-zone count matches the coverage, e.g. Cover 3 = 3 deep; fire zone = 3 deep, 3 under, 5 rush.
- Rushers vs. blockers: if rushers > blockers, the scenario has a hot or sight answer.
- Rotation: if the post-snap shell differs from the pre-snap shell, the scenario carries a rotation tag, and the tells and explanations reference it.
- Every decision point has ≥ 1 "best" answer. Every answer has an explanation chain built only from glossary terms.
- Hash-consistent geometry: no player out of bounds; field/boundary labels correct.
- **Reachability (no teleporting):** every post-snap position lies on that player's path (route, landmark path or rush lane), at a distance his speed profile allows by that time. Receivers' positions match their route waypoints; the back's position matches his protection rule (§6.13).
- Projected legibility (§7.6) passes in his-eyes view (and in top-down for Learn and Breakdown).
- Every scenario carries a complete situation (§6.3), and every answer key that the situation affects cites the situation rule it used.

### 6.12 Situational awareness
Situation is part of every rep's answer key, not decoration. Every drill shows it (situation strip, call card or scoreboard), the routine starts with it (KNOW, §6.10), and every Breakdown opens with it.

**How situation changes the right answer.** Rules and exact thresholds live in `content/situations/` and are reviewed like all football content. Starting set:

| Situation | What changes for the QB |
|---|---|
| 3rd or 4th and long | Prefer throws past the sticks; a checkdown short of them is acceptable only when everything past them is covered |
| 3rd or 4th and short | Take the sure completion that converts |
| 4th down | A throwaway ends the drive, so give a receiver a chance instead |
| Two-minute drill, trailing | Sideline throws and getting out of bounds stop the clock; throw it away rather than take a sack; know the timeouts left |
| Protecting a lead late | Ball security first; avoid risky throws; completions inbounds and runs keep the clock moving |
| Backed up (own 1–10) | Never take a sack in the end zone (safety); get rid of the ball |
| Field-goal range | Don't take a sack that pushes the kick out of range; throw it away instead |
| Red zone and goal line | Compressed field: tighter windows, more man coverage; throw it away rather than force it |
| End of half | Clock and timeouts decide between a shot, a sideline throw and a spike |

- **Defenses follow situation too:** coordinator profiles (§11.6) weight coverages and pressures by down, distance and field zone (e.g. more pressure on 3rd and long, more man coverage in the red zone).
- **NFHS clock rules** apply to every clock decision (for example, high school has no two-minute warning); Phase 1 verifies them in `content/rules/nfhs.yaml`.

### 6.13 Movement, routes and timing
**No post-snap position is placed by hand.** Every player's spot at time *t* after the snap comes from four things: his **alignment**, his **path**, his **speed profile**, and *t*. Wireframes, drills, Breakdowns and tests all use the same model, so the screen never shows a player where he couldn't be.

- **Routes** are waypoint lists measured from the receiver's alignment, defined once in `content/offense/routes.yaml`. Receivers run the coordinates exactly (no added "realism"). Examples, to be confirmed in Phase 1:
  - stick: 6-yard stem, settle and turn out about 1 yard;
  - flat/arrow: angle to 2 yards deep, then flatten toward the sideline;
  - hitch: 5 yards, come back half a yard;
  - clear/go: vertical, holding his split;
  - hot slant: 2 yards, then break inside at about 45°.
- **Defenders** move to the landmark of their assignment, defined in `content/defense/`:
  - deep third, deep middle, curl/flat, hook;
  - man trail, from press or off;
  - blitz lane.
  
  Rotations are timed to the snap (e.g. Sky: field safety spins down to curl/flat, boundary safety runs to the deep middle). Zone droppers react at the snap; off-man defenders read for a beat (about 0.2–0.3 s) before they drive.
- **Speed profiles** (`content/tuning/speeds.yaml`): top speed, acceleration and reaction delay per position group, set for the high-school level. Starting values, for owner and coach review:
  - receivers about 8 yd/s; tight ends 7;
  - DBs 5–7 (bail vs. rotate); LBs 6;
  - DL rush 6; blitzers 7.5.
  
  At these values a receiver is about 3 yards into his route at 0.8 s, 4 at 1.0 s, 5.5 at 1.2 s and 9.5 at 1.75 s.
- **Linemen:**
  - OL take the pass sets of the protection call (slide side vs. man side).
  - DL rush the lane of their technique: 1-tech A gap, 3-tech B gap or bull rush into the guard, 5-tech C gap, 9-tech wide edge.
- **QB depth** follows the drop: in the gun he catches at about 0.35 s at 5 yards, takes a 3-step drop to about 6.5 yards by 1.05 s, then hitches up.
- **The back** follows his protection job:
  - **Pre-snap:** beside the QB in the gun. That's outside the forward view, so he gets an edge marker.
  - **After the snap:** he steps to his check point in his gap, about 2 yards behind the line and off to the side, never straight in front.
  - Then he either check-releases (to the flat) or meets a blitzer. Meeting a blitzer in a gap is the only time he's in front of the QB.
- **Freeze and decision times** come from the real play, not from a fixed number. For example, Stick vs. Cover 3:
  - the rotation is readable at about 1.0–1.2 s;
  - the stick settles at about 1.7 s;
  - vs. Cover 0 the hot slant shows between the linemen at about 1.2 s.

---

## 7. Experience and navigation

### 7.1 App map
```
Locker Room (home)
├── START WORKOUT ─► Tell Spotter → Cadence → Shell Game → Bubble → Game Day → Session Wrap
├── Train      (free play: any mode, any unlocked level)
├── Learn      (concept cards, glossary, cadence lessons)
├── Season     (12-week Season Pass, weekly bosses, combines)
├── Locker     (cosmetics: gear, celebrations, ball trails, themes)
└── Parent 🔒  (dashboard, settings, cadence builder, Scenario Lab, flagged reps)
```

### 7.2 Locker Room
Shows:
- name, rank and XP bar;
- streak (with freezes);
- unopened film packs;
- today's workout card with one **START** button;
- the weekly boss card;
- the Season Pass track;
- free-play tiles with personal bests.

### 7.3 Daily workout
- **Built by the planner** (§10.8), deterministically, from his weak spots and due reviews. Default length about 15 min:
  - Tell Spotter 2 min;
  - Cadence 3 min;
  - Shell Game 3 min;
  - Bubble 4 min;
  - Game Day 4 min.
- **Flow:** drills chain automatically. Each drill runs about 8–12 reps, then shows a 5-second drill recap. Session Wrap comes at the end.
- **Pause** exits to the Locker Room; the workout can be resumed the same day.

### 7.4 Controls
- **Lefty layout (default):**
  - Left thumb = throw buttons. Four shapes ◆ ● ▲ ■ map to receivers; the receivers carry the same shapes on the field at Youth/JV.
  - Right thumb = movement pad. Drag = slide/climb, flick = escape, double-tap = tuck and run.
  - A throw-away button sits in the left cluster.
- **Mirror option** for right-thumb throwing.
- **Gamepad:** the Gamepad API maps face buttons to receivers and the left stick to movement.
- **Say-it habit:** pre-snap screens prompt him to say his calls out loud ("Two-high, 52's the Mike"). Nothing listens; only taps are graded.
- **Throw buttons never light up** to signal the open receiver; his eyes must stay on the field.

### 7.5 Views
**Every drill is seen from Sahar's own eyes, at every tier.** This covers Tell Spotter, Cadence, Shell Game, Bubble, Game Day and Field Mode. There is no behind-the-QB or sky camera in any drill.

| View | What it is | Used in |
|---|---|---|
| **His eyes** (QB-eye) | Eye level from where he stands (shotgun, under center, or in the pocket as he moves). A natural lens of about 100° with true perspective, so straight lines stay straight. The view turns with his head (below). Stances show as front-view poses. | Every drill, every tier |
| **Top-down** | Overhead, with exact alignments and the tell glyphs. | Learn cards and Breakdown replays only (the Breakdown can switch to his eyes) |

**Rules for his-eyes view:**
- **His own players are see-through outlines,** so a lineman or receiver never hides a defender.
- **Edge markers:** anyone outside the view gets a marker at the screen edge (e.g. "Z ›").
- **Look left / look right in pre-snap drills** (Tell Spotter, Cadence), to practice the scan as a head turn.
- **His read sets his eyes in live drills.** At the snap the view turns (in about 0.25 s, like a head turn) to the read defender he chose in the pre-snap routine (the Read beat; in drills without a Cadence step, the read on the call card). He can swipe on the field to look elsewhere. A wrong read turns his eyes the wrong way, and the Breakdown shows the cost.
- **He always knows where he is looking:**
  - the controls tutorial teaches "your read sets your eyes" before any live drill;
  - in the Read beat, the defender he picks gets an eye mark: "Eyes go here after the snap";
  - at the snap an "Eyes: #6" chip names where the view is turning;
  - a look strip at the top of the screen always shows the view window, where his eyes point and where his read is;
  - the Breakdown shows where he looked next to where he should have looked.
- **Pressure from outside the view** (his blind side) is cued by an edge marker, an edge flicker and directional audio.
- **The ball in his hands** shows at the bottom of the screen during live plays.

### 7.6 Readability rules (enforces P3)
- Every defender is on screen, or marked at the edge and one look away, during the pre-snap look.
- Minimum projected player height is **≥ 28 CSS px** in every view. The natural lens uses true perspective for the field; each player is drawn at his own scale, so nobody stretches at the screen edges. If a scenario still fails, the view adjusts (field of view, eye height) automatically. The check runs in automated tests (§6.11). A 140° panoramic lens was tried in Phase 0 and dropped because it curves straight lines.
- **Sightline check:** from eye level, players line up behind each other, as on a real field (e.g. a 3-technique can hide most of a hook defender). At the decision moment the **key read defender and the intended target** must each be at least 60% visible. If not, the generator nudges timing within its jitter range or drops that instance (counted in tests). Other players may be partly hidden.
- **Highlights by tier:**
  - Youth: exaggerated poses plus highlight glows on tells.
  - JV: exaggerated poses, no glows.
  - Varsity/Elite: realistic poses, no glows, still rendered at legible size.
- **Colour plus shape, never colour alone:** offense blue, defense orange, Sahar gold.

---

## 8. Modes

Every mode shares the rep loop:

> **setup → look → (snap → action) → result flash → Breakdown on demand → next rep**

Every mode logs each rep fully (§14.7) and feeds mastery, spaced repetition and XP.

### 8.1 Tell Spotter (warm-up, ~2 min)
- **Purpose:** automatic perception of alignment and stance tells.
- **Rep:**
  1. A frozen pre-snap look from his eyes (look left / right to scan).
  2. He has N seconds to tap defenders and label their tells from a quick radial menu, e.g. "CB: outside, 7 yd, eyes in → zone"; "S: inside hash, creeping".
- **Scoring:** correct tells found × accuracy × speed. Missed key tells are shown in the Breakdown.
- **Progression:**
  - The time window shrinks.
  - More defenders carry tells.
  - Disguise tells appear (JV+), and he must also mark "honest?" at Varsity+.

### 8.2 Cadence (pre-snap routine)
- **Purpose:** memorize and automate the routine and its adjustments.
- **Screen:**
  - the field with offense and defense aligned;
  - a call card (formation, play, protection, down and distance, hash);
  - a pre-snap clock;
  - the beat track (4 chunks: Know, See, Threats, Plan).
- **Rep:** he executes each beat in order before the clock expires.
  - Answer types: select defenders, number, direction swipe, multiple choice.
  - Correct beats light up and build a combo; out-of-order or skipped beats break it.
  - Beats derive their answers from the scenario (e.g. Hot is computed from rushers vs. blockers).
- **Stages (per beat, per mastery):**
  1. Labeled beats with Learn hints.
  2. Icons only.
  3. Blank track: pure recall.
  4. **Chunk entry:** all beats of a chunk answered in one rapid tap sequence with no prompts in between, while he says the chunk out loud (habit, not scored).
  5. **Elite:** the whole routine as one rapid entry within the clock.
- **Actions at higher tiers:**
  - Motion check: send motion, watch for travel vs. bump.
  - Hard count: watch for defenders who flinch or show.
  - Check-with-me: pick the better of two plays for the look.
- **Progression:** the clock shrinks (defaults in content: Youth 20 s → JV 12 s → Varsity 8 s → Elite 5 s; tunable). Late shifts force re-checks.

### 8.3 Shell Game (pre/post-snap reads)
- **Purpose:** read the picture and its post-snap change, then decide.
- **Rep:**
  1. The look shows for the flash window (defaults: Youth 2.0 s → JV 1.2 s → Varsity 0.7 s → Elite 0.3 s).
  2. Snap, then everyone moves at real speed (§6.13) until the decision point (default about 1.0–1.4 s, long enough for a rotation to show).
  3. Freeze.
- **Questions by stage:**
  - Youth/JV learning stage, up to 3 quick answers:
    1. pre-snap shell;
    2. post-snap coverage (and the rotation name from Varsity: Sky, Buzz, Cloud, spin, roll);
    3. where the ball goes (tap the window or receiver).
  - JV+ automated stage: **the throw is the answer.** Labels only appear in the Breakdown.
- **Variants:**
  - **Picture Flash:** the whole look is named in one answer in about 1 s, building pattern recognition.
  - **Conflict reads:** RPO and zone-read decisions (§6.8).
  - **Motion check:** man/zone ID from the reaction to motion.
- **Motion trails:** on at Youth/JV; off from Varsity (he answers from memory).

### 8.4 Bubble (pocket movement) — #1 priority
- **Purpose:** pocket mobility while staying on his reads. He feels pressure, moves the right amount in the right direction, keeps his eyes downfield (or finds the checkdown), and delivers on time.
- **Screen:** from his eyes in the pocket at every tier. It must feel 3D; it doesn't need to be true 3D.
  - Rushers come straight at him and grow as they close; his blockers' backs fill the foreground as see-through outlines.
  - The pocket edge is a line on the ground at a set distance that bends toward him where pressure is breaking in.
  - The actual coverage develops downfield, so he reads and moves at the same time.
  - Blind-side pressure (the right, for a lefty) also comes as a right-edge flicker plus right-panned audio.
- **Rep types** (each a scenario family in `content/pocket/`):

  | Rep type | Correct response |
  |---|---|
  | Clean pocket | Stand in, step up, throw on time. Leaving a clean pocket ("happy feet") costs points |
  | Edge speed rush | Climb |
  | Bull rush / interior push | Slide away, or escape if the lane closes |
  | Stunt / twist | Reset and slide to the gap that opens |
  | Blitz picked up | Trust it and keep reading |
  | Blitz not picked up | Hot, sight adjust or checkdown before the free rusher arrives |
  | All-out blitz (Cover 0) | Hot throw now; no deep help means man coverage everywhere |
  | Full collapse | Escape (throwing-hand side preferred, hash-aware), then throw, run or throw away |
  | Coverage sack | Protection holds but everyone is covered: checkdown or throw it away inside the time limit |

- **Protection modes** (one per drill; the planner picks by default, and Sahar or the parent can override):

  | Mode | Pocket holds on | Pressure arrives |
  |---|---|---|
  | Good | about 70% of reps | late (2.8 s or later) |
  | Bad | about 30% of reps | early (1.6–2.4 s) |
  | Unpredictable | anywhere from 30% to 70%, changing within the drill, with no streak patterns | anywhere from 1.4 to 3.2 s, including pockets that hold and then break |

  These are starting defaults in `content/tuning`, to be tuned in playtests.
- **Rep loop:** snap → pressure (or a clean pocket) unfolds over 1.4–4 s → he moves (right thumb) and throws, runs or throws away (left thumb).
- **Rules:** §6.7 for movement. Off-hand escapes require a "set" before throwing, which costs time. Situation rules apply (§6.12), e.g. no sack in field-goal range, throw it away in the two-minute drill.
- **Designed movement drills:** boot and sprint-out, both directions; hash-aware room.
- **Scoring:** movement class and timing; staying in a clean pocket; sack avoided; the read (the throw goes to the receiver the coverage leaves open at that moment, checkdown included); throw on time; situational correctness.
- **Breakdown:** his path vs. the ideal path (ghost line), the moment the pressure became real, decision time, and the rule that applied.
- **Progression:**
  - Youth: one pressure source at a time, slower rush, lane hints.
  - JV: stunts, bull vs. speed, blitzes picked up and not picked up.
  - Varsity: all-out blitzes and simulated pressures, no hints; Unpredictable becomes the default mode.
  - Elite: blind-side pressure cued only by flicker plus audio, with no on-screen highlight.

### 8.5 Game Day (integration)
- **Purpose:** the whole sequence, live, in game situations.
- **Screen:**
  - his-eyes view;
  - scoreboard: opponent (the weekly boss), score, quarter, clock, down and distance, ball spot and hash;
  - a scouting tip.
- **Rep = one play in a drive:**
  1. Call card (Varsity+: choose from a 3-play call sheet).
  2. Condensed Cadence with no prompts (rapid tap entry).
  3. Snap, live read, pocket, throw/run.

  Outcomes move the chains; sacks, interceptions and penalties cost.
- **Drives have goals** (e.g. "down 17–20, 1:48 left, score").
- **Audibles (Varsity+):** check-with-me between two plays based on the look.
- **Weekly bosses:** each opponent is a coordinator profile (tendency weights by situation and hash) with a pre-game scouting report. See §11.6.

### 8.6 Field Mode (physical transfer)
- **Purpose:** turn decisions into body movement ("muscle memory").
- **Setup:** iPad on a stand at eye level about 2–3 m away; the defense is shown large; headphones or speaker.
- **Rep:**
  1. He gets in his stance and says his pre-snap calls out loud (habit, not scored).
  2. **The game calls the cadence and snaps the ball** ("set… hut").
  3. The screen and audio cue the rotation and pressure ("Edge right!", "A-gap!"), panned to the side it comes from.
  4. He physically drops, climbs, slides or escapes.
  5. He taps large decision buttons within a time window: movement first (climb, slide, escape), then target (◆ ● ▲ ■ or throw away).
- **Grading:** the decision taps and their timing from the cue. Camera-based movement checking is a later phase.
- **Safety:** prompt for clear space; no ball required.

### 8.7 Learn mode
- **One card per concept** (glossary-driven):
  - definition;
  - an animated engine diagram;
  - how to spot it (tells);
  - what it means for him (decisions);
  - a 3-question check;
  - narration.
- **Learn before test:** a concept can't appear in drills until its card is completed.
- **Cadence lessons:** each beat taught as a short animated card.

### 8.8 Controls tutorial
About 2 minutes, the only place abstract shapes are allowed. Teaches the throw buttons, movement pad and Breakdown, plus one lesson on his eyes: **your read sets your eyes.** He picks a read, watches the view turn to it at the snap, then swipes to look the other way. He must complete it before his first live drill, and it comes back as a one-line reminder if his reads keep pointing the wrong way.

---

## 9. Breakdown and Film Room

**Available after every rep, right or wrong.**
- **Short version** (about 10 s) by default; "Full breakdown" on request.
- Opens automatically on a miss at Youth and JV.
- Viewing it never costs points or rep time.

**Contents:**
1. **Annotated replay** (slow motion; switch between top-down and his eyes):
   - the situation comes first, then tells light up one at a time in cadence order (KNOW → SEE → THREATS → PLAN);
   - rotation paths drawn;
   - the read defender ringed;
   - pressure paths drawn;
   - his pocket path vs. the ideal path;
   - **where he looked** (his read and any swipes) vs. where he should have looked;
   - the open window highlighted.
2. **His answer vs. the best answer,** with timing (where time was lost).
3. **The why,** spoken (on-device text-to-speech) and captioned. It opens with what the situation changes (§6.12), then always runs as a **cue → meaning → decision** chain.
4. **All acceptable answers,** ranked best / acceptable / wrong, each with its reason.
5. **Links** to the Learn cards involved.
6. **"Flag this rep"** (§13.3).

**Explanations are assembled from coach-reviewed snippets** keyed in `/content/explanations`, never generated live.

**Guess detection:**
- **Confidence prompt:** a periodic "Sure / Guess" tap at Youth/JV. A correct guess opens the Breakdown and re-queues the look.
- **Shaky flag:** correct but unusually slow vs. his rolling median, or inconsistent with his recent answers on the same look family. It is re-queued.

**Film Room:**
- At the end of each drill, missed, guessed and shaky reps are queued for review.
- Reviewing earns a small one-time XP bonus per rep.
- All reviewed and missed looks feed spaced repetition (§10.3).

**Feedback fading:** automatic feedback (result flash detail, auto-opened Breakdowns) reduces with mastery. The Breakdown itself stays available on demand forever.

---

## 10. Learning engine (all deterministic)

### 10.1 Tiers and levels
- Tiers: Youth → JV → Varsity → Elite. Each tier has levels (e.g. 1–10) per mode.
- A tier sets the content menu (§6.4), aids and default timings. Levels tune difficulty within it.

### 10.2 Adaptive difficulty
- **Per skill, a weighted up/down staircase** on that skill's difficulty parameters: flash time, clock, pressure timing, number of simultaneous tells, disguise rate.
- **Step sizes:** after a correct rep, harder by 1 step; after a miss, easier by 4 steps. This converges to about **80% success**.
- **Steps are defined in content** so they can be tuned without code changes.

### 10.3 Spaced repetition
- **Unit:** a "look family" key, e.g. `cover-3-sky|trips|hash-left|4-man`.
- **Leitner system:** 5 boxes, intervals same-session, 1 d, 3 d, 7 d, 14 d.
  - Miss → box 1.
  - Correct and confident → promote.
  - Guess or shaky → stay.
- **Due looks** are injected into the workout (§10.8).

### 10.4 Interleaving
- **Blocked practice** only while a new concept is first acquired (its first ~10 reps after the Learn card).
- **After that, interleaved:** mixed coverages, pressures, hashes and situations in random (seeded) order.

### 10.5 Mastery and promotion
- **Skill mastered at a tier:** rolling 50-rep accuracy ≥ 85% **and** median decision time ≤ the tier target.
- **Promotion** to the next tier requires a **Tryout:** 20 reps of unseen scenarios at ≥ 80%.

### 10.6 Variation (avoid "learning the engine")
- **Seeded jitter:**
  - alignments ±0.5 yd;
  - timing ±0.1 s;
  - receiver splits within legal ranges.
- **Multiple coordinator profiles** with different tendencies.
- **Hold-out scenario families** reserved for Combines and Tryouts only.

### 10.7 Fatigue detection
- **Trigger:** rolling 10-rep accuracy drops ≥ 15 points below the session's opening baseline, **or** median decision time rises ≥ 20%.
- **Response:** suggest a break, show the trend, and taper XP. The prompt is dismissible; there is no forced stop.

### 10.8 Daily workout planner
Deterministic rules:
1. **Due spaced-repetition looks** first.
2. **Weakest skills next:** lowest mastery relative to priority. Pocket movement carries the highest priority weight, per §2.1.
3. **One new concept** (Learn card + acquisition reps) when the previous concept is stable.
4. **Game Day** at the end.
5. **Bubble protection mode** from his pocket stats: Bad when he bails too late or takes sacks, Good when he leaves clean pockets too early, Unpredictable once both are stable. The parent can override.

The planner writes a one-line, templated focus sentence ("Climb vs. edge rush + Cover 3 Sky") using his stats.

---

## 11. Engagement and rewards

Built for daily return and competitiveness while rewarding **quality**:

| Mechanic | Rule |
|---|---|
| **Rep XP** | `10 × grade (best 1.0 / acceptable 0.6 / wrong 0) × speed factor (0.5–1.5 vs. tier target) × tier multiplier` |
| **Combos** | Consecutive best answers: ×1.1 per step, capped at ×2.0. "Perfect rep" effects (hit-stop, slow-mo, stinger sound). |
| **Workout bonus** | Completing the daily workout = full XP plus a film pack |
| **Free play after the workout** | XP ×0.5, dropping to ×0.25 after 30 min. Reps below his current level pay ×0.2. |
| **Spacing bonus** | A second session ≥ 3 h after the first: ×1.25 XP |
| **Ranks** | Rookie → Starter → Captain → Field General (I–III each), then Legend prestige levels |
| **Streaks** | One completed workout per day. Earn 1 freeze per 7-day streak (max 2 stored). Milestone packs at 7/14/30/60 days. |
| **Film packs** | Earned only, never purchased. Cosmetic only (visors, decals, cleats, gloves, ball trails, celebrations, field and HUD themes). Rarity Common 70% / Rare 22% / Epic 7% / Legendary 1%; guaranteed Epic within 10 packs. Duplicates → shards (10 shards = pick any Rare). |
| **Personal bests** | Per drill metric; celebrated in Session Wrap |
| **Ghosts** | Race his own best runs (timing bars). Family ghosts arrive with multi-profile support. |
| **Daily Look** | One hard look per day; first-try success gives a bonus pack |
| **Season Pass** | 12-week track. Advances by XP. Nodes give packs, cosmetics and titles. Combines in Weeks 1, 6 and 12. |
| **Weekly boss** | Unlocks after 3 workouts that week; retry until beaten; a win gives an Epic pack |
| **Notifications (optional, Phase 6)** | Web push for Home Screen apps: a streak reminder at a parent-set time |

**Session Wrap:**
- XP tally (with breakdown);
- streak +1;
- pack opening;
- personal bests;
- a templated debrief (what he nailed, what to fix, tomorrow's focus) filled from stats;
- the Film Room queue.

### 11.6 Opponent profiles (Season 1, fictional names)
1. Week 1: Fundamentals (honest Cover 1/3).
2. Week 2: Two-High U.
3. Week 3: Blitz Brothers.
4. Week 4: The Spinners (late rotations).
5. Week 5: Sim City (simulated pressures).
6. Week 6: Combine week (plus a mixed opponent).
7. Week 7: The Disguisers.
8. Week 8: Man Island (Cover 1/0).
9. Week 9: Quarters Crew.
10. Week 10: Fire Zone.
11. Week 11: Playoffs (mixed).
12. Week 12: Championship (best-of-3, all tendencies).

Profiles live in `content/opponents/season-1.yaml`; content is gated to his tier.

---

## 12. Measurement: Combines and the Parent dashboard

**Combine:**
- A fixed 10–12 min battery in Weeks 1, 6 and 12.
- Uses **hold-out scenarios** never seen in training.
- **Measures:**
  - tell spotting (count, accuracy);
  - cadence recall (completeness, time);
  - pre-snap ID accuracy and time;
  - post-snap read accuracy and time;
  - pocket decision accuracy and timing;
  - conflict read accuracy.
- **Results** are shown as deltas vs. baseline.

**Parent dashboard (PIN):**
- time played per day and week;
- sessions and streak;
- mastery by skill and tier;
- decision-time trends;
- Combine results;
- spaced-repetition box distribution;
- fatigue events;
- flagged reps;
- optional field-observation log.

**Settings:**
- active cadence and the cadence builder;
- Bubble protection mode (planner, Good, Bad, Unpredictable);
- say-it prompts on/off;
- controls layout;
- fatigue sensitivity;
- notification time;
- PIN.

---

## 13. Content authoring and rule maintenance

### 13.1 Source of truth
- `/content`: YAML files, compiled to JSON at build time with a content version hash. Every rep stores the content version.
- **Football Bible review doc:** a shareable Claude Doc generated from `/content` (human-readable, with top-down diagrams). The owner reviews it first and shares it with the coach when more input is needed. Comments are resolved by editing `/content`, then the doc is regenerated.

```
content/
  glossary.yaml            # controlled vocabulary + definitions + aliases
  rules/nfhs.yaml          # verified NFHS rules relevant to QB decisions
  offense/                 # personnel, formations, concepts, routes (waypoints), protections, run-rpo, footwork
  defense/                 # fronts, coverages, rotations, pressures, stunts, tells
  pocket/                  # pocket rules + Bubble rep-type families
  situations/              # situation rules (§6.12)
  cadences/defaults.yaml
  explanations/            # cue/meaning/decision snippets keyed by rule id
  scenarios/               # templates + parameter ranges
  opponents/season-1.yaml
  combines/                # hold-out batteries (never used in training)
  tuning/                  # speed profiles, staircases, timings, XP constants
```

Each entry carries `reviewed: true|false`, `reviewer`, `reviewed_at`. Unreviewed content is allowed only in the Scenario Lab, never in drills.

### 13.2 Editing workflow (minimal custom building)
- The owner asks Claude Code, in plain English, e.g. "Field safety should only rotate down when the ball is on the hash."
- **Claude Code then:**
  1. edits `/content` (or the matching rule function);
  2. adds or updates a test;
  3. runs validation;
  4. opens a PR.
- **Netlify** produces a deploy preview to check on the iPad. Merge = live.
- Changes that alter football meaning are marked `reviewed: false` until the coach approves.

### 13.3 Flags
- **"Flag this rep"** (player or parent) offers a reason (looks wrong / explanation unclear / too hard / other) plus an optional note.
- The flag is stored with the full rep record (scenario, seed, content version).
- **To fix:**
  1. `npm run flags:pull`, using a Supabase service key stored as a Claude Code environment secret, writes open flags to `content/flags/`.
  2. "Fix the flagged reps" in a Claude Code session.
  3. The flag is marked resolved with the fixing commit.

### 13.4 Scenario Lab (Parent area)
- Browse templates; generate instances by seed.
- Step the timeline: pre-snap → snap → +0.1 s steps.
- Switch between his-eyes and top-down views.
- Inspect tells, assignments and the answer key; preview the Breakdown.
- Run validators.
- Open flagged reps; render unreviewed content.

---

## 14. Technical architecture

### 14.1 Stack
- **Language and build:** TypeScript (strict), Vite.
- **UI:** React for menus, HUD and overlays.
- **Field rendering:** a 2D WebGL renderer (PixiJS) that draws the scene through our own natural-lens projection (§7.5–7.6). It feels 3D without a 3D engine and stays light on the older iPad. The same renderer draws the top-down view for Learn and Breakdown.
  - True 3D (three.js / WebXR) only if a VR mode is built later.
- **Engine:** pure TypeScript with no rendering or DOM dependencies, fully unit-testable.
- **Libraries:** Zod (content schemas); Dexie / IndexedDB (offline store); Supabase JS (sync, auth); vite-plugin-pwa (service worker, manifest).
- **Tooling:** Vitest; Playwright (end-to-end smoke tests in the pre-installed Chromium); ESLint + Prettier.
- Use current stable versions.

### 14.2 Engine
- **Field model:** geometry, landmarks and numbering (§6.2).
- **Scenario generator:** template + parameters + seed → instance. Instances are validated by invariants (§6.11); invalid ones are discarded and counted in tests.
- **Seeded RNG** (e.g. sfc32). `Math.random` is banned in engine code.
- **Simulation:**
  - fixed timestep (1/120 s);
  - players follow assignment-derived paths with speed profiles (§6.13): routes from waypoints, defenders to their landmarks, linemen by pass set and rush lane, the back by protection rule;
  - every rendered frame satisfies the reachability invariant (§6.11);
  - pressure events are authored or generated from the pressure catalog, not physics;
  - the pocket is a polygon derived from OL positions, deformed by pressure points.
- **Grading:**
  - decision points with answer keys computed by rule functions from content parameters;
  - results are graded best / acceptable / wrong and carry explanation keys.
- **Replays:** same seed + inputs ⇒ identical timeline. Golden tests enforce this.

### 14.3 Rendering
- **Projection:** true perspective (about 100° wide) from his eye point, turned by his head direction (yaw); the horizon sits about a quarter of the way down the screen without tilting the view, so vertical lines stay vertical. Each player is projected at his root and drawn at that scale (no edge stretching). Players are sorted far to near; his own players are drawn see-through.
- **Players are 3D puppets drawn flat:** about 15 joints in 3D (hips, knees, feet, shoulders, elbows, hands, chest, head), projected with the same camera and drawn as simple shapes (helmet, pads, jersey with number, limbs). One rig gives every viewing angle, so a player can face him, run away or turn his hips with no sprite sheets. Poses (§15.2) are joint targets stored in `/content`; gait, arm swing and leaning come from the movement model's speed, driven by game time (no physics). The head is posed on its own, because eyes are a tell. Top-down glyphs for Learn and Breakdown.
- **Legibility check** (§7.6) computes projected sizes per scenario. It runs in tests and adjusts the view at runtime.
- **HUD:** an HTML/React overlay (call card, beat track, clocks, buttons) above the canvas.

### 14.4 Audio
- **Web Audio:** SFX with stereo panning for directional pressure (headphones); audio is unlocked on first tap (iPadOS requirement).
- **Narration:** `speechSynthesis` (on-device voices), with captions always on.
- **No speech recognition.** Safari's speech recognition isn't reliable enough for timed, graded play with a child's voice and football terms. All input is touch or gamepad.

### 14.5 Performance on the older iPad
- Keep the scene light: instanced sprites, no real-time shadows, capped device pixel ratio (≤ 2), texture atlases for poses.
- Frame-time budget 16 ms; a performance test scene runs on the device at every playtest checkpoint.

### 14.6 Hosting, CI and environments
- **Netlify:**
  - builds from GitHub (`npm run build`, publishes `dist`);
  - SPA redirect;
  - service-worker headers;
  - deploy previews for every PR; production from `main`.
- **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. The anon key is public by design; Row Level Security protects data.
- **GitHub Actions:** lint, typecheck, unit tests, content validation and build on every PR.
- **Setup:** `docs/SETUP.md` (Phase 3) walks the owner through creating the Supabase project, running migrations and setting Netlify variables. **Secrets are never pasted into chat or committed.**

### 14.7 Data model (Supabase Postgres; Row Level Security on every table: `profile.user_id = auth.uid()`)
| Table | Key fields |
|---|---|
| `profiles` | id, user_id, display_name, handedness, jersey, created_at |
| `progress` | profile_id, xp_total, rank, streak, freezes, season_week, boss_results, settings (incl. hashed PIN) |
| `sessions` | id, profile_id, type (workout/free/combine/field/tryout), started_at, ended_at |
| `reps` | id, session_id, profile_id, mode, scenario_id, seed, tier, level, content_version, answers, grades, timings, confidence, shaky, xp, created_at |
| `mastery` | profile_id, skill_key, tier, staircase_level, rolling_stats |
| `srs_cards` | profile_id, look_key, box, due_at, history |
| `cadences` | id, profile_id, name, beats, chunks, aliases, is_active |
| `inventory` | profile_id, item_id, rarity, source, acquired_at |
| `combines` | id, profile_id, week, battery_id, results |
| `flags` | id, profile_id, rep_id, reason, note, status, resolution_commit, created_at, resolved_at |

- **v1:** one Supabase account (parent email and password) with **one hard-wired profile (Sahar).** The device stays signed in.
- **Sync:** Dexie mirrors the tables locally. Reps are append-only via an outbox queue; settings are last-write-wins.
- **Supabase free tier:** projects pause after a week of inactivity. Gameplay continues offline and syncs after a one-click unpause.

### 14.8 Privacy
- First name only; no ads, no third-party analytics, no live AI, no data sent anywhere except his own Supabase project.
- Before any commercial release: COPPA compliance (verifiable parental consent, data deletion) and a privacy policy.

### 14.9 Repository layout
```
docs/      PRD.md, SETUP.md, decisions/
content/   (see §13.1)
src/
  engine/    field, geometry, generator, sim, grading, rng, rules/
  content/   loaders, schemas
  learning/  staircase, srs, planner, fatigue, mastery
  rewards/   xp, packs, streaks, season
  render/    projection, scene, poses, glyphs, legibility
  audio/     sfx, tts
  input/     touch, gamepad
  modes/     tell-spotter, cadence, shell-game, bubble, game-day, field-mode, learn
  ui/        screens, hud, components
  data/      dexie, sync, supabase
  lab/       scenario lab
tests/     invariants, engine, golden replays, simulated players, e2e
supabase/  migrations/
tools/     content compiler, diagram renderer (SVG), bible doc generator, flags puller
```

---

## 15. Art, audio and accessibility

### 15.1 Visual direction
- **Look B, "coaching board"** (chosen from the Phase 0 style frame as the simplest): flat, high-contrast shapes on a muted field. Readability beats realism.
- **Field:** muted grey-green turf with light 5-yard mow stripes, white lines and NFHS hashes, yard numbers on the ground, a blue line of scrimmage and a dashed dark line to gain; a plain light horizon, no stadium or crowd.
- **Players:** defenders in white jerseys with orange outlines, orange helmets and numbers; his own players see-through in blue; Sahar gold where he appears (Learn, Breakdown). Soft contact shadows under every player and the ball.
- **Palette:** offense blue, defense orange, Sahar gold. Positive/open states use white or mint plus a shape.
- **Contrast:** text meets WCAG AA contrast.

### 15.2 Pose library (per position group, front view for his-eyes view)
- **DL:** 3-point weight forward / neutral / back; 4-point; 2-point standing.
- **LB / nickel:** sitting/read, creeping, walked-up, mugged (A-gap), bail.
- **CB:** press, off-zone (square, eyes on the QB), off-man (turned in, eyes on the WR), backpedal, turn-and-bail, squat.
- **S:** deep square, creeping/rolling, rotate-down, backpedal.
- **Exaggeration** is a per-tier parameter: exaggerated at Youth/JV, realistic at Varsity/Elite.

### 15.3 Juice
Hit-stop and slow-mo on perfect reps, particles, small screen shake, combo meter, stingers, pack-opening sequence. iPads have no haptics; gamepad rumble is optional.

### 15.4 Accessibility
Shapes plus colour, captions on all narration, adjustable text size in the HUD, 44 px minimum touch targets.

---

## 16. Build phases and acceptance criteria

Every phase ends with an **owner playtest checkpoint on the iPad** (via the Netlify deploy preview) before moving on.

### Phase 0: Wireframes
**Deliverables:** low-fi screens for every mode plus the shared Breakdown, on the design canvas (one screen per mode at its key moment, with notes).

**Acceptance:** owner sign-off on layout, controls and what each screen shows.

### Phase 1: Football Bible
**Deliverables:**
- `/content`: Youth and JV complete; Varsity and Elite outlined.
- Glossary with definitions and aliases.
- Verified NFHS rules sheet.
- Tells catalog with reliability; pocket rules; default cadences; explanation snippets for every Youth/JV rule.
- Route waypoint catalog, defender landmark paths and speed profiles (§6.13), with the reachability validator.
- Content schemas plus invariant validators and tests.
- An SVG top-down diagram renderer.
- The Football Bible review doc (Claude Doc) generated from content, with diagrams.

**Acceptance:**
- Validators pass on all content and on 1,000 generated scenarios per template.
- The owner's review is complete (coach consulted where the owner wants), all comments are resolved, and the owner signs off.

### Phase 2: Playable slice (feel first)
**Deliverables:**
- Engine core (field, generator, sim, grading, replays) and the his-eyes renderer.
- **Bubble** (Youth and JV pressure types) playable end to end on the iPad, with Breakdown.
- Progress saved on the device only; no backend yet.
- Netlify deploy to the free subdomain; installable to the Home Screen.

**Acceptance:**
- Runs smoothly on Sahar's iPad (performance test scene within budget).
- Owner and Sahar playtest; feel constants tuned from their notes.
- Golden replay tests are deterministic.

### Phase 3: Foundation
**Deliverables:**
- CI, Supabase migrations and Row Level Security, auth, offline store and sync.
- Top-down view, glyphs, placeholder poses and the legibility check.
- HUD framework, touch/gamepad input, the audio system.
- Locker Room shell and navigation, Learn mode, cadence builder, Scenario Lab, Breakdown framework, the flag flow, the controls tutorial.

**Acceptance:**
- Reps sync to Supabase; the app keeps working offline.
- The Lab renders any scenario in both views with the legibility check passing.

### Phase 4: Reading drills
**Deliverables:** Tell Spotter, Cadence (all stages), Shell Game (incl. Picture Flash, Conflict reads, Motion check), staircase, spaced repetition, interleaving, guess/shaky detection, Film Room. Full Breakdowns for these modes.

**Acceptance:**
- All Youth/JV scenario families are playable.
- Every rep has a correct Breakdown.
- Simulated-player tests show the staircase converging to 80% ± 5%.

### Phase 5: Pocket
**Deliverables:** Bubble completed (all 9 rep types, the 3 protection modes, designed movement, scramble decisions, all tiers) and Field Mode (game-called snap, tap decisions).

**Acceptance:**
- Every pocket rule in `content/pocket/rules.yaml` has playable scenarios with passing tests.
- Off-hand escape timing is modeled.
- Hash-aware escape room is modeled.

### Phase 6: Game Day and progression
**Deliverables:** Game Day (drives, call sheets, audibles, scouting), opponent profiles, the rewards system (§11), Season Pass, the planner, fatigue detection, Combines with hold-outs, Tryouts, Parent dashboard, Session Wrap, optional web push.

**Acceptance:**
- A full 12-week season is simulatable in tests.
- The daily workout is generated deterministically from stats.
- Combine hold-outs are provably excluded from training pools.

### Phase 7: Feel and expansion
**Deliverables:** tuning passes from playtest notes (timings, juice, difficulty constants in `/content/tuning`), final pose art, Varsity/Elite content completion with owner review (coach as needed).

**Acceptance:** owner sign-off after a 2-week playtest.

---

## 17. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Football content is subtly wrong | Phase 1 Bible, controlled vocabulary, invariants, owner review gate (coach as needed), flag flow, `reviewed` gating |
| Game feel is "off" (Claude can't play it) | Playable slice early (Phase 2); playtest checkpoint every phase; all feel constants in `/content/tuning` for fast iteration |
| Older iPad struggles with the 3D scene | Performance budget (§14.5), light rendering, device test scene at every checkpoint |
| Stances not readable | Pose library, per-tier exaggeration, natural lens with per-player scale, look left / right, automated legibility check, view auto-adjust |
| iPad Safari quirks (audio unlock, storage eviction, PWA limits) | Offline store + cloud sync, audio unlock on first tap, on-device testing each phase |
| Learns the engine instead of football | Jitter, coordinator profiles, hold-out Combines and Tryouts |
| Weak transfer to the field | Representative visuals, say-it-aloud habit, throw-as-answer, Field Mode, Combines |
| Fatigue / overuse with no cap | Fatigue detection, diminishing XP, spacing bonus, streak freezes, parent dashboard |
| Scope creep | Phase gates; new ideas go to `docs/decisions/backlog.md` |
| Supabase free-tier pause | Offline-first; unpause instructions in SETUP.md |

## 18. Open questions
1. Exact iPad model (Settings → General → About → Model Name), to confirm the performance target.
2. Avatar and Locker preferences beyond #4.
3. "SNAP IQ" is a working title; run a trademark check before any commercial release.

## 19. Decisions log
| Decision | Choice |
|---|---|
| Device | Older iPad (about 2020) on the latest iPadOS, landscape, PWA (web), offline-first |
| Football review | Owner first; a specific coach when the owner wants more input |
| Jersey | #4 |
| Speech recognition | None. Taps and swipes only; say-it-aloud is an unscored habit |
| Build order | Wireframes → Football Bible → playable slice (Shell Game first, on the content we have; then Bubble) → backend → remaining drills. Changed 2026-10-26 at the owner's request |
| Handedness | Left-handed; rules expressed by throwing-hand side |
| Rule set | NFHS (California CIF) |
| Offense | Offense-agnostic standard menu; team aliases later |
| Modes | Tell Spotter, Cadence, Shell Game, Bubble, Game Day, Field Mode, Learn |
| Cadence | 4 chunks (Know, See, Threats, Plan); defaults per tier; custom builder with aliases |
| Situational awareness | Shown in every drill and part of every answer key and Breakdown (§6.12) |
| Bubble | From his eyes, rushers coming at him; 9 rep types; protection modes Good / Bad / Unpredictable |
| Views | His eyes (natural lens, about 100°, true perspective) in every drill at every tier; top-down only in Learn and Breakdown |
| Eyes | Pre-snap scan by look left / right; at the snap the view turns to his chosen read; swipe to look elsewhere; always shown and taught (§7.5) |
| Movement | Every post-snap position computed from alignment + path + speed profile + time; routes as waypoints; no hand placement (§6.13) |
| Renderer | 2D WebGL (PixiJS) with a custom natural-lens projection; true 3D only for a future VR mode. The first slice draws with Canvas 2D (the approved style frame's renderer); move to PixiJS if the iPad performance test needs it |
| Look | B, coaching board: muted field, orange-outlined defenders, see-through blue offense (§15.1) |
| Players | 3D puppets of about 15 joints drawn as flat shapes; poses stored as content (§14.3) |
| Information policy | Difficulty never removes information |
| AI | No live AI. Claude used only for authoring and rule maintenance via Claude Code. |
| Explanations | Breakdown for every rep, assembled from reviewed snippets |
| Daily cap | None; fatigue detection, diminishing XP, spacing bonus |
| Users | One hard-wired profile now; data model multi-user ready |
| Hosting | Netlify free subdomain; no custom domain for now |
| Database / auth | Supabase (free tier) |
| Repo | `gevagit/snap-iq` (private); PRs with Netlify deploy previews |

---

## Appendix A: Glossary seed (definitions are written in Phase 1)
Shell, MOFO/MOFC (middle of field open/closed), two-high, one-high, Cover 0/1/2/3/4/6, Robber, 2-Man, Quarters, Sky, Buzz, Cloud, spin, roll, fire zone, simulated pressure, creeper, mug, apex, overhang, conflict defender, box, tackle box, free-blocking zone, technique (0–9, 2i, 4i), shade, leverage, press, off, bail, squat, backpedal, field, boundary, hash, numbers, strength, Mike / Will / Sam / nickel, slide, half-slide, big-on-big, max protect, hot, sight adjust, check-with-me, hard count, motion (travel vs. bump), climb, slide (pocket), escape, reset/flip hips, throwing-hand side, off-hand side, blind side, boot, naked, sprint-out, RPO, zone read, power read, #1/#2/#3 receiver numbering.

## Appendix B: Example scenario (illustrative schema; final values come from the Bible)

```yaml
id: stick-vs-2high-sky-field-01
tier: jv
situation: { down: 3, distance: 6, yard_line: own-42, hash: left, quarter: 4, clock: "1:48", clock_running: true, score: { us: 17, them: 20 }, timeouts: { us: 1, them: 2 } }
offense:
  personnel: "11"
  formation: gun-trips-right      # X alone left on the LOS; Y attached right; H slot and Z off the LOS
  play: { concept: stick, side: right }   # Z (#1) clear/fade, H (#2) flat, Y (#3) stick at 6; X backside hitch
  protection: { scheme: slide, direction: right, rb: check-left }
defense:
  personnel: nickel
  front: { name: 4-2-5-over, strength: right }   # 3-tech and 9-tech to the trips/TE side; 1-tech and 5-tech weak
  shell_pre: two-high
  coverage: cover-3
  rotation: sky                    # field safety rotates down to curl/flat
  rush: 4
  players:
    - { id: FS6,  role: S,  pre: { x: 15.0, y: 10.5 }, width: { landmark: field-hash, relation: inside, yards: 2.8 },
        stance: { points: 2, weight: forward }, movement: creeping, truth: { assignment: curl-flat-field }, honest: true }
    - { id: BS31, role: S,  pre: { x: -2.0, y: 12.0 }, width: { landmark: boundary-hash, relation: outside, yards: 2.0 },
        movement: static, truth: { assignment: deep-middle } }
    # corners at 7 yd, outside leverage, eyes on QB -> deep thirds; nickel apexed -> hook/curl; Mike -> hook/curl; Will -> curl/flat (boundary)
  paths:                           # landmark paths (yards, ball-relative) + speed profile; positions at time t are computed, never stored
    - { id: FS6,  to: [[15.2, 6.0], [16.8, 4.5], [18.5, 3.6]], speed: db-rotate }    # spin down, then widen with #2
    - { id: BS31, to: [[8.9, 14.0]], speed: db-rotate }                               # deep middle of the field
    - { id: N21,  to: [[4.4, 9.5]], speed: lb-drop }                                  # hook, eyes on #3
routes:                            # waypoints from each receiver's alignment (content/offense/routes.yaml)
  Y: { route: stick, waypoints: [[0.7, 6.5], [1.7, 6.5]] }      # 6-yd stem from y -0.7, settle and turn out
  H: { route: arrow, waypoints: [[1.5, 2.2], [7.5, 3.3], [10.5, 3.6]] }
  Z: { route: clear, waypoints: [[0.5, 23.2]] }
  X: { route: hitch, waypoints: [[0, 5.6], [0.4, 5.0]] }
  R: { route: check-release-left, check_point: [-0.6, 1.2], release: [[-3.4, 2.4], [-6.4, 3.8]], check_until: 0.9 }
pressure_events:
  - { t: 2.4, rusher: DE97, type: edge-speed, side: off-hand }   # right side = blind side for a lefty; only matters if the ball is held
answers:
  cadence:
    shell: { best: two-high }
    box: { best: 6, note: "6 box defenders vs. 6 blockers (5 OL + RB) -> protection sound" }
    hot: { best: built-in, note: "Stick/flat are the quick answers vs. a 5th/6th rusher" }
    read: { best: FS6, note: "flat defender to the trips side after rotation" }
    escape: { best: climb-then-left, note: "left = throwing hand but boundary (~18 yd) is tight" }
  post_snap:
    coverage: { best: cover-3, rotation_name: sky }
    throw:
      branch_on: FS6.widens_with_flat    # true in this seed
      best: Y                            # stick open when the flat defender widens
      acceptable: []
      wrong: [H, Z, X]
  pocket:
    if_ball_held_past: 2.4
    best: climb
explanation_keys: [tell.safety-asymmetry, tell.creeping-safety, rotation.sky, read.stick-flat-defender, pocket.edge-speed-climb, lefty.blind-side-right, hash.boundary-room]
```
