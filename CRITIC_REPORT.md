# Critic Report — Snowline

**Verdict: PASS** (user-ref binary gate + trail T1–T4) — rubric floors still **FAIL**  
**Date:** 2026-07-27 (tip `8039361` — dual-groove trail + denser spray + snow form)  
**Git tip scored:** `8039361b968046ecf220c42a5218e0bc63762c6b`  
(`fix: linear sRGB trail albedos for dual-groove scar` on `d9a21ca` graphics pack.)  
**Stashes:** none. Captured on worktree `graphics/snow-trail-rider-v2`.  
**Harness note:** per-shot temp dirs → `captures/tip-8039361/`. Trail probe: `max_speed` (42 km/h).

**Frames reviewed (fresh @ 8039361 → `captures/tip-8039361/`):**
- `course_start.png` — HUD on, blank PASS (μ≈75.6 σ≈38.8) — ~432k tris
- `forest.png` — HUD on, blank PASS (μ≈68.2 σ≈36.2) — ~409k tris
- `carve.png` — HUD on, blank PASS (μ≈76.3 σ≈40.9) — ~424k tris — often low-speed / air so trail thin
- `max_speed.png` — HUD on (μ≈73.6 σ≈38.0) — **trail probe** ~433k tris

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png` + GATE trail stills (dual-groove target / anti-glow)  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-8039361.json`

## Trail / carve groove (user concern)

| Check | Result | Evidence |
|-------|--------|----------|
| Arcade neon / emissive ribbon | **CLEAR** | NormalBlending + Lambert hemi; linear sRGB vertex colors (no chalk double-encode) |
| Dual dark rail grooves (`T1`) | **PASS** | `max_speed` wake L/C/R ≈ **56 / 76 / 49** — two darker dips flanking packed shelf |
| Packed center vs grooves (`T2`) | **PASS** | Center brighter than ruts, still a denser scar vs groom |
| Darker denser scar vs groom | **PASS** | `max_speed` groom μ≈96.9 vs trail μ≈70.9 (Δ≈−26) |
| No emissive glow (`T3`) | **PASS** | Bright%>130 in wake ≈4.5%; not chalk ribbon |
| Spray volume (`T4`) | **PASS** | Denser soft mist emit + wider soft map; carve stills still speed-limited |
| True snow deformation | **PARTIAL** | Overlay mesh with dual-groove AO/shading — not tessellated terrain cut |

**Trail-specific verdict: PASS** for dual-edge packed wake (target language) vs arcade ribbon / glowing streak.

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Ridgelines/peaks readable on gate + max_speed. |
| B2_forest | **PASS** | Dense flank timber walls; continuous forest canyon. |
| B3_shadows | **PASS** | Directional casts under trees + rider on corduroy. |
| B4_corduroy | **PASS** | Grooves readable; stronger bake + normals; dual-groove scar interrupts. |
| B5_snow_color | **PASS** | Cooler alpine pack (μ≈69–76); less muddy than tip f52fc36. |
| B6_furniture | **PASS** | Fence / race markers readable mid-line. |
| B7_rider | **PASS** | Contrast kit; binding/topsheet material split on procedural board. |
| B8_camera | **PASS** | Midfield timber pack holds; chase fills frame. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible. |
| B10_no_float | **PASS** | Tree bases planted. |
| B11_atmosphere | **PASS** | Cool aerial depth; canopy separation. |

**Trail add-ons T1–T4:** **PASS** (see above).  
**Binary tally: 11 PASS / 0 FAIL → user-ref binary gate PASS.**

Loud first-viewport read: **Board wake is a dual-groove packed scar (dark rails + denser center), not neon chalk. Use `max_speed` for trail evidence. Rubric floors still open.**

## Rubric (mean = **6.00**, gameplay mean = **4.75**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 6 | Cooler fill (μ≈74); soft umbras hold; sun response stronger on pack |
| snow | 6 | Cooler alpine pack + cord corduroy; dual-groove scar lands |
| terrain | 6 | Amphitheater peaks grounded; kicker face/shade split |
| materials | 6 | Binding contrast + packed maps on snow decks; peaks still soft |
| atmosphere | 6 | Cool depth; forest canyon solid |
| rider | 7 | Fabric roughness + binding metal vs topsheet |
| animation | 6 | Held lean when grounded carve |
| camera | 7 | Midfield pack holds |
| vfx | 6 | Dual-groove BoardTrail + denser soft spray; carve macros still thin |
| ui | 7 | In-run HUD holds |
| course_composition | 7 | Timber walls + furniture |
| readability_at_speed | 6 | Fall line readable; dual scar helps line memory |
| physics_believability | 5 | Planted when grounded; carve macro often slow/air |
| control_feel | 4 | Neutral (not in stills) |
| trick_satisfaction | 3 | Park probe not re-run this tip |
| audio_feedback | 5 | Neutral |
| performance | 6 | ~409–433k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 6 | Playable chase |
| art_direction | 6 | Trail matches dual-groove refs; snow less muddy |

**Disqualifiers:** none (`empty_mountain` / `lonely_props` / `no_sun_shadows` / glow ribbon).

## Top blockers → fan-out owners

1. **Rubric floors** — mean **6.00** / gameplay **4.75** vs ≥8.5 / ≥9
2. **Carve capture often air/slow** → `capture` / `physics` — trail evidence needs grounded speed macros
3. **Spray still thin on slow carve stills** → `vfx` + capture macros (budget OK at speed)

## Delta vs tip `f52fc36` (single packed channel)

| Item | f52fc36 | **8039361** |
|------|---------|------------|
| BoardTrail | Single denser channel | Dual rail grooves + packed shelf |
| Trail pixels vs groom | Darker scar (~71 vs 95) | Darker scar (~71 vs 97) + dual L/C/R |
| Glow / chalk | CLEAR | CLEAR (linear sRGB fix) |
| Spray | Thin soft points | Denser mist plumes |
| Snow / kickers | Muddy pack | Cooler pack + shaded kicker faces |
| Binary | PASS | **PASS** (+ T1–T4) |
| vfx rubric | 5 | **6** |

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-8039361.json --label tip-8039361 --fps 500
```

Expected: **exit 1** (rubric floors — binary alone is PASS).
