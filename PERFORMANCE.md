# Performance

Target: **stable 60 FPS at 1920×1080** on reasonable desktop GPUs (High preset).

```bash
npm run build
npm run capture
npm run gate -- --verdict captures/verdict.json --fps 60
```

Canonical budgets live in `src/engine/Lod.ts` (`resolveLodBudgets`). Quality presets in Settings feed that resolver; runtime systems clamp to the result.

## Frame budget (High @ 1080p)

| Metric | Budget |
|--------|--------|
| Frame time | ≤ 16.6 ms |
| Draw calls | ~150–250 |
| Physics | course chunks / static props near path |
| Particles (snow + spray) | ≤ 2200 snow, ≤ 260 spray |
| Tree instances | ≤ 96 drawn, ≤ 28 shadow-casting |
| Rock instances | ≤ 48 |
| Shadow distance | ≤ 140 m (ortho frustum half-extent 64 m) |
| Procedural textures | 256², anisotropy ≤ 8 |

## Preset table

| Preset | Trees (shadow) | Rocks | Snow | Spray | Shadow dist | Tex |
|--------|----------------|-------|------|-------|-------------|-----|
| Low | 32 (8) | 16 | 700 | 100 | 70 m | 128² / aniso 2 |
| Medium | 64 (16) | 32 | 1600 | 180 | 110 m | 192² / aniso 4 |
| High | 96 (28) | 48 | 2200 | 260 | 140 m | 256² / aniso 8 |
| Ultra | 160 (48) | 80 | 4000 | 400 | 200 m | 256² / aniso 16 |

`lodBias` scales instance/particle counts (clamped 0.35–1.25). Buffer ceilings in `LOD_BUFFER_CAPS` prevent over-allocation.

## Systems

- **Course props** (`Props.ts`): trees and rocks are `InstancedMesh`; counts clamped to Lod caps; near instances cast shadows.
- **VFX** (`VfxModule.ts`): particle budgets from Lod + `maxParticles`.
- **Shadows** (`RenderModule.ts`): sun far plane + ortho frustum from Lod budgets.
- **Resources** (`Resources.ts`): procedural texture size and anisotropy follow Lod at preload.

## Notes

- Forest LOD popping may appear on Low at long view distances (see `KNOWN_ISSUES.md`).
- Capture / critic runs may use a different resolution; still respect the same Lod caps.
- Owned by `agent/perf`.
