# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (tip resync)  
**Git tip scored:** `main` @ `5ad87bb12365d429817332b89259d621e728b4d7`  
(`fix: complete runs at the finish arch with results UI` — includes corduroy + HUD + vivid rider ancestors)  
**Stashes:** left alone  
**Harness bugs fixed:** UI blank-check false-fail on `results` (flat gradient σ≈12) — softer `UI_BLANK_THRESHOLDS` for menu/results plates in `tools/critic/blank-frame.mjs` + `capture.mjs`

**Frames reviewed (fresh @ 5ad87bb; pre-tip discarded as final evidence):**
- `captures/run-84828/course_start.png` — HUD on, blank PASS (μ=96.9 σ=25.7)
- `captures/run-85126/forest.png` — HUD on, blank PASS (μ=90.1 σ=28.0)
- `captures/run-85364/carve.png` — HUD on, blank PASS (μ=96.7 σ=25.5)
- `captures/run-86291/results.png` — FINISH / ALPINE FLOW / GOLD / 1:42.40 / 12800 (blank PASS after UI-threshold fix; prior `run-85589` same plate)

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-5ad87bb.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Low-poly ridgelines/peaks dominate horizon in course_start / forest / carve. |
| B2_forest | **FAIL** | `forest.png` ~8–12 lonely pines — not dozens / timberline belt vs alpine ref. |
| B3_shadows | **FAIL** | Corduroy self-shades only; no long cast shadows under rider/trees. |
| B4_corduroy | **PASS** | Packed grooves readable on race strip in all three gameplay shots. |
| B5_snow_color | **PASS** | Warm muddy strip tonal range + lighting response (not flat grey plastic). |
| B6_furniture | **PASS** | Fences/gates readable near line in course_start + forest. |
| B7_rider | **FAIL** | Neon vest/board contrast yes; carve upright idle @ 2 km/h — no athlete lean. |
| B8_camera | **FAIL** | Peaks in frame but empty midfield void vs alpine/SSX chase fill. |
| B9_hud | **PASS** | Score, combo, speed, time, CP on gameplay shots. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **FAIL** | Flat blue sky; no aerial haze / near-far separation. |

**Binary tally: 6 PASS / 5 FAIL → gate FAIL.**

## Rubric (mean = **4.15**, gameplay mean = **3.75**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 3 | `flat_ambient` — no long cast shadows |
| snow | 5 | Corduroy landed; apron still grey |
| terrain | 3 | Peaks yes; empty midfield |
| materials | 5 | Groom responds; props/peaks plastic |
| atmosphere | 2 | No depth haze |
| rider | 5 | Vivid gear; capsule body |
| animation | 3 | Carve = upright idle |
| camera | 4 | Scale OK; framing empty vs refs |
| vfx | 3 | No edge spray |
| ui | 7 | In-run HUD + results FINISH screen works |
| course_composition | 3 | Sparse vs refs |
| readability_at_speed | 4 | Readable because empty |
| physics_believability | 4 | Planted; weak carve sell |
| control_feel | 3 | No carve response |
| trick_satisfaction | 5 | Neutral |
| audio_feedback | 5 | Neutral |
| performance | 7 | ~500+ fps inferred; ~200k tris |
| temporal_stability | 6 | Stills clean |
| overall_fun | 3 | Tech demo |
| art_direction | 3 | Muddy strip + grey low-poly peaks |

**Disqualifiers:** `flat_ambient`  
**Extra user-ref DQs:** `lonely_props`, `no_sun_shadows`

## Top 5 blockers → fan-out owners

1. **Sparse forest / lonely props** (B2) → `props`
2. **No long sun cast shadows** (B3 / `flat_ambient`) → `lighting`
3. **No atmosphere / aerial haze** (B11) → `lighting` / atmosphere
4. **Empty midfield framing** (B8) → `camera` + `course`
5. **Capsule rider, no carve lean** (B7) → `rider-art` (+ anim / perform)

Also: `course` race features (tunnel/line paint) vs race-tunnel ref; `materials` apron snow; `vfx` carve spray.

## Results shot note

`results` proves finish-complete UI path (medal/time/score). Does **not** clear any B1–B11 mountain binaries. First capture failed blank-check (σ=12.2 ≤ 14); harness now uses softer UI thresholds for menu plates only.

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-5ad87bb.json --label tip-5ad87bb --fps 500
```

Expected: **exit 1**.
