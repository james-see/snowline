# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (evening, forest v5 wall + park-on-grind)  
**Git tip scored:** `49db70e2882cdce9915b9409245f2fda9efe23ff`  
(`Merge branch 'props/timberline-wall-v5'` — forest `25ac690` ~960-tree near-solid lip walls. Includes park-on-grind `d3b7b8e`/`4702318`, finish `7ad86df`, camera v4 `2fbfd7e`.)  
**Stashes:** none created/applied. Captured on primary `main` (clean). Replaces WIP critic note `993f6d6`.  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled via per-shot temp dirs. Gate shots blank-PASS. Park probe: `grind`. Results UI plate included (UI blank thresholds).

**Frames reviewed (fresh @ 49db70e → `captures/tip-49db70e/`):**
- `course_start.png` — HUD on, blank PASS (μ≈49.5 σ≈19.8) — ~408k tris
- `forest.png` — HUD on, blank PASS (μ≈28.3 σ≈19.6) — ~411k tris
- `carve.png` — HUD on, blank PASS (μ≈41.2 σ≈16.5) — ~409k tris
- `grind.png` — HUD on, blank PASS (μ≈56.0 σ≈17.4) — ~409k tris — park probe
- `results.png` — UI plate (μ≈59.3 σ≈10.6) — finish/results path

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-49db70e.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Ridgelines/peaks readable behind timberline on `course_start` / `grind` (forest canopy dominates that plate — OK). |
| B2_forest | **PASS** | Harsh: v5 wall lands. `forest` is near-solid overlapping canopy; `course_start` / `grind` show continuous packed lip belts (not ≤5 lonely cones). Tris ↑ ~408–411k vs ~305–316k pre-v5. Alpine wall-to-wall language met on gate+grind. |
| B3_shadows | **PASS** | Long directional casts under trees + rider (`course_start` / `forest` striping). |
| B4_corduroy | **PASS** | Packed grooves dominate race strip in all gameplay shots. |
| B5_snow_color | **PASS** | Warm muddy/tan strip under sun (not flat grey plastic). Still off alpine white. |
| B6_furniture | **PASS** | Harsh: `grind` keeps readable dark box/platform + scrape particles; gate shots keep `SLOW DOWN` / marker. Banner/race-tunnel density still thin vs alpine ref, but ≥1 furniture bar met. |
| B7_rider | **PASS** | High-contrast neon accents + red board; carve lean readable. |
| B8_camera | **FAIL** | Harsh: `carve` / `course_start` still sell a large empty corduroy foreground/left apron — rider sits in open groom void despite right-side timber wall. Not alpine/SSX chase frame fill. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible on gameplay shots. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **PASS** | Cool aerial depth; forest plate reads dark near-solid canopy with depth cues. |

**Binary tally: 10 PASS / 1 FAIL → gate FAIL.**

Loud first-viewport read: **B2 cleared by v5 timberline wall; park box still on grind (B6); harsh B8 midfield/foreground corduroy void remains the only binary kill.**

## Rubric (mean = **5.55**, gameplay mean = **5.00**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 7 | Long casts + cool alpine aerial hold |
| snow | 6 | Corduroy + warm strip; muddy vs alpine white |
| terrain | 6 | Amphitheater peaks grounded; still low-poly |
| materials | 5 | Corduroy OK; peaks/apron plastic |
| atmosphere | 6 | Cool depth; forest canopy reads solid |
| rider | 7 | Contrast kit + carve lean |
| animation | 6 | Held lean readable in carve |
| camera | 5 | Timber fill helps; carve/start empty apron still B8 |
| vfx | 4 | Grind scrape particles; carve spray still thin |
| ui | 7 | In-run HUD holds; results screen renders |
| course_composition | 6 | Timber wall + park box; gate left apron still empty |
| readability_at_speed | 5 | Readable; empty apron still large |
| physics_believability | 5 | Planted; carve sells |
| control_feel | 4 | Neutral (not in stills) |
| trick_satisfaction | 5 | Grind probe frames box + scrape |
| audio_feedback | 5 | Neutral |
| performance | 6 | ~408–411k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 5 | Timber + park wink; carve frame still empty left |
| art_direction | 5 | Wall denser; muddy strip + empty apron ≠ alpine |

**Disqualifiers:** none of the named extras (`empty_mountain` / `lonely_props` / `no_sun_shadows`) — B8 alone fails the gate.  
Cleared vs prior: `lonely_props` (B2), park-invisible B6, milk void / flat ambient.

## Top blockers → fan-out owners

1. **Midfield / foreground corduroy void** (B8) → `camera` + `props` — carve/start must fill left apron + chase mid like alpine/SSX; timber wall on one side is not enough
2. **Muddy brown strip vs alpine white** → `materials`
3. **Minimal carve edge spray** → `vfx`
4. **Banner/race-tunnel density still thin on gate shots** → `props` (B6 holds; alpine banner wall not met)

## Park / grind / finish note

`grind.png` keeps park authorship on-camera (box + scrape) under denser timber. `results.png` renders finish UI (GOLD / time / score).

## Delta vs tip `d3b7b8e` / `94a874b`

| Check | 94a874b | d3b7b8e | **49db70e** |
|-------|---------|---------|------------|
| B1 | PASS | PASS | PASS |
| B2 | FAIL | FAIL | **PASS** (v5 wall) |
| B3 | PASS | PASS | PASS |
| B6 | PASS (no grind) | PASS (box on grind) | **PASS** |
| B8 | FAIL | FAIL | **FAIL** |
| B11 | PASS | PASS | PASS |
| tally | 9/2 | 9/2 | **10/1** |
| mean | 5.40 | 5.40 | **5.55** |
| forest tip | v4 `2822f40` | v4 | **v5 `25ac690`** |
| camera tip | v3 | v4 | v4 (B8 uncleared) |
| park tip | — | `4702318` | **held** |
| tris (start) | ~308k | ~305k | **~408k** |

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-49db70e.json --label tip-49db70e --fps 500
```

Expected: **exit 1**.
