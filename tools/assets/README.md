# Asset pipeline

Offline tooling that turns CC0 source material from [Poly Haven](https://polyhaven.com)
into runtime assets under `public/assets/`, plus the `manifest.json` the game loads at boot.

## Running

```bash
npm run assets:fetch   # download masters into .assetcache/  (network)
npm run assets:pack    # process cache into public/assets/  (no network)
npm run assets:all     # both
```

If Poly Haven is unreachable, `fetch.mjs` generates procedural placeholder masters
(snow, rock, ice textures and flat HDRIs) so the pipeline still completes:

```bash
node tools/assets/fetch.mjs --placeholders-only   # skip network entirely
```

`node tools/assets/fetch.mjs --force` re-downloads everything. By default any file
already in the cache with matching size and md5 is skipped.

`node tools/assets/pack.mjs --size 1024` packs to a smaller runtime budget.

| File | Role |
| --- | --- |
| `sources.mjs` | Asset list: slugs, tile scales, notes. Edit to change the set. |
| `fetch.mjs` | Downloads from Poly Haven into `.assetcache/` (gitignored). Falls back to placeholders on failure. |
| `pack.mjs` | Resizes, packs ORM, copies Basis transcoder, writes manifest. |

## Output

```
public/assets/manifest.json
public/assets/textures/<id>_albedo.webp
public/assets/textures/<id>_normal.jpg
public/assets/textures/<id>_orm.jpg
public/assets/env/alpine_noon.hdr
public/assets/env/summit_dawn.hdr
public/basis/                        Basis Universal transcoder, copied from three
```

Six materials for snowboarding terrain:

| id | Use |
| --- | --- |
| `snow_groom` | Packed groom runs |
| `snow_powder` | Off-piste and landings |
| `rock_face` | Cliff outcrops and chutes |
| `rock_scree` | Ridge scree and runouts |
| `ice_glass` | Race ice and glazed patches |
| `ice_frost` | Frosted transitions at tree line |

Two environment HDRIs: `alpine_noon` (default course) and `summit_dawn` (vista/title).

### ORM packing

Occlusion → R, roughness → G, metalness → B in one texture. Sources prefer individually
authored maps, then Poly Haven's `arm` pack, then constants.

### Format

WebP for albedo (colour), JPEG 4:4:4 for normal and ORM (linear data channels).
KTX2 is the upgrade path if `toktx` is installed.

### Tiling

`tileScale` is world metres per texture repeat. The engine derives UV repeat from
surface size divided by `tileScale`.

## Licensing

Poly Haven assets are [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Placeholder assets generated offline are marked `generated-placeholder` in the manifest.
