# Critic Report — Snowline

**Verdict: PASS** (user-ref binary gate) — rubric floors still **FAIL**  
**Date:** 2026-07-26 (evening, tip `d53ff37` — dense ahead midfield + freeride/gamepad merges)  
**Git tip scored:** `d53ff374240d8f15460f9bf1a0ddb7be445603ac`  
(`Merge branch 'input/gamepad-settings-test'` — holds `de13e8e`/`7a119c5` denser midfield B8 pack, freeride soft-complete, ramp-ride-not-grind, gamepad settings test.)  
**Stashes:** none created/applied. Captured on primary `main` (clean).  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled via per-shot temp dirs. Gate shots blank-PASS. Park probe: `grind` (snow-plane stare / inverted). Results UI plate included.

**Frames reviewed (fresh @ d53ff37 → `captures/tip-d53ff37/`):**
- `course_start.png` — HUD on, blank PASS (μ≈71.7 σ≈35.6) — ~464k tris
- `forest.png` — HUD on, blank PASS (μ≈69.7 σ≈32.2) — ~442k tris
- `carve.png` — HUD on, blank PASS (μ≈70.9 σ≈37.0) — ~461k tris
- `grind.png` — HUD on, blank PASS (μ≈112.6 σ≈25.3) — ~435k tris — park probe (inverted snow-plane stare)
- `results.png` — UI plate (μ≈55.5 σ≈9.2) — finish/results path

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-d53ff37.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Ridgelines/peaks readable through timber gaps on `course_start` / `carve` / `forest`. |
| B2_forest | **PASS** | Harsh: dense flank walls + forest canyon continuous. Tris ~435–464k (+~30k vs ba46d9c). |
| B3_shadows | **PASS** | Directional casts under trees + rider; soft PCF umbras on corduroy. |
| B4_corduroy | **PASS** | Harsh: grooves readable; strong zebra still present but not pure wallpaper fail vs alpine groom language. |
| B5_snow_color | **PASS** | Harsh: tonal warm/cool holds, **not** milk — but darker muddy (μ≈72 vs ~88 prior). Alpine white still missed. |
| B6_furniture | **PASS** | Harsh: hut + fence readable mid on gate plates; carve shows red structure. `grind` still no park-box sell. |
| B7_rider | **PASS** | High-contrast neon accents + red board; carve lean readable. |
| B8_camera | **PASS** | Harsh: `7a119c5` denser ahead midfield **clears** prior open-groom corridor. `course_start`/`carve` flanks pack like alpine/SSX midfield; fall line stays playable (no CAM_CROSS). |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible on gameplay shots. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **PASS** | Cool aerial depth; forest canyon reads solid canopy (overall darker than bright tip). |

**Binary tally: 11 PASS / 0 FAIL → user-ref binary gate PASS.**

Loud first-viewport read: **Dense midfield pack finally kills the empty corduroy corridor. Lighting/snow went muddier (μ↓). Grind park probe still broken. Rubric floors nowhere near 8.5.**

## Rubric (mean = **5.55**, gameplay mean = **4.50**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 6 | Darker muddy fill (μ≈72); soft umbras hold; alpine luminous bar missed |
| snow | 5 | Muddy brown-grey vs alpine white; corduroy readable |
| terrain | 6 | Amphitheater peaks grounded; still low-poly |
| materials | 5 | Peaks/apron plastic; bark ok; snow muddy |
| atmosphere | 6 | Cool depth; forest canyon solid; darker overall |
| rider | 7 | Contrast kit + carve lean |
| animation | 6 | Held lean readable in carve |
| camera | 7 | Harsh B8 cleared; grind framing still broken |
| vfx | 3 | Grind particles only; carve spray absent/thin |
| ui | 7 | In-run HUD holds; results GOLD plate |
| course_composition | 7 | Timber walls packed + hut/fence; short of alpine banners/race features |
| readability_at_speed | 6 | Fall line readable |
| physics_believability | 5 | Planted carve; grind probe looks broken |
| control_feel | 4 | Neutral (not in stills) |
| trick_satisfaction | 3 | Grind probe lost park-box sell (inverted snow stare) |
| audio_feedback | 5 | Neutral |
| performance | 6 | ~435–464k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 6 | Playable chase; park still broken |
| art_direction | 5 | Density helps; muddy groom ≠ alpine |

**Disqualifiers:** none of the named extras (`empty_mountain` / `lonely_props` / `no_sun_shadows`).  
**Playability note:** Keep forward chase. B8 cleared — do **not** revive CAM_CROSS. Next pressure is alpine snow/light + park framing, not more corridor trees.

## Top blockers → fan-out owners

1. **Muddy dark snow vs alpine white** → `materials` (+ `lighting`) — restore luminous groom without milk whiteout (μ≈72 is a regression vs bright tip)
2. **Grind park probe framing** → `camera` + `course`/`capture` — box/scrape must stay on-camera under forward chase (inverted snow-plane stare)
3. **Minimal carve edge spray** → `vfx`
4. **Rubric floors** — mean **5.55** / gameplay **4.50** vs gate ≥8.5 / ≥9 — binary cleared; quality bar has not

## Park / grind / finish note

`grind.png` under forward chase stares at textured snow plane with inverted rider + particles — park box absent. `results.png` renders finish UI (GOLD / 1:42.40 / 12800).

## Delta vs tip `ba46d9c`

| Check | ba46d9c | **d53ff37** |
|-------|---------|------------|
| B1 | PASS | PASS |
| B2 | PASS | PASS |
| B3 | PASS | PASS |
| B4 | PASS | PASS |
| B5 | PASS | PASS (darker muddy) |
| B6 | PASS | PASS |
| B8 | **FAIL** | **PASS** (dense midfield `7a119c5`) |
| B11 | PASS | PASS |
| tally | 10/1 | **11/0** |
| mean | 5.75 | **5.55** |
| lighting tip | bright soft | **darker muddy regression** |
| props tip | forward frustum | **+ dense ahead midfield** |
| camera tip | forward | held |
| tris (start) | ~433k | **~464k** |

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-d53ff37.json --label tip-d53ff37 --fps 500
```

Expected: **exit 1** (rubric floors — binary alone is PASS).
