# Progress

## Current milestone

Parallel agent fan-out on isolated `agent/*` branches / worktrees (see [AGENT_OWNERS.md](AGENT_OWNERS.md)).

## Active subagents (worktree branches)

| Branch | Focus |
|--------|-------|
| `agent/physics` | Board sensing / carve |
| `agent/tricks` | Air tricks / landings |
| `agent/camera` | Chase framing (blank-sky fix) |
| `agent/course` | Terrain + on-mesh spawn |
| `agent/props` | Rails/trees/gates |
| `agent/materials` | Snow/rock/ice PBR |
| `agent/vfx` | Spray/trails/snow |
| `agent/lighting` | Post fog white-out fix |
| `agent/audio` | Surface audio |
| `agent/ui` | Menus/HUD |
| `agent/score` | Modes/persistence |
| `agent/capture` | Critic harness |
| `agent/rider-art` | Rider visual |
| `agent/perf` | LOD/budgets |
| `agent/docs` | Living docs |
| `agent/critic` | Harsh gate (no prod code) |

Named worktrees: `/Users/jc/p/snowline-worktrees/<name>`  
Best-of-n runner worktrees also under `~/.cursor/worktrees/`.

## Critical defect

Gameplay captures washed to blank sky. Title OK. Lighting fog + camera framing + spawn-on-mesh are the fix owners.

## Next

1. Collect agent branch commits as they finish
2. Integrate non-overlapping merges onto `main`
3. Re-run capture + critic gate
4. Loop failing categories back to owning agents
