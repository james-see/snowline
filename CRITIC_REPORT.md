# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (evening, park-on-grind + camera v4 + finish)  
**Git tip scored:** `d3b7b8e5898f03e1640c44001cc9f96e9e054fc9`  
(`Merge branch 'course/park-visible-on-grind'` — includes park frustum `4702318`, finish `7ad86df` / `a686565`, camera v4 `2fbfd7e`, forest v4.)  
**Stashes:** none created/applied. Captured on primary `main` (clean).  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled via per-shot temp dirs. Gate shots blank-PASS. Park probe: `grind`. Results UI shot included.

**Frames reviewed (fresh @ d3b7b8e → `captures/tip-d3b7b8e/`):**
- `course_start.png` — HUD on, blank PASS (μ≈55.1 σ≈24.3) — ~305k tris
- `forest.png` — HUD on, blank PASS (μ≈42.7 σ≈25.9) — ~314k tris
- `carve.png` — HUD on, blank PASS (μ≈44.9 σ≈21.9) — ~307k tris
- `grind.png` — HUD on, blank PASS (μ≈57.0 σ≈21.4) — ~307k tris — park probe
- `results.png` — UI blank PASS (μ≈61.0 σ≈10.2) — finish/results path

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-d3b7b8e.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Amphitheater + dark rock ridgelines fill horizon in gate + grind shots. |
| B2_forest | **FAIL** | Harsh vs alpine timberline: `forest` near walls denser, but `course_start` / `carve` / `grind` still read as spaced cones with snow gaps — not packed continuous belts. Alpine groom = wall-to-wall timber — not met. |
| B3_shadows | **PASS** | Long directional casts under trees + rider (`forest` striping strong; grind/start hold). |
| B4_corduroy | **PASS** | Packed grooves dominate race strip in all gameplay shots. |
| B5_snow_color | **PASS** | Warm muddy/tan strip under sun (not flat grey plastic). Still off alpine white. |
| B6_furniture | **PASS** | Harsh park re-test: `grind` now shows a readable dark grind box/platform + particulate scrape near rider (park-on-camera landed). Gate shots keep `SLOW DOWN` / flag / fence language. |
| B7_rider | **PASS** | High-contrast neon accents + red board; carve lean readable. |
| B8_camera | **FAIL** | Harsh: `carve` remains a huge empty midfield corduroy slab; `course_start` foreground void persists. Camera v4 / forest cross-look helps `forest` near fill but does **not** sell mountain like alpine/SSX chase on carve/start. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible on gameplay shots. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **PASS** | Cool blue-grey aerial depth with near/far separation. |

**Binary tally: 9 PASS / 2 FAIL → gate FAIL.**

Loud first-viewport read: **park box finally on `grind` (B6 clears); B2 timberline gaps + B8 midfield corduroy void still kill the gate.**

## Rubric (mean = **5.40**, gameplay mean = **4.50**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 7 | Long casts + cool alpine aerial hold |
| snow | 6 | Corduroy + warm strip; muddy vs alpine white |
| terrain | 6 | Amphitheater peaks grounded; still low-poly |
| materials | 5 | Corduroy OK; peaks/apron plastic |
| atmosphere | 6 | Cool depth; milk void stays cleared |
| rider | 7 | Contrast kit + carve lean |
| animation | 6 | Held lean readable in carve |
| camera | 4 | Carve/start midfield void unchanged under harsh B8 |
| vfx | 4 | Grind particulate scrape; carve spray still thin |
| ui | 7 | In-run HUD holds; results screen renders |
| course_composition | 5 | Park box on grind; gate shots still sparse vs alpine |
| readability_at_speed | 5 | Readable; empty midfield helps |
| physics_believability | 5 | Planted; carve sells |
| control_feel | 4 | Neutral (not in stills) |
| trick_satisfaction | 5 | Grind probe finally frames a box |
| audio_feedback | 5 | Neutral |
| performance | 7 | ~305–314k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 4 | Park wink on grind; mountain still empty midfield |
| art_direction | 4 | Mud strip + gapped cones ≠ alpine |

**Disqualifiers:** `lonely_props` (timberline still gapped)  
Cleared vs prior: `empty_mountain`, `no_sun_shadows`; park-invisible B6 harsh fail cleared.

## Top blockers → fan-out owners

1. **Timberline still not alpine-dense** (B2 / `lonely_props`) → `props` — continuous packed belts in chase midfield, not gapped cones
2. **Midfield corduroy void** (B8) → `camera` + `props` — carve/start must fill like alpine/SSX; camera v4 forest look insufficient
3. **Muddy brown strip vs alpine white** → `materials`
4. **Minimal carve edge spray** → `vfx`
5. **Banner/race-tunnel density still thin on gate shots** → `props` (B6 holds via grind box + signs; alpine banner wall not met)

## Park / grind / finish note

`grind.png` now proves park authorship on-camera (box + scrape). `results.png` renders finish UI (GOLD / time / score) — finish merge path OK for static results preset. Finish-arch completion not separately probed beyond results plate.

## Delta vs tip `94a874b` / `343b624`

| Check | 94a874b | 343b624 | **d3b7b8e** |
|-------|---------|---------|------------|
| B1 | PASS | PASS | PASS |
| B2 | FAIL | FAIL | **FAIL** |
| B3 | PASS | PASS | PASS |
| B6 | PASS (no grind) | **FAIL** (park off-cam) | **PASS** (box on grind) |
| B8 | FAIL | FAIL | **FAIL** |
| B11 | PASS | PASS | PASS |
| tally | 9/2 | 8/3 | **9/2** |
| mean | 5.40 | 5.25 | **5.40** |
| camera tip | v3 | v3 | **v4 `2fbfd7e`** (B8 uncleared) |
| park tip | — | invisible | **`4702318` on grind** |
| finish | — | — | **`7ad86df`** results OK |

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-d3b7b8e.json --label tip-d3b7b8e --fps 500
```

Expected: **exit 1**.
