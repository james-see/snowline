# SNOWLINE

Original arcade snowboarding in the browser — Three.js, Rapier, WebGL2.

Built end-to-end with a Hitscan-style module architecture and an automated capture/critic quality loop. See [ORIGIN.md](ORIGIN.md).

## Quick start

```bash
npm install
npm run assets:all   # optional CC0 pack; procedural fallbacks work without it
npm run dev
```

Open the printed URL. **Ride** → pick a course → pick a mode.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Unit tests |
| `npm run capture` | Playwright screenshot suite |
| `npm run critic` | Capture + critic briefing |
| `npm run gate` | Apply quality gate to a verdict |

## Controls

A/D carve · Space jump · Shift boost · arrows spin/flip · J/K/L/U grabs · Esc pause. Gamepad supported.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
