# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (evening, forest v4 tip)  
**Git tip scored:** `94a874b394fec99378e13a4ef490bbef4697bd23`  
(`Merge branch 'props/continuous-timberline-v4'` — forest `2822f40` continuous multi-row belts. Camera still v3 `7cdfd71`; `camera/fill-midfield-v4` has uncommitted WIP in owner WT — **not** scored.)  
**Stashes:** none created/applied. Captured from detached critic WT (`~/.cursor/worktrees/critic-94a874b/snowline-critic`).  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled via per-shot temp dirs. Gate shots blank-PASS. No grind/park probe this run (B2/B8 focus).

**Frames reviewed (fresh @ 94a874b → `captures/tip-94a874b/`):**
- `course_start.png` — HUD on, blank PASS (μ≈68.0 σ≈29.8) — ~308k tris
- `forest.png` — HUD on, blank PASS (μ≈61.3 σ≈39.0) — ~316k tris
- `carve.png` — HUD on, blank PASS (μ≈51.8 σ≈34.7) — ~320k tris

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-94a874b.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Amphitheater + dark rock ridgelines fill horizon in all gate shots. |
| B2_forest | **FAIL** | Harsh vs alpine timberline: `forest` mid walls denser (tris ↑ ~316k) with multi-row intent, but still readable as spaced cones + snow gaps — not packed continuous belts. `course_start` / `carve` remain sparse dotted lines with large white gaps. Alpine groom = wall-to-wall timber — not met. |
| B3_shadows | **PASS** | Long directional casts under trees + rider (`forest` striping strong). |
| B4_corduroy | **PASS** | Packed grooves dominate race strip in all gate shots. |
| B5_snow_color | **PASS** | Warm muddy/tan strip under sun (not flat grey plastic). Still off alpine white. |
| B6_furniture | **PASS** | Fence lines + sign boards readable near line on `course_start` / `forest`. (No grind probe this tip — park visibility not re-tested.) |
| B7_rider | **PASS** | High-contrast neon accents + red board; carve lean readable though darker silhouette. |
| B8_camera | **FAIL** | Harsh: midfield remains empty corduroy slab on `carve` / `course_start` (huge foreground void). `forest` fills better with near trees but still not alpine/SSX chase density. Mountain upper-fill ≠ tree/prop-packed refs. Camera v4 not in tip. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **PASS** | Cool blue-grey aerial depth with near/far separation. |

**Binary tally: 9 PASS / 2 FAIL → gate FAIL.**

Loud first-viewport read: **timberline denser than v3 but still gapped cones; midfield corduroy void unchanged (camera v4 not merged).**

## Rubric (mean = **5.40**, gameplay mean = **4.40**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 7 | Long casts + cool alpine aerial hold |
| snow | 6 | Corduroy + warm strip; muddy vs alpine white |
| terrain | 6 | Amphitheater peaks grounded; still low-poly |
| materials | 5 | Corduroy OK; peaks/apron plastic |
| atmosphere | 6 | Cool depth; milk void stays cleared |
| rider | 7 | Contrast kit holds; carve silhouette darker |
| animation | 6 | Held lean readable in carve |
| camera | 4 | Midfield void on carve/start (B8); v4 not in tip |
| vfx | 3 | Minimal edge spray |
| ui | 7 | In-run HUD holds |
| course_composition | 4 | Forest denser; still sparse vs alpine/race |
| readability_at_speed | 5 | Readable; empty midfield helps |
| physics_believability | 5 | Planted; carve sells |
| control_feel | 4 | Neutral (not visible in stills) |
| trick_satisfaction | 4 | Neutral (no park probe) |
| audio_feedback | 5 | Neutral |
| performance | 7 | ~308–320k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 4 | Early mountain; timberline still thin |
| art_direction | 4 | Mud strip + gapped cones ≠ alpine |

**Disqualifiers:** `lonely_props` (forest still not alpine-dense)  
Cleared vs prior: `empty_mountain`, `no_sun_shadows`.

## Top blockers → fan-out owners

1. **Timberline still not alpine-dense on camera** (B2 / `lonely_props`) → `props` — multi-row belts must pack wall-to-wall in chase midfield (gaps between cones = FAIL under harsh bar); `course_start` / `carve` still dotted
2. **Midfield corduroy void** (B8) → `camera` — land `fill-midfield-v4` (WIP in owner WT) + props fill like alpine/SSX
3. **Muddy brown strip vs alpine white** → `materials`
4. **Minimal carve spray / race-tunnel language** → `vfx` + `props`
5. **Park on-camera** (prior B6 harsh) → `course` + `capture` — re-probe when scoring park again

## Delta vs tip `343b624` / `0fb692c`

| Check | 0fb692c | 343b624 | **94a874b** |
|-------|---------|---------|-------------|
| B1 | PASS | PASS | PASS |
| B2 | FAIL | FAIL | **FAIL** (denser tris; still gapped) |
| B3 | PASS | PASS | PASS |
| B6 | PASS | FAIL (park invisible) | **PASS** (fences; no grind probe) |
| B8 | FAIL | FAIL | **FAIL** (camera v4 not merged) |
| B11 | PASS | PASS | PASS |
| tally | 9/2 | 8/3 | **9/2** |
| mean | 5.40 | 5.25 | **5.40** |
| forest tip | `4ffc2ac` | `4ffc2ac` | **`2822f40`** |
| camera tip | `7cdfd71` | `7cdfd71` | **`7cdfd71`** (v4 WIP) |
| tris (forest) | ~294k | ~294k | **~316k** |

Forest v4 packs more geometry; harsh gate still fails B2+B8. Camera v4 not ready.

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-94a874b.json --label tip-94a874b --fps 500
```

Expected: **exit 1**.
