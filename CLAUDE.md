# SNAP IQ — instructions for Claude Code

SNAP IQ is an iPad web game (PWA) that trains a left-handed youth QB's pre-snap routine, defensive reads and pocket movement. The full spec is `docs/PRD.md`. Read it before any work. Build phases in order (PRD §16); the current phase is **Phase 2: Playable slice**. The game (`src/game`) is one rep per play: the play call (huddle), his pre-snap routine at the line with up to 2 route changes, the snap, a freeze 1 s after it for the coverage and his decision, then the Breakdown. Bubble comes next. Football Bible batches 1, 2 and 3 (offense, defense, speed profiles, play engine in `src/play`, quarterback play and the routine) are signed off by the owner with defaults; content changed later goes back to `reviewed: false` and reaches drills only through the playtest setting.

## Football accuracy (most important)
- Never invent football content in code: terms, alignments, rules, tells or explanations. All of it lives in `/content`.
- New or changed football meaning → mark the entry `reviewed: false` and tell the owner it needs review (the owner reviews first, and brings in the coach when needed). Unreviewed content may appear in the Scenario Lab only, never in drills.
- Only use terms defined in `content/glossary.yaml`. Add new terms there (with definition and aliases) first.
- Rules are NFHS (high school). Never assume NFL or NCAA rules.
- Every content change must pass the football invariants (PRD §6.11): `npm run validate` checks the content and builds every play call. A call that does not fit is skipped with a reason; a built play that fails a check is a bug in content or engine.
- The play engine (`src/play`) holds no football numbers: alignments, techniques, landmarks, paths and speeds all come from `/content`.

## Engine rules
- Deterministic: no `Math.random` in engine code; use the seeded RNG. Same scenario + seed ⇒ same result.
- No live AI or network calls during gameplay. No speech recognition; input is touch or gamepad only.
- Target device is an older iPad (about 2020); keep rendering within the PRD §14.5 budget.
- Pocket and footwork logic uses throwing-hand side / off-hand side, never hard-coded left/right.
- Never hand-place post-snap positions. They come from the movement model (PRD §6.13): alignment + route waypoints or landmark path + speed profile + time. The reachability invariant (§6.11) must pass.
- Every drill is drawn from Sahar's own eyes (natural-lens QB-eye view that turns with his head, PRD §7.5); top-down only in Learn and Breakdown. His own players render see-through.
- In live drills his pre-snap read sets where his eyes turn at the snap; the screen must always show where he is looking (PRD §7.5).
- Difficulty never removes information (PRD P3); the legibility check must pass in his-eyes view.

## Workflow
- Branch per change → PR → Netlify deploy preview (owner tests on the iPad) → merge to `main`.
- Before pushing: lint, typecheck, unit tests, content validation - `npm run check` runs all four.
- Review material for the owner: `npm run bible:doc` regenerates `docs/bible/` from `/content`; `npm run lab` builds the Play Lab page for reviewing plays by eye.
- Plain-English rule change requests: edit `/content` (or the matching rule function), add or adjust a test, update the explanation snippets, run validation, open a PR.
- Never commit secrets. Supabase URL and anon key come from env vars; service keys only as environment secrets.
