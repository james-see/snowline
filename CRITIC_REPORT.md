# Critic Report — Snowline

**Verdict: FAIL**  
**Date:** 2026-07-26  
**Branch tip reviewed against:** `main` @ ~11de41c (post P0/P1 merges + apron stack-overflow fix `86ca8a7`)  
**Frames reviewed (MUST — fresh captures):**
- `captures/run-48290/course_start.png` (+ `meta.json`)
- `captures/run-48610/forest.png` (+ `meta.json`)
- `captures/run-48808/carve.png` (+ `meta.json`)

**Gate:** every category ≥8, gameplay categories ≥9, mean ≥8.5, 0 disqualifiers, fps ≥60.

## Summary

Still a hard fail — but deltas are real and credited.

| Delta | Status |
|-------|--------|
| Mountain apron / soft berms beyond strip | **Improved** — soft shelves/ridges visible in all three frames |
| Rider contrast (dark gear vs snow) | **Improved** — silhouette readable |
| Carve edge spray | **Started** — soft particles in `carve.png` (vfx 2→5) |
| Snow micro-detail / mottling | **Improved enough to clear** `flat_white_snow` |
| Floating trees | **NOT fixed** — `forest.png` still shows trees hovering above the ridge |
| Directional sun + contact shadows | **NOT visible** — `flat_ambient` remains |
| In-run HUD | **Absent** |

Prior P0 float + void dominated (mean **3.65**). This pass mean **4.15** — progress, not a pass. Worst remaining: **floating forest props** and **invisible lighting work**.

**Mean score: 4.15** — nowhere near 8.5.

## Disqualifiers (observed)

| ID | Evidence |
|----|----------|
| `flat_ambient` | No cast shadows under rider/trees; no readable sun direction on snow across all three gameplay frames despite lighting merge |

**Cleared since last report:** `flat_white_snow` — mottled micro-detail visible on course_start/carve (still low snow score; not a binary DQ).

**Not a rubric DQ but P0 defect:** floating trees in `forest.png` (props snap claimed; capture contradicts).

## Category scores (mean = 4.15)

| Category | Score | Δ | Note |
|----------|------:|--:|------|
| lighting | 3 | 0 | Sun/shadow merge not visible in frames |
| snow | 4 | +1 | Mottling present; no specular/powder response |
| terrain | 3 | +1 | Apron berms yes; floating forest trees |
| materials | 3 | +1 | Slight albedo variation; plastic props |
| atmosphere | 4 | 0 | Sky split only |
| rider | 6 | +2 | Dark gear contrast readable |
| animation | 4 | 0 | Carve still upright / weak knee flex |
| camera | 5 | 0 | Rider+terrain framed |
| vfx | 5 | +3 | Soft carve spray present, weak |
| ui | 5 | −2 | No title in set; no HUD (neutral) |
| course_composition | 3 | +1 | Berms help; floating timberline kills |
| readability_at_speed | 4 | 0 | Float makes hazards untrustworthy |
| physics_believability | 3 | +1 | Float remains; apron continuity better |
| control_feel | 4 | +1 | Mild spray/board cue |
| trick_satisfaction | 5 | 0 | Neutral |
| audio_feedback | 5 | 0 | Neutral |
| performance | 5 | 0 | Real draw calls / tris |
| temporal_stability | 5 | 0 | Nothing disqualifying in stills |
| overall_fun | 3 | +1 | Still tech demo |
| art_direction | 4 | 0 | Generic grey prototype |

## Worst problem

`forest.png` trees still float above the ridge — trunk bases clear of snow — despite props-snap merges. World contact fantasy is broken until the next forest capture shows planted trunks.

## Ordered fixes (by visual / playability impact)

1. **agent/props P0** — Re-fix forest snap (meshWidth/apron bed Y + trunk pivot); planted trees in next `forest` capture.
2. **agent/lighting P0** — Sun + contact shadows must show in gameplay frames; clear `flat_ambient`.
3. **agent/capture P1** — Fail captures when prop Y ≫ terrain sample (catch this regression).
4. **agent/materials P1** — Specular + powder/packed on mottled snow.
5. **agent/vfx P1** — Denser, grounded carve spray.
6. **agent/rider-art P1** — Carve-ready stance (contrast landed).
7. **agent/course P2** — Feature sculpt on apron (not empty soft hills).
8. **agent/ui P2** — In-run HUD.

## Gate

```bash
npm run gate -- --verdict captures/verdict.json --fps 60
```

Expected: **exit 1** (iterate). Do not advance the quality loop until forest trees are planted and `flat_ambient` is cleared in captures.
