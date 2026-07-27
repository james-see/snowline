# Agent ownership & branches

File-map ownership. Prefer **feature branches**; worktrees optional (only if agents run truly concurrent writes).

| Branch | Owns | Gate focus |
|--------|------|------------|
| `agent/physics` | `src/rider/BoardPhysics.ts`, `tuning.ts` | control ≥9, physics ≥9 |
| `agent/tricks` | `src/rider/AirTricks.ts`, grind/landing | trick ≥9 |
| `agent/camera` | `src/camera/**` | camera ≥8; fill frame like user refs |
| `agent/rider-art` | `src/rider/visual/**` | rider ≥8; vivid gear |
| `agent/course` | TerrainGenerator, CourseDefs, CourseModule, SplinePath | peaks/relief; B1 |
| `agent/props` | `src/course/Props.ts`, `props/**` | dense forest + furniture; B2/B6/B10 |
| `agent/materials` | `src/render/materials/**` | corduroy + snow color; B4/B5 |
| `agent/vfx` | `src/vfx/**` | spray ≥8 |
| `agent/lighting` | Pipeline, RenderModule, post/** | long sun shadows; B3/B11 |
| `agent/audio` | `src/audio/**` | feedback |
| `agent/ui` | `src/ui/**` | in-run HUD; B9 |
| `agent/score` | score/modes | modes |
| `agent/perf` | Lod | 60fps with denser props |
| `agent/capture` | tools/critic | shots + refs in brief |
| `agent/docs` | root md | docs |

## User-ref loop

See [GATE_USER_REFS.md](GATE_USER_REFS.md). Director scores against `refs/snowboard/images/user_ref_*.png` and fans owners until all binary checks PASS.