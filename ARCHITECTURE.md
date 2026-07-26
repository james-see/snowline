# Architecture

Hitscan-style custom browser game (not Unity/Godot).

## Loop

`Engine` runs fixed simulation at 120 Hz with an accumulator. Modules implement optional `fixedUpdate` / `update` / `lateUpdate`. Rendering interpolates via `time.alpha`. Capture mode pins frames and can zero `time.scale`.

## Modules

Modules never import each other. Communication is through typed `EventBus` and `EngineContext.getModule` for rare reads.

Order (approx): render → course → flow → rider → score → vfx → audio → ui → camera.

## Physics

`RapierPhysics` wraps `@dimforge/rapier3d-compat`. Terrain uses heightfields; props use boxes/capsules/trimeshes. The rider is a **kinematic** body written by `BoardPhysics` after arcade integration (edge grip, lean, surfaces, air tricks).

## Capture

`window.__snowline` exposes `ready`, `setShot`, `step`, `converge`, `hold`, `perform`, `stats`. Playwright drives Chromium; CDP screenshots at 2560×1440.
