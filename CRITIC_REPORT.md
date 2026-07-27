# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (evening, full v2 stack)  
**Git tip scored:** `main` @ `d3ef831cee522537ce55a97d7dfec4d3162ecea3`  
(`Merge branch 'props/dense-forest-belt-v2'` — includes lighting `afe9b34`, camera `daa75c0`, peaks `f9f5ea0`, forest `2a0575c`)  
**Stashes:** left alone (not applied)  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled four shots via per-shot temp dirs. Gameplay blank-PASS; `results` fails default blank σ (UI plate — capture accepts via UI thresholds).

**Frames reviewed (fresh @ d3ef831):**
- `captures/tip-d3ef831/course_start.png` — HUD on, blank PASS (μ≈66.4 σ≈32.7)
- `captures/tip-d3ef831/forest.png` — HUD on, blank PASS (μ≈65.4 σ≈36.8)
- `captures/tip-d3ef831/carve.png` — HUD on, blank PASS (μ≈64.4 σ≈33.8)
- `captures/tip-d3ef831/results.png` — FINISH / ALPINE FLOW / GOLD / 1:42.40 / 12800 (UI plate; default blank σ FAIL, capture UI thresholds PASS)

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-d3ef831.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Amphitheater bowl + dark rock ridgelines fill horizon (`course_start` / `forest` / `carve`). Milk-void cardboard cutouts gone — grounded mountain mass vs prior FAIL. Still low-poly vs alpine ref, but gate bar met. |
| B2_forest | **FAIL** | On-camera tree count still sparse (~dozens at best as lonely cones on apron/skyline). Alpine groom shows packed timberline belts; 320-tree budget not reading as forest density in chase frame. |
| B3_shadows | **PASS** | Long directional casts across corduroy (`forest.png` striping; `carve` / `course_start` rider + terrain shadows). `no_sun_shadows` cleared. |
| B4_corduroy | **PASS** | Packed grooves dominate race strip in all three gameplay shots. |
| B5_snow_color | **PASS** | Warm muddy/tan strip tonal range under sun (not flat grey plastic). Apron still washed/grey. |
| B6_furniture | **PASS** | Fences + roadside banners readable near line (`course_start`, `forest`, `carve`). |
| B7_rider | **PASS** | `carve.png`: deep lean, high-contrast neon accents, red board — athlete read holds. |
| B8_camera | **FAIL** | Mountain fills upper frame, but midfield remains empty corduroy slab — not packed with trees/props like alpine/SSX chase. Harsh: mountain mass ≠ midfield fill. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible on gameplay shots. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **PASS** | Cool blue-grey aerial depth with near/far separation — whiteout milk haze cleared. |

**Binary tally: 9 PASS / 2 FAIL → gate FAIL.**

Loud first-viewport read: **dark amphitheater + long sun casts on muddy corduroy, but sparse cones — not alpine timberline**.

## Rubric (mean = **5.35**, gameplay mean = **4.50**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 7 | Long casts + cool alpine aerial landed |
| snow | 6 | Corduroy + warm strip; muddy vs alpine white |
| terrain | 6 | Amphitheater peaks grounded; still low-poly |
| materials | 5 | Corduroy OK; peaks/apron plastic |
| atmosphere | 6 | Cool depth; milk void cleared |
| rider | 7 | Carve lean + contrast kit |
| animation | 6 | Held lean readable in carve |
| camera | 5 | Mountain fill up; midfield still empty |
| vfx | 3 | Minimal edge spray |
| ui | 7 | In-run HUD + results plate |
| course_composition | 4 | Sparse vs alpine/SSX density |
| readability_at_speed | 5 | Readable; empty midfield helps |
| physics_believability | 5 | Planted; carve sells |
| control_feel | 4 | Neutral |
| trick_satisfaction | 5 | Neutral |
| audio_feedback | 5 | Neutral |
| performance | 7 | ~274–280k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 4 | Tech demo → early mountain |
| art_direction | 4 | Mud strip + sparse cones ≠ alpine |

**Disqualifiers:** `lonely_props` (forest density not reading)  
Cleared vs prior: `empty_mountain`, `no_sun_shadows` (and milk `flat_ambient` whiteout).

## Top blockers → fan-out owners

1. **Forest belt not reading on camera** (B2 / `lonely_props`) → `props` — density must pack chase midfield like alpine timberline (budget alone insufficient)
2. **Midfield corduroy void** (B8) → `camera` + `props` — mountain upper-fill ≠ tree/prop-packed midfield like alpine/SSX
3. **Muddy brown strip vs alpine white groom** → `materials` — warm corduroy OK; overall snow language still off-ref
4. **Peak/apron plastic low-poly** → `course` + `materials` — mass OK; surface fidelity still cardboard
5. **Minimal carve spray / race features** → `vfx` + `props`/`course` — race-tunnel banners/tunnel/line paint absent

## Results shot note

`results` proves finish-complete UI path. Does **not** clear any B1–B11 mountain binaries.

## Delta vs tip `770258a`

| Check | 770258a | d3ef831 |
|-------|---------|---------|
| B1 | FAIL | **PASS** |
| B2 | FAIL | FAIL |
| B3 | FAIL | **PASS** |
| B8 | FAIL | FAIL |
| B11 | FAIL | **PASS** |
| tally | 5/6 | **9/2** |
| mean | 4.55 | **5.35** |

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-d3ef831.json --label tip-d3ef831 --fps 500
```

Expected: **exit 1**.
