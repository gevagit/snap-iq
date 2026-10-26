# SNAP IQ

A quarterback cognition training game for iPad: pre-snap routine, defensive reads (pre- and post-snap), and pocket movement, run as a short daily workout with game-style rewards.

- Spec: [`docs/PRD.md`](docs/PRD.md)
- Instructions for Claude Code: [`CLAUDE.md`](CLAUDE.md)
- Status: Phase 2, playable slice. The game runs the Shell Game workout from Sahar's eyes (`src/game`). Football Bible batches 1 and 2 are signed off by the owner with defaults, so every drill uses reviewed content.

## Commands

- `npm run build:game` - build the game into `dist/game` (Netlify publishes this folder) and `dist/snap-iq-game.html` (the same game as one page)

- `npm run check` - lint, typecheck, unit tests and content validation (run before every push)
- `npm run validate` - football invariants on `/content`, then every play call built and checked (PRD §6.11)
- `npm run lab` - build the Play Lab (`dist/play-lab.html`): pick an offense and a defense and watch the engine's play
- `npm run bible:doc` - regenerate the owner review material in `docs/bible/`
