# Plan

## Milestone A — Vertical slice (Alpine Flow)

Playable start→results: carve, jump, spins/flips/grabs, grind, boost, scoring, chase cam, HUD, audio/VFX, title/results.

## Milestone B — Full game

- Courses: Alpine Flow, Timberline, Summit Drop
- Modes: Freeride, Time Trial, Trick Attack
- Persistence, medals, cosmetic unlocks
- Keyboard + gamepad, pause, settings, tutorial tip
- Full capture matrix + temporal probes + critic gate

## Milestone C — Acceptance

Clean checkout:

```bash
npm install
npm run assets:all
npm run build
npm run test
npm run capture
npm run critic -- --label overall
npm run gate -- --verdict captures/latest/verdict.json --fps 60
```

Play all courses/modes. No critical rubric category below 8/10; visual mean ≥ 8.5; gameplay feel ≥ 9; 60 FPS; no critical bugs. Blank-sky captures are a hard fail.
