# Architecture

Hitscan-style custom browser game (not Unity/Godot).

## Loop

`Engine`: fixed 120 Hz sim with accumulator. Modules: optional `fixedUpdate` / `update` / `lateUpdate`. Render interpolates via `time.alpha`. Capture pins frames and can zero `time.scale`.

## Modules

No cross-imports. Communicate via typed `EventBus`; rare reads via `EngineContext.getModule`.

Approx order: render → course → flow → rider → score → vfx → audio → ui → camera.

Ownership by branch: [AGENT_OWNERS.md](AGENT_OWNERS.md).

## Physics

`RapierPhysics` (`@dimforge/rapier3d-compat`). Terrain heightfields; props boxes/capsules/trimeshes. Rider is **kinematic** — written by `BoardPhysics` (edge grip, lean, surfaces, air tricks).

## Render / post

Forward HDR → hand-rolled `PostStack` (tonemap/bloom/mild grade). Not WebGPU; not pmndrs postprocessing as primary. Over-aggressive fog/exposure → blank-sky whiteout (see KNOWN_ISSUES).

## Capture

`window.__snowline`: `ready`, `setShot`, `step`, `converge`, `hold`, `perform`, `stats`. Playwright drives Chromium; CDP @ 2560×1440.
