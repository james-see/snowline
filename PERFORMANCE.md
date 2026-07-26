# Performance

Target: stable 60 FPS at 1920×1080 on reasonable desktop GPUs.

```bash
npm run build
npm run capture
npm run gate -- --verdict captures/latest/verdict.json --fps 60
```

Budgets (High): ≤16.6 ms/frame, ~150–250 draw calls, instanced trees, physics radius via course chunks, particle caps from quality presets, shadow casters = sun + nearby.

Presets: low / medium / high / ultra in Settings. Owned by `agent/perf`.
