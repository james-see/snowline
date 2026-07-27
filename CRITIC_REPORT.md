# Critic Report — Snowline

**Verdict: FAIL** (user-ref gate)  
**Date:** 2026-07-26 (evening, park + gamepad on forest/camera stack)  
**Git tip scored:** `343b624c8ad68fc2e089b3b03b22fe8f7bf857c0`  
(`Merge branch 'course/rails-jumps-park'` — includes gamepad `4816af7`, forest `4ffc2ac`, camera `7cdfd71`, prior peaks/lighting. Note: `main` has since advanced with checkpoint + tip-0fb692c critic; this score is the park tip the director requested.)  
**Stashes:** none created/applied. Captured from detached critic WT (`~/.cursor/worktrees/critic-343b624/snowline-critic`) after main briefly went dirty mid-foreign-merge.  
**Harness note:** `capture.mjs` `rm`s `--out` each run — assembled via per-shot temp dirs. Gate shots blank-PASS. Park probe: `grind` (only harness park-adjacent action shot).

**Frames reviewed (fresh @ 343b624 → `captures/tip-343b624/`):**
- `course_start.png` — HUD on, blank PASS (μ≈68.1 σ≈29.8)
- `forest.png` — HUD on, blank PASS (μ≈63.6 σ≈39.5)
- `carve.png` — HUD on, blank PASS (μ≈53.6 σ≈36.1)
- `grind.png` — HUD on, blank PASS (μ≈57.2 σ≈39.5) — park probe

**Refs:** `refs/snowboard/images/user_ref_{alpine_groom,race_tunnel,ssx_chase}.png`  
**Gate doc:** `GATE_USER_REFS.md`  
**Verdict JSON:** `captures/verdict-tip-343b624.json`

## Binary checks B1–B11 (any FAIL = gate FAIL)

| ID | Result | Evidence |
|----|--------|----------|
| B1_peaks | **PASS** | Amphitheater + dark rock ridgelines fill horizon in gate shots. |
| B2_forest | **FAIL** | Harsh vs alpine timberline: spaced lonely cones with snow gaps on `course_start` / `carve`; `forest` mid walls denser than pre-v3 but still not packed continuous belts. Alpine groom = wall-to-wall timber — not met. |
| B3_shadows | **PASS** | Long directional casts under trees + rider (`forest` striping strong). |
| B4_corduroy | **PASS** | Packed grooves dominate race strip in all gate shots + grind. |
| B5_snow_color | **PASS** | Warm muddy/tan strip under sun (not flat grey plastic). Still off alpine white. |
| B6_furniture | **FAIL** | Harsh: tip claims rails/jumps/boxes, but `grind` shows empty dark apron + one `SLOW DOWN` board + flag — **zero rail / box / kicker readable**. Gate shots only thin fence lines. Alpine/race-tunnel banner density not met under harsh bar. |
| B7_rider | **PASS** | `carve.png`: deep lean, high-contrast neon accents, red board. |
| B8_camera | **FAIL** | Harsh: midfield remains empty corduroy slab on `carve` / `course_start`; `grind` is almost pure empty groom. Mountain upper-fill ≠ tree/prop-packed alpine/SSX chase. |
| B9_hud | **PASS** | Score, combo, speed, time, CP visible. |
| B10_no_float | **PASS** | Tree bases sit on snow; no obvious floaters. |
| B11_atmosphere | **PASS** | Cool blue-grey aerial depth with near/far separation. |

**Binary tally: 8 PASS / 3 FAIL → gate FAIL.**

Loud first-viewport read: **same sparse timberline + midfield void as 0fb692c; park merge invisible on camera**.

## Rubric (mean = **5.25**, gameplay mean = **4.25**)

| Category | Score | Note |
|----------|------:|------|
| lighting | 7 | Long casts + cool alpine aerial hold |
| snow | 6 | Corduroy + warm strip; muddy vs alpine white |
| terrain | 6 | Amphitheater peaks grounded; still low-poly |
| materials | 5 | Corduroy OK; peaks/apron plastic |
| atmosphere | 6 | Cool depth; milk void stays cleared |
| rider | 7 | Carve lean + contrast kit |
| animation | 6 | Held lean readable in carve |
| camera | 4 | Midfield void; grind frame emptier still (B8) |
| vfx | 3 | Minimal edge spray; grind has no sparks/scrape |
| ui | 7 | In-run HUD holds |
| course_composition | 4 | Park authored off-camera; sparse vs alpine/race |
| readability_at_speed | 5 | Readable; empty midfield helps |
| physics_believability | 5 | Planted; carve sells |
| control_feel | 4 | Neutral (gamepad not visible in stills) |
| trick_satisfaction | 4 | Grind probe never lands on rail/box |
| audio_feedback | 5 | Neutral |
| performance | 7 | ~280–294k tris; capture fps healthy |
| temporal_stability | 6 | Stills clean |
| overall_fun | 4 | Early mountain; park energy absent on frame |
| art_direction | 4 | Mud strip + spaced cones ≠ alpine |

**Disqualifiers:** `lonely_props` (forest + park furniture not reading)  
Cleared vs prior: `empty_mountain`, `no_sun_shadows`.

## Top blockers → fan-out owners

1. **Timberline still not alpine-dense** (B2 / `lonely_props`) → `props` — continuous packed belts in chase midfield, not gapped cones
2. **Midfield corduroy void** (B8) → `camera` + `props` — fill like alpine/SSX; mountain upper-fill insufficient
3. **Park features invisible** (B6 harsh) → `course` + `capture` — rails/jumps/boxes must appear in `grind` (or a dedicated park preset); macro currently frames empty apron
4. **Muddy brown strip vs alpine white** → `materials`
5. **Minimal carve spray / race-tunnel language** → `vfx` + `props`

## Park / grind note

`grind.png` is the harness park-adjacent shot. It does **not** prove rails/boxes shipped visually. Gamepad merge not scorable from stills.

## Delta vs tip `0fb692c`

| Check | 0fb692c | 343b624 |
|-------|---------|---------|
| B1 | PASS | PASS |
| B2 | FAIL | FAIL |
| B3 | PASS | PASS |
| B6 | PASS | **FAIL** (harsh — park invisible on `grind`) |
| B8 | FAIL | FAIL |
| B11 | PASS | PASS |
| tally | 9/2 | **8/3** |
| mean | 5.40 | **5.25** |
| park tip | — | **`d11cb19`** (not on camera) |
| gamepad | — | **`4816af7`** (not in stills) |

Gate-shot luma matches tip-0fb692c (deterministic same forest/camera stack); delta is park probe + harsh B6.

## Gate

```bash
npm run gate -- --verdict captures/verdict-tip-343b624.json --label tip-343b624 --fps 500
```

Expected: **exit 1**.
