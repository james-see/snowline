# Assets

CC0 / similarly permissive only. Provenance: `tools/assets/sources.mjs` → `public/assets/manifest.json` after:

```bash
npm run assets:fetch
npm run assets:pack
# or
npm run assets:all
```

Procedural fallbacks (noise, synth audio, primitive props) keep the game offline-playable.

| Kind | Strategy |
|------|----------|
| Snow/rock/ice PBR | Poly Haven CC0 |
| HDRI | Poly Haven CC0 |
| Rider/board | Procedural meshes (original) |
| Audio | Procedural Web Audio (original) |
| Fonts | Syne / DM Sans (OFL) |
