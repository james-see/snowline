# Progress

## Current milestone

Milestone B/C — full game systems integrated; polishing toward gate.

## Active ownership

| Area | Path |
|------|------|
| Engine | `src/engine/` |
| Rider / tricks | `src/rider/` |
| Course | `src/course/` |
| Camera | `src/camera/` |
| Render / post | `src/render/` |
| VFX | `src/vfx/` |
| Audio | `src/audio/` |
| Score / save | `src/score/` |
| UI / flow | `src/ui/`, `src/modes/` |
| Critic | `tools/critic/` |
| Assets | `tools/assets/` |

## Completed

- Vite + TS + Three + Rapier scaffold
- Fixed 120 Hz engine, input (keyboard/gamepad), settings, capture bridge
- Board-aware arcade physics, air tricks, landings, crash recovery
- Three course defs + terrain generator + props
- Chase camera, score/combos/save, modes flow
- Forward HDR + tonemap/bloom post, VFX, procedural audio
- Title / course / mode / HUD / pause / settings / results
- Critic rubric, capture, gate, assets tools
- `npm run typecheck` and `npm run build` green

## Under review

- Visual polish vs rubric (snow materials, authored props density)
- Capture determinism on GPU Chrome
- Perf at 1080p during forest sections

## Next actions

1. Run capture suite + critic gate
2. Fix failing categories
3. Acceptance pass from clean checkout
4. Commit stable milestone
