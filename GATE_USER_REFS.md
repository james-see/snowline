# User-ref gate (pass/fail)

Compare Snowline captures to:

| Ref | File | Bar |
|-----|------|-----|
| Alpine groom | `refs/snowboard/images/user_ref_alpine_groom.png` | Dense forest, peaks + haze, corduroy + **long sun shadows**, banners, vivid rider |
| Race tunnel | `refs/snowboard/images/user_ref_race_tunnel.png` | Authored race features, line paint, banners, tunnel/arch, packed trees |
| SSX chase | `refs/snowboard/images/user_ref_ssx_chase.png` | Chase cam energy, HUD, lift/props density, trick callout, readable mountain |

**“Perfect” for this loop** = all binary checks **PASS** on `course_start` + `forest` + `carve` (browser arcade fidelity — match *readability/density/lighting language*, not console polycount).

## Binary checks (any FAIL = gate FAIL)

| ID | Check | Owner | PASS when |
|----|-------|-------|-----------|
| `B1_peaks` | Mountain silhouette / distant peaks in frame | course | Horizon shows ridgelines/peaks, not empty sky band only |
| `B2_forest` | Tree density | props | Dozens of planted trees forming a forest belt (not ≤5 lonely cones) |
| `B3_shadows` | Directional sun + contact | lighting | Long/readable shadows on snow under rider and trees |
| `B4_corduroy` | Groom texture | materials | Visible corduroy / packed grooves on race strip |
| `B5_snow_color` | Snow not flat grey plastic | materials | Warm/cool tonal range; specular response under sun |
| `B6_furniture` | Course furniture | props | ≥1 banner/fence/gate readable near line (alpine groom / race language) |
| `B7_rider` | Rider reads as athlete | rider-art | High-contrast gear; carve lean; board readable |
| `B8_camera` | Framing sells the mountain | camera | Rider not tiny midfield void; mountain/trees fill frame like refs |
| `B9_hud` | In-run HUD | ui | Speed + score/combo (or time) visible on gameplay shots |
| `B10_no_float` | Props planted | props | Zero floating trees/rocks |
| `B11_atmosphere` | Depth haze | lighting/atmosphere | Near/far separation (aerial perspective), not flat sky fill |

## Rubric floors (same as GATE + user bar)

- Every category ≥ 8, gameplay ≥ 9, mean ≥ 8.5, zero disqualifiers
- Extra disqualifiers for this loop: `empty_mountain` (no peaks/forest), `lonely_props` (sparse furniture), `no_sun_shadows`

## Current score (2026-07-26, tip `343b624` — see `CRITIC_REPORT.md`)

| Check | Result |
|-------|--------|
| B1_peaks | **PASS** — amphitheater + dark rock mass |
| B2_forest | **FAIL** — harsh; spaced cones ≠ alpine timberline belts |
| B3_shadows | **PASS** — long sun casts on corduroy |
| B4_corduroy | **PASS** |
| B5_snow_color | **PASS** — warm muddy strip |
| B6_furniture | **FAIL** — harsh; park rails/boxes invisible on `grind`; thin fences only |
| B7_rider | **PASS** — carve lean + contrast |
| B8_camera | **FAIL** — midfield empty corduroy / grind apron void |
| B9_hud | **PASS** |
| B10_no_float | **PASS** |
| B11_atmosphere | **PASS** — cool aerial; milk void cleared |

**Verdict: FAIL.** 8 PASS / 3 FAIL. Rubric mean ≈ **5.25** vs user refs.
