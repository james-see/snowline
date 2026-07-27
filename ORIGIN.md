# Origin

Built by a Cursor agent fanning work to parallel subagents from one production brief for an original browser arcade snowboarding game.

## Brief

AAA-quality arcade snowboarding in-browser: TypeScript, Three.js, WebGL2, Rapier, Vite, Playwright, Sharp, Web Audio. Hitscan-style architecture; depth-first vertical slice, then three courses + full modes; automated capture/critic/gate loop.

## Pushback

“Loop until objectively better than a modern AAA console title” is not a reachable exit. Target: top-tier **browser** snowboarder with a bounded rubric (no critical category < 8/10, visual mean ≥ 8.5, gameplay feel ≥ 9, 60 FPS, no critical bugs).

Third-party **game** screenshots are not committed. Fetch local critic refs with `npm run refs:fetch` (see `refs/snowboard/`). Subagent “done” claims require build/test/capture evidence.

## Decisions

1. **Title:** Snowline — original alpine arcade racer.
2. **License:** AGPL-3.0-or-later.
3. **Renderer:** WebGL2 + hand-rolled post (not WebGPU; not pmndrs post as primary).
4. **Assets:** CC0 / permissive via `tools/assets/`; procedural fallbacks offline.
5. **Scope:** Alpine Flow slice → Timberline + Summit Drop + modes.
6. **Engine:** `GameModule` + EventBus + 120 Hz sim + `window.__snowline`.
7. **Physics:** Arcade kinematic board + multi-ray sensing; Rapier for world solidity.
8. **Snow volume:** Smooth groomed race PATH (no mesh moguls). Volume via corduroy normals, wrap SSS, and anisotropic sparkles on MeshPhysicalMaterial (`onBeforeCompile`) — never mutate fragment UV varyings (breaks WebGL compile). Poly Haven `snow_floor` → `snow_groom` with procedural corduroy bake.

## Critic lessons

- Frozen captures hide flicker — use dynamic `perform()` + flicker probes.
- Static presets score VFX poorly — drive real input.
- Absolute frame times drift — gate on within-session deltas + 60 FPS playability.
- Title-green + blank gameplay sky is a hard fail (see KNOWN_ISSUES).
