# Asset pipeline

Offline tooling that turns CC0 source material into runtime assets under
`public/assets/`, plus the `manifest.json` the game loads at boot.

Sources: [Poly Haven](https://polyhaven.com) textures/HDRIs and
[Kenney Nature Kit](https://kenney.nl/assets/nature-kit) pine OBJs.

## Running

```bash
npm run assets:fetch   # download masters into .assetcache/  (network)
npm run assets:pack    # process cache into public/assets/  (no network)
npm run assets:all     # both
```

If Poly Haven / Kenney is unreachable, `fetch.mjs` generates procedural placeholder
texture masters and skips kit extract so the pipeline still completes:

```bash
node tools/assets/fetch.mjs --placeholders-only   # skip network entirely
```

`node tools/assets/fetch.mjs --force` re-downloads everything. By default any file
already in the cache with matching size and md5 is skipped.

`node tools/assets/pack.mjs --size 1024` packs to a smaller runtime budget.

| File | Role |
| --- | --- |
| `sources.mjs` | Materials, HDRIs, kits, tree OBJ list. |
| `fetch.mjs` | Poly Haven + Kenney zip → `.assetcache/` (gitignored). |
| `pack.mjs` | ORM pack, `obj2gltf` → GLB trees, Basis transcoder, manifest. |

## Output

```
public/assets/manifest.json
public/assets/textures/<id>_albedo.webp
public/assets/textures/<id>_normal.jpg
public/assets/textures/<id>_orm.jpg
public/assets/models/trees/tree_pine_{0,1,2}.glb
public/assets/env/alpine_noon.hdr
public/assets/env/summit_dawn.hdr
public/basis/                        Basis Universal transcoder, copied from three
```

### Materials

| id | Use |
| --- | --- |
| `snow_groom` | Packed groom (`snow_floor`) |
| `snow_powder` | Off-piste and landings |
| `rock_face` / `rock_scree` | Cliffs / scree |
| `ice_glass` / `ice_frost` | Race ice / frost (`snow_02` / `snow_03`) |
| `wood_bark` | Trunks / timber (`pine_bark`) |
| `wood_plank` | Ramps / furniture (`brown_planks_07`) |
| `fabric_banner` | Banners / flags (`hessian_230`) |

### Trees

Kenney `tree_pineDefaultA` / `TallA` / `RoundA` → GLB via `obj2gltf` (devDependency).
Runtime scale ×5.5. `Resources.preload` loads `manifest.models`; `buildTree` uses them
for instancing (bark + leafs → separate `InstancedMesh`es), falling back to procedural cones.

### ORM packing

Occlusion → R, roughness → G, metalness → B. Prefer authored maps, then `arm`, then constants.

### Format

WebP albedo, JPEG 4:4:4 normal/ORM. KTX2 upgrade path if `toktx` is installed.

## Licensing

Poly Haven + Kenney assets are [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Placeholders are marked `generated-placeholder` in the manifest.
