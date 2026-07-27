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
| Snow/rock/ice/wood/fabric PBR | Poly Haven CC0 (`snow_floor`, `pine_bark`, `brown_planks_07`, `hessian_230`, …) |
| Tree meshes | Kenney Nature Kit CC0 pines → `public/assets/models/trees/*.glb` (~17 KB, ~230 tris) |
| HDRI | Poly Haven CC0 |
| Rider/board | Procedural meshes (original) |
| Audio | Procedural Web Audio (original) |
| Fonts | Syne / DM Sans (OFL) |

Do **not** ship Poly Haven full pine models (e.g. `fir_sapling`) — too heavy for High LOD (~96 trees).
