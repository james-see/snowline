# Critic Report — Snowline

**Verdict: FAIL**  
**Date:** 2026-07-26  
**Branch tip reviewed against:** `main` @ ~258889f+  
**Frames reviewed (MUST — fresh captures):**
- `captures/run-38415/course_start.png` (+ `meta.json`)
- `captures/run-38674/carve.png`
- `captures/run-38863/forest.png`
- `captures/run-39051/title.png`

**Gate:** every category ≥8, gameplay categories ≥9, mean ≥8.5, 0 disqualifiers, fps ≥60.

## Summary

Hard fail. Blank-sky / whiteout gameplay captures are largely cleared — all three gameplay frames now show rider + snow terrain (progress vs prior 3-draw-call voids). That is **not** a pass.

Two confirmed P0 world-contact failures dominate:

1. **Floating props** — `forest.png` shows a tree cluster hovering in open sky above the ridge. Gates already snap via `CourseModule.#snapMarkersToTerrain`; trees/rocks/rails still use authored Y from `CourseDefs.ts`.
2. **Off-course = void** — Player-reported (treat as confirmed until frames contradict): leaving the strip = fall into infinity. Terrain still reads as a soft grey sheet, not a mountain you can ride into deep powder aprons.

Title (`run-39051`) is the strongest frame: navy atmosphere, sun disc, brand-forward SNOWLINE. Gameplay remains generic prototype grey.

**Mean score: 3.65** — nowhere near 8.5.

## Disqualifiers (observed)

| ID | Evidence |
|----|----------|
| `flat_white_snow` | Large pale blue-grey snow areas with no powder/packed/ice response, tracks, or sun specular across all gameplay shots |
| `flat_ambient` | No directional sun / contact shadows on rider, trees, or snow — ambient sky fill only |

**Not listed as rubric disqualifiers but P0 defects:** floating trees (forest.png), off-course freefall/void (player-confirmed).

## Category scores (mean = 3.65)

| Category | Score | Note |
|----------|------:|------|
| lighting | 3 | No sun direction / contact shadows |
| snow | 3 | Plastic pale fill, faint noise only |
| terrain | 2 | Soft sheet; floating trees; no apron mountain |
| materials | 2 | Plastic snow + primitive props/rider |
| atmosphere | 4 | Sky split OK; no depth layers in-game |
| rider | 4 | Visible board/rider; weak contrast |
| animation | 4 | Mild carve lean; start near-idle |
| camera | 5 | Rider+terrain framed (blank-sky cleared) |
| vfx | 2 | No carve spray |
| ui | 7 | Title strong; no HUD |
| course_composition | 2 | Empty field + floating forest |
| readability_at_speed | 4 | Slope readable; line/hazards not |
| physics_believability | 2 | Float + void fail contact |
| control_feel | 3 | Weak carve cue only |
| trick_satisfaction | 5 | Neutral |
| audio_feedback | 5 | Neutral |
| performance | 5 | Real draw calls; no blank metas |
| temporal_stability | 5 | Nothing disqualifying in stills |
| overall_fun | 2 | Not a playable fantasy |
| art_direction | 4 | Title OK; gameplay generic |

## Worst problem

Trees/props float above the mesh (authored Y; gates snap, trees don't) — confirmed in `forest.png` — and leaving the playable strip falls into void instead of a deep powder mountain apron.

## Ordered fixes (by visual / playability impact)

1. **agent/props P0** — Snap ALL props to terrain mesh Y before physics register; next `forest` capture shows trunks planted.
2. **agent/course P0** — Widen apron / extend collision beyond strip into powder berms/shelves — never empty void.
3. **agent/physics P0** — Ray miss / below-mesh → powder drag recovery or respawn, never infinite freefall.
4. **agent/materials P1** — Kill flat pale snow (micro-detail + specular; powder vs packed).
5. **agent/lighting P1** — Directional sun + contact shadows; clear `flat_ambient`.
6. **agent/vfx P1** — Edge spray on `carve.png`.
7. **agent/rider-art P1** — Gear contrast + carve stance.
8. **agent/ui P2** — In-run HUD on gameplay shots.

## Gate

```bash
npm run gate -- --verdict captures/verdict.json --fps 60
```

Expected: **exit 1** (iterate). Do not advance the quality loop until floating props are gone, apron/void is fixed, and disqualifiers clear.
