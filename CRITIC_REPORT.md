# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (evening, forward frustum fill + smooth snow)  
**Git tip scored:** `ba46d9cb1a796a4a44be4bee4dd8ca9fb7af4814`  
(`Merge props/forward-frustum-fill-b8` — `60f63ab` mid-corridor props into forward chase frustum; holds smooth snow `73390cb`/`e5a4229`, bright lighting `6124adb`, forward chase `bd1b721`, forest v5 `25ac690`, loading bar `39bfa72`, gamepad `5373655`.)  
**Stashes:** none created/applied. Captured on primary `main` (clean).  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled via per-shot temp dirs. Gate shots blank-PASS. Park probe: `grind` (snow-plane stare). Results UI plate included.

**Frames reviewed (fresh @ ba46d9c → `captures/tip-ba46d9c/`):**
- `course_start.png` — HUD on, blank PASS (μ≈87.9 σ≈33.5) — ~433k tris
- `forest.png` — HUD on, blank PASS (μ≈76.5 σ≈34.5) — ~436k tris
- `carve.png` — HUD on, blank PASS (μ≈88.2 σ≈33.3) — ~434k tris
- `grind.png` — HUD on, blank PASS (μ≈101.1 σ≈21.7) — ~412k tris — park probe (snow-plane stare)
- `results.png` — UI plate (μ≈54.7 σ≈9.4) — finish/results path

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-ba46d9c.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Ridgelines/peaks readable behind timberline on `course_start` / `carve`. |
| B2_forest | **PASS** | Harsh: v5 wall holds. `forest` canyon continuous; start/carve lip belts packed. Tris ~412–436k. |
| B3_shadows | **PASS** | Directional casts under trees + rider; soft PCF umbras (less razor zebra). |
| B4_corduroy | **PASS** | Harsh tiling: grooves readable without wallpaper repeat; multi-freq bake + higher metres-per-repeat holds. |
| B5_snow_color | **PASS** | Brighter day fill (μ≈88 vs ~58 pre-lighting); not milk whiteout (σ≈33). Warm muddy strip under sun; still off alpine white. |
| B6_furniture | **PASS** | Harsh: red banner + mid hut + fence on gate plates. `grind` still no park-box sell. |
| B7_rider | **PASS** | High-contrast neon accents + red board; carve lean readable. |
| B8_camera | **FAIL** | Harsh: `60f63ab` adds look-ahead hut/fence/banner and ~+10k tris, but `course_start` / `carve` still read as a wide empty corduroy corridor vs alpine/SSX midfield pack. Lower ~half of start is open groom; inset strip props too sparse/far to clear the void. Fall line stays playable (no CAM_CROSS). |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible on gameplay shots. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **PASS** | Cool aerial depth; forest canyon reads solid canopy. |

**Binary tally: 10 PASS / 1 FAIL → gate FAIL.**

Loud first-viewport read: **Bright soft lighting + smoother snow land clean; forward frustum fill is a delta but harsh B8 still kills — open groom apron remains the first read vs alpine ref. Grind park probe still broken.**

## Rubric (mean = **5.75**, gameplay mean = **5.35**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 8 | Bright soft alpine fill; not milk; soft umbras |
| snow | 7 | Brighter + less-tiled corduroy; still muddy vs alpine white |
| terrain | 6 | Amphitheater peaks grounded; still low-poly |
| materials | 6 | Smoother tiling; peaks/apron still plastic |
| atmosphere | 6 | Cool depth; forest canyon solid |
| rider | 7 | Contrast kit + carve lean |
| animation | 6 | Held lean readable in carve |
| camera | 5 | Forward fill delta; harsh B8 corridor remains |
| vfx | 4 | Grind particles; carve spray thin |
| ui | 7 | In-run HUD holds; results GOLD plate |
| course_composition | 6 | Timber walls + some ahead furniture; apron still empty |
| readability_at_speed | 6 | Fall line readable |
| physics_believability | 5 | Planted; carve sells |
| control_feel | 4 | Neutral (not in stills; gamepad merge not visible) |
| trick_satisfaction | 4 | Grind probe lost park-box sell |
| audio_feedback | 5 | Neutral |
| performance | 6 | ~412–436k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 6 | Playable chase; midfield still thin vs refs |
| art_direction | 5 | Brighter groom helps; empty corridor ≠ alpine |

**Disqualifiers:** none of the named extras (`empty_mountain` / `lonely_props` / `no_sun_shadows`) — B8 alone fails the gate.  
**Playability note:** Keep forward chase. B8 fix must pack denser *ahead-corridor* mass (trees/rocks/banners closer in the strip) — not revive CAM_CROSS.

## Top blockers → fan-out owners

1. **Harsh B8 — open groom corridor** → `props` (+ light `course`) — denser inset mid-corridor trees/rocks/banners in the look-ahead frustum on `course_start`/`carve`; match alpine midfield pack without hiding fall line
2. **Muddy brown strip vs alpine white** → `materials`
3. **Minimal carve edge spray** → `vfx`
4. **Grind park probe framing** → `camera` + `course`/`capture` — box/scrape must stay on-camera under forward chase

## Park / grind / finish note

`grind.png` under forward chase stares at textured snow plane (particles + inverted rider) — park box absent. `results.png` renders finish UI (GOLD / 1:42.40 / 12800).

## Delta vs tip `bd1b721`

| Check | bd1b721 | **ba46d9c** |
|-------|---------|------------|
| B1 | PASS | PASS |
| B2 | PASS | PASS |
| B3 | PASS | PASS |
| B4 | PASS | **PASS** (smoother tiling held) |
| B5 | PASS | **PASS** (brighter; not milk) |
| B6 | PASS | PASS |
| B8 | FAIL | **FAIL** (forward fill delta; harsh corridor remains) |
| B11 | PASS | PASS |
| tally | 10/1 | **10/1** |
| mean | 5.50 | **5.75** |
| lighting tip | prior | **bright soft `6124adb`** |
| materials tip | prior | **smooth less-tiled `73390cb`** |
| props tip | v5 lip | **v5 + forward frustum `60f63ab`** |
| camera tip | forward `bd1b721` | held |
| tris (start) | ~423k | **~433k** |

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-ba46d9c.json --label tip-ba46d9c --fps 500
```

Expected: **exit 1**.
