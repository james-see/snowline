# Testing

## Exact commands

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run preview
npm run assets:all
npm run capture
npm run capture -- --shot title
npm run capture -- --shot course_start
npm run critic
npm run critic -- --label overall
npm run gate -- --verdict captures/latest/verdict.json --fps 60
npm run determinism
node tools/critic/flicker-probe.mjs
```

## Blank-sky smoke

Gameplay captures must not be empty sky:

```bash
npm run capture -- --shot course_start
```

Title-only green is insufficient. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Capture API

`window.__snowline`: `ready`, `setShot`, `step`, `converge`, `hold`, `perform`, `stats`.

Playwright + Chromium; CDP screenshots at 2560×1440.
