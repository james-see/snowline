# User-ref gate (pass/fail)

Compare Snowline captures to:

| Ref | File | Bar |
|-----|------|-----|
| Alpine groom | `refs/snowboard/images/user_ref_alpine_groom.png` | Dense forest, peaks + haze, corduroy + **long sun shadows**, banners, vivid rider |
| Race tunnel | `refs/snowboard/images/user_ref_race_tunnel.png` | Authored race features, line paint, banners, tunnel/arch, packed trees |
| SSX chase | `refs/snowboard/images/user_ref_ssx_chase.png` | Chase cam energy, HUD, lift/props density, trick callout, readable mountain |

## Trail / snow visual language (2026-07-27 user stills)

External screenshots under Cursor assets (not vendored into `refs/`):

| Role | File (basename) | Bar |
|------|-----------------|-----|
| **TARGET trail** | `Screenshot_2026-07-27_at_12.11.04_AM-…png` | Two **dark parallel edge grooves**, brighter flattened packed center, soft feathered lips, AO in ruts, light powder at board |
| Less preferred | `Screenshot_2026-07-27_at_12.11.20_AM-…png` | Thin arcade parallel lines only — readable but flat, no packed shelf |
| **ANTI-PATTERN** | `Screenshot_2026-07-27_at_12.11.58_AM-…png` | Glowing white / emissive streak — never ship |
| **TARGET hills** | `Screenshot_2026-07-27_at_12.12.30_AM-…png` | Soft snow volume + directional shadows; deep carved ruts with groove shadow; rider/board material contrast; denser spray plumes |

Trail binary add-ons (any FAIL fails trail quality even if B1–B11 pass):

| ID | PASS when |
|----|-----------|
| `T1_dual_groove` | Wake shows two darker rail grooves, not a single neon ribbon or chalk streak |
| `T2_packed_center` | Center between grooves reads brighter/flatter packed snow |
| `T3_no_emissive` | NormalBlending / Lambert only — zero additive glow |
| `T4_spray_volume` | Carve/max_speed shows soft plume volume (not sparse dots) |

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

## Current score (2026-07-27, tip `f52fc36` — packed-snow BoardTrail — see `CRITIC_REPORT.md`)

| Check | Result |
|-------|--------|
| B1_peaks | **PASS** — ridgelines behind timberline |
| B2_forest | **PASS** — dense flank walls (~409–432k tris) |
| B3_shadows | **PASS** — soft directional casts on corduroy |
| B4_corduroy | **PASS** — grooves readable; packed trail scar on `max_speed` |
| B5_snow_color | **PASS** — tonal range; darker muddy vs alpine white (μ≈72) |
| B6_furniture | **PASS** — fence / race markers on gate |
| B7_rider | **PASS** — contrast kit |
| B8_camera | **PASS** — midfield timber pack holds |
| B9_hud | **PASS** |
| B10_no_float | **PASS** |
| B11_atmosphere | **PASS** — cool aerial; canopy depth |

**Trail:** packed denser channel (**PASS** vs arcade ribbon) — groom≈95 vs trail≈71 on `max_speed`.  
**Verdict: PASS** (binary 11/0). Rubric mean ≈ **5.70** vs floors ≥8.5 — quality bar still open.
