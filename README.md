# SNOWLINE

Original arcade snowboarding in the browser — TypeScript, Three.js, Rapier, WebGL2, Vite.

Hitscan-style modules + automated capture/critic loop. See [ORIGIN.md](ORIGIN.md), [AGENT_OWNERS.md](AGENT_OWNERS.md).

## Quick start

```bash
npm install
npm run assets:all
npm run dev
```

`assets:all` is optional — procedural fallbacks run offline. Open the printed URL → **Ride** → course → mode.

## Scripts

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run test
npm run preview
npm run assets:fetch
npm run assets:pack
npm run assets:all
npm run capture
npm run capture -- --shot title
npm run capture -- --shot course_start
npm run critic
npm run critic -- --label overall
npm run gate -- --verdict captures/latest/verdict.json --fps 60
npm run determinism
```

## Docs

| Doc | Topic |
|-----|-------|
| [ORIGIN.md](ORIGIN.md) | Brief + planning decisions |
| [PLAN.md](PLAN.md) | Milestones A–C |
| [PROGRESS.md](PROGRESS.md) | Status + parallel branches |
| [AGENT_OWNERS.md](AGENT_OWNERS.md) | Branch ownership |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Engine / modules / capture |
| [GAME_DESIGN.md](GAME_DESIGN.md) | Courses, modes, tricks |
| [CONTROLS.md](CONTROLS.md) | Input map |
| [ART_DIRECTION.md](ART_DIRECTION.md) | Look |
| [ASSETS.md](ASSETS.md) | Provenance |
| [TESTING.md](TESTING.md) | Capture / critic / gate |
| [PERFORMANCE.md](PERFORMANCE.md) | Budgets |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Bugs (incl. blank-sky P0) |

## Controls

A/D carve · Space jump · Shift boost · arrows spin/flip · J/K/L/U grabs · Esc pause. Gamepad supported.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
