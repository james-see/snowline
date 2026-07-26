# Assets

All shipped third-party assets must be CC0 or similarly permissive. Provenance is recorded by `tools/assets/sources.mjs` and written into `public/assets/manifest.json` after `npm run assets:all`.

Procedural fallbacks (noise textures, synth audio, authored primitive props) keep the game playable without network fetches.

| Kind | Source strategy |
|------|-----------------|
| Snow/rock/ice PBR | Poly Haven CC0 via fetch/pack |
| HDRI | Poly Haven CC0 |
| Rider/board | Procedural meshes (original) |
| Audio | Procedural Web Audio (original) |
| Fonts | Google Fonts Syne / DM Sans (OFL) |
