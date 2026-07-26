# Agent ownership & branches

Each plan system owns an isolated git branch / worktree. Main agent integrates only.

| Branch | Owns | Gate focus |
|--------|------|------------|
| `agent/physics` | `src/rider/BoardPhysics.ts`, `tuning.ts`, surfaces feel | control ≥9, physics ≥9 |
| `agent/tricks` | `src/rider/AirTricks.ts`, grind/landing hooks | trick satisfaction ≥9 |
| `agent/camera` | `src/camera/**` | camera ≥8, no blank-sky framing |
| `agent/rider-art` | `src/rider/visual/**`, RiderModule visuals | rider/animation ≥8 |
| `agent/course` | `src/course/TerrainGenerator.ts`, `CourseDefs.ts`, `CourseModule.ts`, `SplinePath.ts` | terrain/course ≥8, spawn on mesh |
| `agent/props` | `src/course/Props.ts` | authored props, rails/ramps/trees |
| `agent/materials` | `src/render/materials/**`, snow/rock/ice mats | snow/materials ≥8 |
| `agent/vfx` | `src/vfx/**` | spray/trails/weather ≥8 |
| `agent/lighting` | `src/render/Pipeline.ts`, `RenderModule.ts`, `post/**` | lighting/atmosphere ≥8, NO white-out |
| `agent/audio` | `src/audio/**` | layered board/wind/UI feedback |
| `agent/ui` | `src/ui/**` | title/HUD/pause/settings/results |
| `agent/score` | `src/score/**`, `src/modes/**` | modes + persistence |
| `agent/perf` | LOD/instancing/loading hooks | 60fps @1080p |
| `agent/capture` | `tools/critic/**`, tests | all shots green |
| `agent/docs` | root `*.md`, LICENSE | docs complete |

## Critical defect (all agents)

Gameplay captures were blank washed-out sky. Title is OK. Fix spawn-on-terrain, chase framing, and post fog/exposure so `npm run capture -- --shot course_start` shows mountain + rider.

## Integration rule

Do not merge overlapping files across agents. Main agent merges branches after typecheck + capture smoke.
