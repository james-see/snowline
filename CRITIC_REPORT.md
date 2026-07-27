# Critic Report — Snowline

**Verdict: PASS** (user-ref binary gate) — rubric floors still **FAIL**  
**Date:** 2026-07-27 (tip `f52fc36` — packed-snow BoardTrail)  
**Git tip scored:** `f52fc360dc02ac42c46811c7c0cdedda255945d3`  
(`vfx: packed-snow carve channel instead of VFX ribbon` on `bafab99` title atmosphere.)  
**Stashes:** none created/applied. Captured on primary `main` (clean).  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled via per-shot temp dirs. Gate shots blank-PASS. Trail probe: `max_speed` (42 km/h wake visible).

**Frames reviewed (fresh @ f52fc36 → `captures/tip-f52fc36/`):**
- `course_start.png` — HUD on, blank PASS (μ≈72.4 σ≈34.8) — ~432k tris
- `forest.png` — HUD on, blank PASS (μ≈67.7 σ≈32.7) — ~409k tris
- `carve.png` — HUD on, blank PASS (μ≈72.7 σ≈36.3) — ~423k tris — often low-speed / air so trail thin
- `max_speed.png` — HUD on (μ≈71.6 σ≈34.7) — **trail probe** ~432k tris

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-f52fc36.json`

## Trail / carve groove (user concern)

| Check | Result | Evidence |
|-------|--------|----------|
| Arcade neon / emissive ribbon | **CLEAR** | Prior cool-bright unlit strip replaced; NormalBlending + Lambert hemi, no additive |
| Packed-snow albedo language | **PASS** | Albedo keyed to `MaterialLibrary` packed `0xb2a898` + denser floor `0x5e574e` |
| Darker denser channel vs groom | **PASS** | `max_speed` pixels: lit groom ≈95,93,94 vs trail mid ≈71,73,74 (~25% darker pack scar) |
| Glow / UV neon edge | **PASS** | No emissive; soft lip feather only; warm grey-brown not cyan |
| True snow deformation | **PARTIAL** | Overlay mesh with AO/channel shading — not tessellated terrain cut; reads as packed scar, not glowing ribbon |

**Trail-specific verdict: PASS** for “flattened packed snow channel” vs arcade ribbon. Spray stays particle-based (unchanged).

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Ridgelines/peaks readable on `course_start` / `carve` / `forest` / `max_speed`. |
| B2_forest | **PASS** | Dense flank timber walls; continuous forest canyon. |
| B3_shadows | **PASS** | Directional casts under trees + rider on corduroy. |
| B4_corduroy | **PASS** | Grooves readable; packed trail interrupts as denser scar on `max_speed`. |
| B5_snow_color | **PASS** | Tonal warm/cool; still muddy vs alpine white (μ≈72). |
| B6_furniture | **PASS** | Fence / race markers readable mid-line on gate + max_speed. |
| B7_rider | **PASS** | Contrast kit + board readable. |
| B8_camera | **PASS** | Midfield timber pack holds; chase fills frame. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible. |
| B10_no_float | **PASS** | Tree bases planted. |
| B11_atmosphere | **PASS** | Cool aerial depth; canopy separation. |

**Binary tally: 11 PASS / 0 FAIL → user-ref binary gate PASS.**

Loud first-viewport read: **Board wake is a darker packed scar (not neon). Carve still often air/slow so use `max_speed` for trail evidence. Rubric floors still open.**

## Rubric (mean = **5.70**, gameplay mean = **4.50**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 6 | Muddy fill (μ≈72); soft umbras hold |
| snow | 5 | Muddy brown-grey vs alpine white; corduroy + packed scar |
| terrain | 6 | Amphitheater peaks grounded |
| materials | 5 | Peaks/apron plastic; packed trail matches groom language |
| atmosphere | 6 | Cool depth; forest canyon solid |
| rider | 7 | Contrast kit |
| animation | 6 | Held lean when grounded carve |
| camera | 7 | Midfield pack holds |
| vfx | 5 | Packed-snow BoardTrail lands; spray still thin on carve stills |
| ui | 7 | In-run HUD holds |
| course_composition | 7 | Timber walls + furniture |
| readability_at_speed | 6 | Fall line readable; trail scar helps line memory |
| physics_believability | 5 | Planted when grounded; carve macro often slow/air |
| control_feel | 4 | Neutral (not in stills) |
| trick_satisfaction | 3 | Park probe not re-run this tip |
| audio_feedback | 5 | Neutral |
| performance | 6 | ~409–432k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 6 | Playable chase |
| art_direction | 5 | Trail less arcade; snow still muddy vs alpine refs |

**Disqualifiers:** none (`empty_mountain` / `lonely_props` / `no_sun_shadows`).

## Top blockers → fan-out owners

1. **Muddy dark snow vs alpine white** → `materials` (+ `lighting`)
2. **Carve capture often air/slow** → `capture` / `physics` — trail evidence needs grounded speed macros
3. **Rubric floors** — mean **5.70** / gameplay **4.50** vs ≥8.5 / ≥9

## Delta vs tip `6a20fd8` (arcade ribbon)

| Item | 6a20fd8 | **f52fc36** |
|------|---------|------------|
| BoardTrail | Cool bright unlit ribbon | Packed albedo + denser AO channel |
| Trail pixels vs groom | n/a / glowing | **Darker pack scar** (71 vs 95) |
| Binary | PASS | **PASS** |
| vfx rubric | 3 | **5** |

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-f52fc36.json --label tip-f52fc36 --fps 500
```

Expected: **exit 1** (rubric floors — binary alone is PASS).
