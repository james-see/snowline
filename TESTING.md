# Testing

```bash
npm run typecheck
npm run test
npm run build
npm run capture -- --shot title
npm run critic -- --label overall
npm run gate -- --verdict captures/latest/verdict.json --fps 60
```

Capture API: `window.__snowline` (`ready`, `setShot`, `step`, `hold`, `perform`, `stats`).

Determinism: `npm run determinism`. Temporal: `node tools/critic/flicker-probe.mjs`.
