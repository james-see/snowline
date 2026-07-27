# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (evening, camera v3 + timberline v3)  
**Git tip scored:** `0fb692c45073655207c3274661082180a0850da4`  
(`Merge branch 'props/timberline-density-v3'` — includes camera `7cdfd71`, forest `4ffc2ac`, prior peaks/lighting/forest-v2 stack. Note: `main` since advanced past this tip; captures are of this merge.)  
**Stashes:** left alone (not applied)  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled four shots via per-shot temp dirs. Gameplay blank-PASS; `results` fails default blank σ (UI plate — capture accepts via UI thresholds).

**Frames reviewed (fresh @ 0fb692c):**
- `captures/tip-0fb692c/course_start.png` — HUD on, blank PASS (μ≈68.1 σ≈29.8)
- `captures/tip-0fb692c/forest.png` — HUD on, blank PASS (μ≈63.6 σ≈39.5)
- `captures/tip-0fb692c/carve.png` — HUD on, blank PASS (μ≈53.6 σ≈36.1)
- `captures/tip-0fb692c/results.png` — FINISH / ALPINE FLOW / GOLD / 1:42.40 / 12800 (UI plate; default blank σ FAIL, capture UI thresholds PASS)

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-0fb692c.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Amphitheater + dark rock ridgelines fill horizon in all gameplay shots. Grounded mass holds vs alpine silhouette bar. |
| B2_forest | **FAIL** | Harsh vs alpine timberline: `forest` denser mid walls than d3ef831, but trees still read as spaced cones with snow gaps — not packed continuous belts. `course_start` / `carve` remain sparse dotted lines, not alpine groom density. |
| B3_shadows | **PASS** | Long directional casts under trees + rider (`forest` striping strong; `course_start` / `carve` contact readable). |
| B4_corduroy | **PASS** | Packed grooves dominate race strip in all three gameplay shots. |
| B5_snow_color | **PASS** | Warm muddy/tan strip under sun (not flat grey plastic). Still off alpine white language. |
| B6_furniture | **PASS** | Fences + roadside banners readable near line (`course_start`, `forest`, `carve`). |
| B7_rider | **PASS** | `carve.png`: deep lean, high-contrast neon accents, red board — athlete read holds. |
| B8_camera | **FAIL** | Harsh: apron-reach cross-look helps `forest`, but `carve` / `course_start` midfield still empty corduroy slab — not tree/prop-packed like alpine/SSX chase. Mountain upper-fill ≠ midfield fill. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible on gameplay shots. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **PASS** | Cool blue-grey aerial depth with near/far separation. |

**Binary tally: 9 PASS / 2 FAIL → gate FAIL.**

Loud first-viewport read: **timberline walls started on forest chase, but midfield corduroy void + sparse cones still ≠ alpine/SSX**.

## Rubric (mean = **5.40**, gameplay mean = **4.55**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 7 | Long casts + cool alpine aerial hold |
| snow | 6 | Corduroy + warm strip; muddy vs alpine white |
| terrain | 6 | Amphitheater peaks grounded; still low-poly |
| materials | 5 | Corduroy OK; peaks/apron plastic |
| atmosphere | 6 | Cool depth; milk void stays cleared |
| rider | 7 | Carve lean + contrast kit |
| animation | 6 | Held lean readable in carve |
| camera | 5 | Forest better; carve/start midfield still void (B8) |
| vfx | 3 | Minimal edge spray |
| ui | 7 | In-run HUD + results plate |
| course_composition | 5 | Timberline walls started; still sparse vs alpine |
| readability_at_speed | 5 | Readable; empty midfield helps speed read |
| physics_believability | 5 | Planted; carve sells |
| control_feel | 4 | Neutral |
| trick_satisfaction | 5 | Neutral |
| audio_feedback | 5 | Neutral |
| performance | 7 | ~283–294k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 4 | Early mountain, not race energy |
| art_direction | 4 | Mud strip + spaced cones ≠ alpine |

**Disqualifiers:** `lonely_props` (forest density still not alpine timberline)  
Cleared vs prior: `empty_mountain`, `no_sun_shadows`.

## Top blockers → fan-out owners

1. **Timberline still not alpine-dense on camera** (B2 / `lonely_props`) → `props` — midfield walls must pack like alpine groom continuous belts (gaps between cones = FAIL under harsh bar)
2. **Midfield corduroy void** (B8) → `camera` + `props` — `carve`/`course_start` still empty slab; mountain upper-fill + forest-only densify insufficient
3. **Muddy brown strip vs alpine white groom** → `materials`
4. **Peak/apron plastic low-poly** → `course` + `materials`
5. **Minimal carve spray / race features** → `vfx` + `props`/`course`

## Results shot note

`results` proves finish-complete UI path. Does **not** clear any B1–B11 mountain binaries.

## Delta vs tip `d3ef831`

| Check | d3ef831 | 0fb692c |
|-------|---------|---------|
| B1 | PASS | PASS |
| B2 | FAIL | FAIL (forest denser; still not alpine pack) |
| B3 | PASS | PASS |
| B8 | FAIL | FAIL (forest better; carve/start void) |
| B11 | PASS | PASS |
| tally | 9/2 | **9/2** |
| mean | 5.35 | **5.40** |
| camera tip | `daa75c0` | **`7cdfd71`** |
| forest tip | `2a0575c` | **`4ffc2ac`** |

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-0fb692c.json --label tip-0fb692c --fps 500
```

Expected: **exit 1**.
