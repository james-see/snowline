# Origin

This project was built by an AI agent (Cursor) fanning out work to parallel
subagents from a single production brief for an original browser arcade
snowboarding game. This file records that brief’s intent, the decisions that
shaped the plan, and the parts of the brief that were reasonably challenged.

## The original prompt

The user asked for a complete, original, AAA-quality arcade snowboarding game
running entirely in the browser on TypeScript, Three.js, WebGL2, Rapier, Vite,
Playwright, Sharp, and the Web Audio API — Hitscan-style architecture, depth-first
vertical slice first, then three courses and full modes, with an automated
capture/critic/gate loop.

## Pushback before planning

One part of the brief was not accepted as written: **looping until the game
objectively looks better than a modern AAA console title is not a reachable
termination condition.**

What was targeted instead is a top-tier **browser** snowboarding game with a
bounded numeric rubric, dynamic + temporal capture probes, and concrete exit
thresholds (no critical category below 8/10, visual mean ≥ 8.5, gameplay feel ≥ 9,
60 FPS target, no critical bugs).

Third-party reference screenshots are not committed. Subagent “done” claims are
not trusted without build/test/capture evidence.

## Planning decisions

1. **Title / identity:** Snowline — original alpine arcade racer.
2. **License:** AGPL-3.0-or-later (browser-served copyleft, same rationale as Hitscan).
3. **Renderer:** WebGL2 + hand-rolled post stack (not WebGPU; not pmndrs postprocessing as primary).
4. **Assets:** CC0 / permissive only, vendored via `tools/assets/`, with procedural fallbacks so the game runs offline.
5. **Scope:** Depth-first Alpine Flow vertical slice, then Timberline + Summit Drop and full modes.
6. **Engine:** Hitscan-style `GameModule` + EventBus + fixed 120 Hz sim + `window.__snowline` capture bridge.
7. **Physics:** Arcade kinematic board with multi-ray sensing; Rapier for world solidity — not a free rigid board and not a generic capsule slide.

## Critic loop lessons (inherited from Hitscan)

- Frozen captures after temporal convergence can hide flicker and exposure pumping — use dynamic `perform()` scenarios and flicker probes.
- Static presets with no player action score VFX poorly — drive real input.
- Absolute frame-time samples can drift; treat within-session deltas and 60 FPS playability as the performance gate.
