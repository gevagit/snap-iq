# SNAP IQ

A quarterback cognition training game for iPad: pre-snap routine, defensive reads (pre- and post-snap), and pocket movement, run as a short daily workout with game-style rewards.

- Spec: [`docs/PRD.md`](docs/PRD.md)
- Instructions for Claude Code: [`CLAUDE.md`](CLAUDE.md)
- Status: Phase 1 (Football Bible), batch 1 in owner review: glossary, NFHS rules, field geometry.

## Commands

- `npm run check` - lint, typecheck, unit tests and content validation (run before every push)
- `npm run validate` - football invariants on `/content` (PRD §6.11)
- `npm run bible:doc` - regenerate the owner review material in `docs/bible/`
