# Progress

## Current milestone

Milestone B — parallel agent merges onto `main`; critic loop after blank-sky P0.

## Critical defect

**Blank-sky gameplay captures** — status: **partially fixed** (2026-07-26).

| Layer | Branch / commit | Status |
|-------|-----------------|--------|
| Spawn on terrain | `fbb2dc7` | merged |
| Chase framing | `fbb2dc7` + camera agent | merged |
| Post fog/exposure | `3dae765` (`fix/lighting-post-whiteout`) | merged |
| Surface audio | `da49297` → merge | merged |
| Blank-frame detect | `agent/capture` | pending |

`course_start` now shows rider on snow (not empty void). Still flat/under-dressed for gate (≥8 snow/terrain/materials).

```bash
npm run capture -- --shot course_start
```

## Parallel agent branches

| Branch | Focus | Status |
|--------|-------|--------|
| `agent/physics` | Board physics | running / pending merge |
| `agent/tricks` / `tricks/air-recognition` | Air tricks | running / pending merge |
| `agent/camera` | Chase camera | landed on main |
| `agent/rider-art` | Rider visuals | running |
| `agent/course` | Terrain / spawn | landed on main |
| `agent/props` | Rails/trees | running |
| `agent/materials` | Snow PBR | running — **next critic fail owner** |
| `agent/vfx` | Spray/trails | running |
| `agent/lighting` / `fix/lighting-post-whiteout` | HDR/post | merged |
| `audio/surface-aware-feedback` | Audio | merged |
| `agent/ui` | Menus/HUD | running |
| `agent/score` | Modes + save | running |
| `agent/perf` | 60 FPS | running |
| `agent/capture` | Capture/probes | running |
| `agent/critic` | Rubric/gate | running |
| `agent/docs` | Living docs | merging |

See [AGENT_OWNERS.md](AGENT_OWNERS.md). Worktrees: `/Users/jc/p/snowline-worktrees/<name>` and `~/.cursor/worktrees/`.

## Completed

- Vite + TS + Three + Rapier; 120 Hz engine; capture bridge
- Arcade physics, tricks, three courses, chase cam, score/modes, UI shell
- White-out fog fix; on-mesh spawn; chase snap on `run:start`
- Surface-aware audio; critic toolchain; typecheck/build green

## Next

1. Merge remaining non-overlapping agent branches (materials, props, vfx, ui, score, capture, perf, tricks, physics, rider-art)
2. Re-run `npm run critic` + `npm run gate`
3. Route remaining fails (flat snow, sparse props) to materials/props/course
4. Acceptance from clean checkout
