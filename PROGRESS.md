# Progress

## Current milestone

Milestone B/C — full game scaffold on `main`; parallel agents polishing toward critic gate.

## Critical defect

**Blank-sky gameplay captures** — status: **open / in progress** (2026-07-26).

| Layer | Branch | Status |
|-------|--------|--------|
| Spawn on terrain | `agent/course` | in progress |
| Chase framing | `agent/camera` | in progress |
| Post fog/exposure whiteout | `agent/lighting` / `fix/lighting-post-whiteout` | WIP (`PostStack` exposure/fog) |
| Blank-frame detect | `agent/capture` | in progress |

Title capture OK. Gameplay shots fail until smoke is green:

```bash
npm run capture -- --shot course_start
```

## Parallel agent branches

| Branch | Focus |
|--------|-------|
| `agent/physics` | Board physics / surfaces |
| `agent/tricks` | Air tricks / grind / landings (`tricks/air-recognition`) |
| `agent/camera` | Chase camera, blank-sky framing |
| `agent/rider-art` | Rider/board visuals |
| `agent/course` | Terrain, spawn, course defs |
| `agent/props` | Rails, ramps, trees |
| `agent/materials` | Snow/rock/ice materials |
| `agent/vfx` | Spray/trails/weather (`vfx/carve-spray-trails-snowfall-boost`) |
| `agent/lighting` | HDR/post, anti-whiteout |
| `agent/audio` | Board/wind/UI audio |
| `agent/ui` | Title/HUD/pause/settings/results |
| `agent/score` | Modes + save |
| `agent/perf` | 60 FPS @ 1080p |
| `agent/capture` | Playwright capture / probes |
| `agent/critic` | Rubric / gate |
| `agent/docs` | Living docs (this tree) |

See [AGENT_OWNERS.md](AGENT_OWNERS.md).

## Completed (scaffold)

- Vite + TS + Three + Rapier; 120 Hz engine; keyboard/gamepad; capture bridge
- Arcade board physics, air tricks, three course defs, chase cam, score/modes
- Forward HDR + tonemap/bloom, VFX, procedural audio, full UI shell
- Critic tools scaffold; `npm run typecheck` / `npm run build` green on scaffold

## Next

1. Land blank-sky fix triad; green `course_start` capture
2. Full `npm run critic` + `npm run gate`
3. Merge agent branches (no overlapping files)
4. Acceptance from clean checkout
