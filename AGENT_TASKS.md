# Agent Tasks — Critic routing (2026-07-26)

Source: fresh captures `run-38415` / `run-38674` / `run-38863` / `run-39051` + player P0s.  
Critic verdict: **FAIL** (mean **3.65**). See `CRITIC_REPORT.md`, `captures/verdict.json`.

Ownership: `AGENT_OWNERS.md`. Do **not** cross-edit other agents' files.

---

## P0-1 — Snap all props to terrain mesh

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/props` |
| **Priority** | **P0** |
| **Files** | `src/course/Props.ts`, `src/course/props/physics.ts`, `src/course/CourseModule.ts` (extend snap; coordinate with course owner if touching CourseModule), `src/course/TerrainGenerator.ts` (`sampleTerrainAt` / add world-XZ height helper if needed), optionally `src/course/CourseDefs.ts` (authored Y may become unused after snap) |
| **Problem** | `#snapMarkersToTerrain` snaps gates/finish only. Trees/rocks/rails/ramps keep authored Y → **floating trees in `forest.png`**. |
| **Acceptance** | Next `npm run capture -- --shot forest` (and course_start): every tree/rock/rail/ramp trunk/base intersects snow mesh; no props floating in sky. Critic must not call out floating props. Physics colliders match snapped visual Y. |
| **Commit message** | `props: snap trees/rocks/rails to terrain mesh Y` |

---

## P0-2 — Mountain apron beyond playable strip

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/course` |
| **Priority** | **P0** |
| **Files** | `src/course/TerrainGenerator.ts`, `src/course/CourseDefs.ts`, `src/course/CourseModule.ts`, `src/course/SplinePath.ts` (if corridor width / sampling changes), `src/course/surfaces.ts` |
| **Problem** | Terrain reads as a soft grey sheet; leaving the course = void (player-confirmed). Need visual + collision mesh that continues as deep powder berms/shelves off the playable line. |
| **Acceptance** | Off-line ride lands on continuous snow mesh (berms/shelves/powder apron), never empty sky/void. Capture or probe: rider at |lateral| beyond prior corridor still has ground under board. Critic terrain/course_composition notes mountain apron, not infinite plane. |
| **Commit message** | `course: extend powder apron mesh beyond playable strip` |

---

## P0-3 — Never infinite freefall on ray miss

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/physics` |
| **Priority** | **P0** |
| **Files** | `src/rider/BoardPhysics.ts`, `src/rider/tuning.ts`, `src/rider/BoardPhysics.test.ts`, optionally `src/rider/RiderModule.ts` (respawn/recover events) |
| **Problem** | Player: leave course → fall into infinity. `#sampleGround` ray miss / below mesh must soft-recover (powder drag) or respawn — not freefall forever. |
| **Acceptance** | Unit test: all probes miss → recovery or respawn within bounded time/Y, no unbounded Y descent. Playtest: drive off apron edge → soft powder stop or checkpoint respawn, never void. |
| **Commit message** | `physics: powder recovery when terrain ray misses` |

---

## P1-4 — Break flat pale snow

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/materials` |
| **Priority** | **P1** |
| **Files** | `src/render/materials/MaterialLibrary.ts`, `src/render/materials/proceduralMaps.ts`, `src/render/materials/pbrMaps.ts`, `src/render/materials/ids.ts`, `src/course/surfaces.ts` (if surface tint hooks) |
| **Problem** | Disqualifier `flat_white_snow` — pale plastic snow across gameplay frames. |
| **Acceptance** | Next captures show readable micro-detail + specular variation; powder vs packed distinguishable; critic clears `flat_white_snow`. |
| **Commit message** | `materials: powder/packed snow detail kills flat albedo` |

---

## P1-5 — Directional sun + contact shadows

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/lighting` |
| **Priority** | **P1** |
| **Files** | `src/render/RenderModule.ts`, `src/render/Pipeline.ts`, `src/render/post/PostStack.ts` |
| **Problem** | Disqualifier `flat_ambient` — no sun direction or contact shadows on rider/trees/snow. |
| **Acceptance** | Gameplay frames show clear sun side + contact shadow under rider/trees; critic clears `flat_ambient`; no white-out fog return. |
| **Commit message** | `lighting: directional sun and contact shadows on snow` |

---

## P1-6 — Carve edge spray

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/vfx` |
| **Priority** | **P1** |
| **Files** | `src/vfx/VfxModule.ts`, `src/vfx/BoardTrail.ts`, `src/vfx/ParticlePool.ts`, `src/vfx/softPointTexture.ts` |
| **Problem** | `carve.png` intent = edge spray; zero VFX visible. |
| **Acceptance** | Next `carve` capture shows soft edge spray integrated with board/snow; critic vfx ≥8 path started (score moves off 2). |
| **Commit message** | `vfx: emit carve edge spray on grounded turns` |

---

## P1-7 — Readable rider + carve stance

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/rider-art` |
| **Priority** | **P1** |
| **Files** | `src/rider/visual/RiderVisual.ts`, `src/rider/visual/buildProceduralRig.ts`, `src/rider/visual/cosmetics.ts`, `src/rider/visual/loadRiderGltf.ts` |
| **Problem** | Low-contrast white capsule on pale snow; start pose near-idle. |
| **Acceptance** | Rider silhouette readable at speed (gear color vs snow); carve frames show knee flex / edge-ready stance. |
| **Commit message** | `rider-art: contrast gear and carve-ready procedural stance` |

---

## P2-8 — In-run HUD

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/ui` |
| **Priority** | **P2** |
| **Files** | `src/ui/UiModule.ts`, `src/ui/styles.css` |
| **Problem** | Title strong; gameplay captures have no speed/trick/score/boost HUD. |
| **Acceptance** | Gameplay captures show restrained in-run HUD; title unchanged in brand strength. |
| **Commit message** | `ui: show in-run HUD on gameplay captures` |

---

## P2-9 — Capture regression for float + void

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/capture` |
| **Priority** | **P2** |
| **Files** | `tools/critic/capture.mjs`, `tools/critic/blank-frame.mjs`, related scenario/probe scripts under `tools/critic/` |
| **Problem** | Blank-frame gate caught sky voids; does not catch floating props or off-mesh freefall. |
| **Acceptance** | Probe or meta check fails capture if prop Y ≫ terrain sample at same XZ, or rider Y plummets unbounded; forest/carve re-runs after P0 merges. |
| **Commit message** | `capture: probe floating props and off-mesh freefall` |

---

## Integration order (main agent)

1. Merge **props** snap → recapture `forest`
2. Merge **course** apron + **physics** recovery → playtest off-piste
3. Materials + lighting (clear disqualifiers)
4. VFX + rider-art + UI
5. Critic rescore + `npm run gate -- --verdict captures/verdict.json --fps 60`
