# SNAP IQ — instructions for Claude Code

SNAP IQ is an iPad web game (PWA) that trains a left-handed youth QB's pre-snap routine, defensive reads and pocket movement. The full spec is `docs/PRD.md`. Read it before any work. Build phases in order (PRD §16); the current phase is **Phase 0: Football Bible**.

## Football accuracy (most important)
- Never invent football content in code: terms, alignments, rules, tells or explanations. All of it lives in `/content`.
- New or changed football meaning → mark the entry `reviewed: false` and tell the owner it needs coach review. Unreviewed content may appear in the Scenario Lab only, never in drills.
- Only use terms defined in `content/glossary.yaml`. Add new terms there (with definition and aliases) first.
- Rules are NFHS (high school). Never assume NFL or NCAA rules.
- Every content change must pass the football invariants (PRD §6.11): `npm run validate` once it exists.

## Engine rules
- Deterministic: no `Math.random` in engine code; use the seeded RNG. Same scenario + seed ⇒ same result.
- No live AI or network calls during gameplay.
- Pocket and footwork logic uses throwing-hand side / off-hand side, never hard-coded left/right.
- Difficulty never removes information (PRD P3); the legibility check must pass for every camera a tier uses.

## Workflow
- Branch per change → PR → Netlify deploy preview (owner tests on the iPad) → merge to `main`.
- Before pushing: lint, typecheck, unit tests, content validation.
- Plain-English rule change requests: edit `/content` (or the matching rule function), add or adjust a test, update the explanation snippets, run validation, open a PR.
- Never commit secrets. Supabase URL and anon key come from env vars; service keys only as environment secrets.
