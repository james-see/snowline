# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (evening, post park + gamepad + checkpoint)  
**Git tip scored:** `ec6e846d7696c177418b01e27ecc21708ed37271`  
(`critic: FAIL tip 0fb692c…` on main — includes park `d11cb19`/`343b624`, gamepad `4816af7`/`f52a30d`, checkpoint `1fe0840`, camera `7cdfd71`, forest `4ffc2ac`, peaks/lighting stack. Prior critic scored stale tip `0fb692c` only.)  
**Stashes:** left alone (not applied / not created)  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled four shots via per-shot temp dirs. Gameplay blank-PASS; `results` fails default blank σ (UI plate — capture accepts via UI thresholds). Fresh luma ≈ identical to `0fb692c` (park/gamepad/checkpoint did not move gate-shot framing).

**Frames reviewed (fresh @ ec6e846):**
- `captures/tip-ec6e846/course_start.png` — HUD on, blank PASS (μ≈68.1 σ≈29.8)
- `captures/tip-ec6e846/forest.png` — HUD on, blank PASS (μ≈63.6 σ≈39.5)
- `captures/tip-ec6e846/carve.png` — HUD on, blank PASS (μ≈53.6 σ≈36.1)
- `captures/tip-ec6e846/results.png` — FINISH / ALPINE FLOW / GOLD / 1:42.40 / 12800 (UI plate; default blank σ FAIL, capture UI thresholds PASS)

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-ec6e846.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Amphitheater + dark rock ridgelines fill horizon in all gameplay shots. Grounded mass holds vs alpine silhouette bar. |
| B2_forest | **FAIL** | Harsh vs alpine timberline: `forest` has mid walls, but trees still read as spaced cones with snow gaps — not packed continuous belts. `course_start` / `carve` remain sparse dotted lines, not alpine groom density. |
| B3_shadows | **PASS** | Long directional casts under trees + rider (`forest` striping strong; `course_start` / `carve` contact readable). |
| B4_corduroy | **PASS** | Packed grooves dominate race strip in all three gameplay shots. |
| B5_snow_color | **PASS** | Warm muddy/tan strip under sun (not flat grey plastic). Still off alpine white language. |
| B6_furniture | **PASS** | Fences + roadside banners readable near line (`course_start`, `forest`, `carve`). Park rails/kickers **not** in these gate presets — no extra furniture credit. |
| B7_rider | **PASS** | `carve.png`: deep lean, high-contrast neon accents, red board — athlete read holds. |
| B8_camera | **FAIL** | Harsh: apron-reach helps `forest`, but `carve` / `course_start` midfield still empty corduroy slab — not tree/prop-packed like alpine/SSX chase. Mountain upper-fill ≠ midfield fill. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible on gameplay shots. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **PASS** | Cool blue-grey aerial depth with near/far separation. |

**Binary tally: 9 PASS / 2 FAIL → gate FAIL.**

Loud first-viewport read: **park/gamepad/checkpoint landed on main, but gate shots still sell empty corduroy + sparse cones — ≠ alpine/SSX.**

## Rubric (mean = **5.40**, gameplay mean = **4.50**)

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
| course_composition | 5 | Timberline walls started; park features absent from gate shots |
| readability_at_speed | 5 | Readable; empty midfield helps speed read |
| physics_believability | 5 | Planted; carve sells |
| control_feel | 4 | Neutral (gamepad merge not scored from stills) |
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
5. **Minimal carve spray / race features** → `vfx` + `props`/`course` (park rails not in gate presets — capture or densify line furniture)

## Results shot note

`results` proves finish-complete UI path. Does **not** clear any B1–B11 mountain binaries.

## Delta vs tip `0fb692c` (stale prior critic)

| Check | 0fb692c | ec6e846 (main HEAD) |
|-------|---------|---------------------|
| B1 | PASS | PASS |
| B2 | FAIL | FAIL (unchanged — gate shots visually same stack) |
| B3 | PASS | PASS |
| B8 | FAIL | FAIL (unchanged) |
| B11 | PASS | PASS |
| tally | 9/2 | **9/2** |
| mean | 5.40 | **5.40** |
| new on tip | — | park + gamepad + checkpoint |

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-ec6e846.json --label tip-ec6e846 --fps 500
```

Expected: **exit 1**.
