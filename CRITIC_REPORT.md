# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (evening, post merge-queue)  
**Git tip scored:** `main` @ `770258acde7cb50884ef73beba2848f38289be51`  
(`Merge branch 'assets/pine-canopy-leaf-albedo'` — includes peaks `5a929d6`, ice slugs `b5ff26d`, canopy `9df6fec`, lighting haze, midfield chase, rider carve silhouette, Kenney pines)  
**Stashes:** left alone (not applied)  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled four shots via per-shot temp dirs.

**Frames reviewed (fresh @ 770258a):**
- `captures/tip-770258a/course_start.png` — HUD on, blank PASS (μ≈128.3 σ≈34.6)
- `captures/tip-770258a/forest.png` — HUD on, blank PASS (μ≈120.5 σ≈33.4)
- `captures/tip-770258a/carve.png` — HUD on, blank PASS (μ≈128.0 σ≈34.4)
- `captures/tip-770258a/results.png` — FINISH / ALPINE FLOW / GOLD / 1:42.40 / 12800 (blank PASS μ≈87.8 σ≈15.1)

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-770258a.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **FAIL** | Peaks exist as pale low-poly cardboard silhouettes washed into milk sky — still read as floating cutouts on empty fill, not grounded alpine mountain mass (`course_start` / `forest` / `carve` vs alpine groom). User complaint stands. |
| B2_forest | **FAIL** | `forest.png` / `course_start.png` show ~4–8 lonely pines — not dozens / timberline belt. Canopy albedo landed; density did not. |
| B3_shadows | **FAIL** | Corduroy self-shades; `carve.png` has short rider contact blob only — no long sun casts under trees/rider like alpine ref. |
| B4_corduroy | **PASS** | Packed grooves dominate race strip in all three gameplay shots. |
| B5_snow_color | **PASS** | Warm muddy/tan strip tonal range under sun (not flat grey plastic). Apron still washed. |
| B6_furniture | **PASS** | Fences + roadside banner readable near line (`forest.png`, `course_start.png`). |
| B7_rider | **PASS** | `carve.png`: deep lean, high-contrast neon accents, red board, box-limb silhouette — athlete read improved vs capsule. |
| B8_camera | **FAIL** | Midfield remains empty void — grey cones + plastic slab + blank haze; does not fill frame like alpine/SSX chase. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible on gameplay shots. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **FAIL** | Whiteout milk haze flattens near/far into blank void — not readable aerial perspective with mountain mass (alpine ref). |

**Binary tally: 5 PASS / 6 FAIL → gate FAIL.**

Loud first-viewport read: **grey cones + plastic corduroy slab + floating cardboard peaks in blank milk** ≠ alpine groom ref.

## Rubric (mean = **4.55**, gameplay mean = **4.25**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 4 | Haze present but whiteout; casts still short |
| snow | 6 | Corduroy + warm strip; apron grey |
| terrain | 3 | Peaks grounded attempt; still cardboard-in-void |
| materials | 5 | Ice slug fix + pine needles; peaks plastic |
| atmosphere | 3 | Milk haze ≠ alpine aerial |
| rider | 7 | Carve lean + contrast kit landed |
| animation | 6 | Held lean readable in carve |
| camera | 4 | Near corridor; midfield still empty |
| vfx | 3 | Minimal edge spray |
| ui | 7 | In-run HUD + results plate |
| course_composition | 3 | Sparse vs refs |
| readability_at_speed | 4 | Readable because empty |
| physics_believability | 5 | Planted; carve sells better |
| control_feel | 4 | Neutral |
| trick_satisfaction | 5 | Neutral |
| audio_feedback | 5 | Neutral |
| performance | 7 | ~200k+ tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 3 | Tech demo |
| art_direction | 3 | Mud strip + milk peaks |

**Disqualifiers:** `empty_mountain` (peaks-in-blank), `lonely_props`, `no_sun_shadows`  
(Prior `flat_ambient` still fair — long casts missing.)

## Top 5 blockers → fan-out owners

1. **Peaks / midfield as blank milk void** (B1 / B8 / `empty_mountain`) → `course` (peaks mass + apron join) + `camera`
2. **No forest belt** (B2) → `props` (density; canopy alone insufficient)
3. **Whiteout haze, not alpine aerial** (B11) → `lighting` / atmosphere
4. **No long sun cast shadows** (B3 / `no_sun_shadows`) → `lighting`
5. **Sparse course furniture vs alpine banners** (composition; B6 barely scrapes) → `props` (+ race features for race-tunnel ref)

Also: `materials` peak/apron PBR; `vfx` carve spray; race tunnel / line paint vs race-tunnel ref.

## Results shot note

`results` proves finish-complete UI path. Does **not** clear any B1–B11 mountain binaries.

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-770258a.json --label tip-770258a --fps 500
```

Expected: **exit 1**.
