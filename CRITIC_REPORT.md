# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (evening, forward chase restore)  
**Git tip scored:** `bd1b721da3ed0426feb0dd93360a5c806cf05c6f`  
(`camera: restore forward chase for playability` — drops v3/v4 forest cross-look / CAM_CROSS; near-corridor path-ahead chase, FOV ~48. Holds forest v5 `25ac690`, park-on-grind `4702318`, finish `7ad86df`.)  
**Stashes:** none created/applied. Captured on primary `main` (clean).  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled via per-shot temp dirs. Gate shots blank-PASS. Park probe: `grind` (framing degraded — see note). Results UI plate included.

**Frames reviewed (fresh @ bd1b721 → `captures/tip-bd1b721/`):**
- `course_start.png` — HUD on, blank PASS (μ≈57.9 σ≈28.6) — ~423k tris
- `forest.png` — HUD on, blank PASS (μ≈44.6 σ≈28.0) — ~427k tris
- `carve.png` — HUD on, blank PASS (μ≈56.9 σ≈29.1) — ~423k tris
- `grind.png` — HUD on, blank PASS (μ≈42.1 σ≈17.0) — ~409k tris — park probe (near snow-plane stare)
- `results.png` — UI plate (μ≈61.0 σ≈10.2) — finish/results path

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-bd1b721.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Ridgelines/peaks readable behind timberline on `course_start` / `carve`. |
| B2_forest | **PASS** | Harsh: v5 wall holds. `forest` is continuous canopy canyon; start/carve keep packed lip belts. Tris ~409–427k. |
| B3_shadows | **PASS** | Directional casts under trees + rider (forest striping; carve contact). |
| B4_corduroy | **PASS** | Packed grooves dominate race strip in all gameplay shots. |
| B5_snow_color | **PASS** | Warm muddy/tan strip under sun (not flat grey plastic). Still off alpine white. |
| B6_furniture | **PASS** | Harsh: gate shots keep fence line + mid hut / markers. `grind` no longer sells park box (camera pitched into snow + particles) — furniture bar still met on gate plates. |
| B7_rider | **PASS** | High-contrast neon accents + red board; carve lean readable. |
| B8_camera | **FAIL** | Harsh: restored forward chase puts large empty corduroy foreground/mid strip in `course_start` / `carve` — rider sits in open groom void vs alpine/SSX midfield pack. **Intentional playability trade:** fall line + corridor ahead are readable again (v4 cross-look hid the line into apron walls). Frame-fill regresses vs v4; playability improves. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible on gameplay shots. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **PASS** | Cool aerial depth; forest canyon reads solid canopy with depth cues. |

**Binary tally: 10 PASS / 1 FAIL → gate FAIL.**

Loud first-viewport read: **Forward chase restored — fall line playable; harsh B8 still the only binary kill (empty mid/foreground corduroy). Forest canyon sells density. Grind park probe framing worse than `49db70e`.**

## Rubric (mean = **5.50**, gameplay mean = **5.10**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 7 | Long casts + cool alpine aerial hold |
| snow | 6 | Corduroy + warm strip; muddy vs alpine white |
| terrain | 6 | Amphitheater peaks grounded; still low-poly |
| materials | 5 | Corduroy OK; peaks/apron plastic |
| atmosphere | 6 | Cool depth; forest canyon reads solid |
| rider | 7 | Contrast kit + carve lean |
| animation | 6 | Held lean readable in carve |
| camera | 4 | Playable forward chase; B8 midfield void worse than v4 cross-look |
| vfx | 4 | Grind particles; carve spray still thin |
| ui | 7 | In-run HUD holds; results screen renders |
| course_composition | 5 | Timber walls + fall line; empty apron centers frame |
| readability_at_speed | 6 | Fall line readable again (playability win) |
| physics_believability | 5 | Planted; carve sells |
| control_feel | 4 | Neutral (not in stills) |
| trick_satisfaction | 4 | Grind probe lost park-box sell |
| audio_feedback | 5 | Neutral |
| performance | 6 | ~409–427k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 6 | Playable chase corridor; still empty mid vs refs |
| art_direction | 5 | Muddy strip + empty apron ≠ alpine |

**Disqualifiers:** none of the named extras (`empty_mountain` / `lonely_props` / `no_sun_shadows`) — B8 alone fails the gate.  
**Playability note:** Parent priority — forward chase > B8 frame fill. Do **not** re-land v4 CAM_CROSS / prop-reach flank yaw without a playable fall-line path. B8 remains open for a *forward* midfield-fill (props/course into the look-ahead corridor), not cross-look into apron walls.

## Top blockers → fan-out owners

1. **Midfield / foreground corduroy void** (B8) → `props` + `course` (+ light `camera` only if fall line stays readable) — pack trees/furniture into the *ahead* chase frustum like alpine/SSX; do not revive flank cross-look that hides the line
2. **Muddy brown strip vs alpine white** → `materials`
3. **Minimal carve edge spray** → `vfx`
4. **Grind park probe framing** → `camera` + `course`/`capture` — box/scrape must stay on-camera under forward chase

## Park / grind / finish note

`grind.png` under forward chase stares near snow plane (particles + rider) — park box not selling vs prior grind still. `results.png` renders finish UI (GOLD / time / score).

## Delta vs tip `49db70e` / `d3b7b8e`

| Check | d3b7b8e | 49db70e | **bd1b721** |
|-------|---------|---------|------------|
| B1 | PASS | PASS | PASS |
| B2 | FAIL | **PASS** (v5 wall) | **PASS** (held) |
| B3 | PASS | PASS | PASS |
| B6 | PASS (box on grind) | **PASS** | **PASS** (gate furniture; grind box weak) |
| B8 | FAIL | FAIL | **FAIL** (playability restore; frame-fill regress) |
| B11 | PASS | PASS | PASS |
| tally | 9/2 | 10/1 | **10/1** |
| mean | 5.40 | 5.55 | **5.50** |
| forest tip | v4 | v5 `25ac690` | **v5 held** |
| camera tip | v4 | v4 | **forward chase `bd1b721`** |
| park tip | `4702318` | held | held (probe framing weaker) |
| tris (start) | ~305k | ~408k | **~423k** |

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-bd1b721.json --label tip-bd1b721 --fps 500
```

Expected: **exit 1**.
