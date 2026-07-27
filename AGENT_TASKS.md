# Agent Tasks — Critic routing (2026-07-26)

Source: fresh captures `run-48290` / `run-48610` / `run-48808` after P0/P1 merges + `86ca8a7` apron stack-overflow fix.  
Critic verdict: **FAIL** (mean **4.15**, was 3.65). See `CRITIC_REPORT.md`, `captures/verdict.json`.

Ownership: `AGENT_OWNERS.md`. Do **not** cross-edit other agents' files.

**HARD — worktree required:** Every concurrent owner works in `~/.cursor/worktrees/<id>/snowline-...` on **their** branch. Primary `/Users/jc/p/snowline` on `main` is integrator-only (clean merges + critic). Merge agents: dirty tree → **abort** and tell parent — **never stash**. Before merge: `./scripts/require-clean-main.sh`. See `AGENT_OWNERS.md`.

---

## DONE (prior tickets — credited)

| Ticket | Owner | Evidence |
|--------|-------|----------|
| P0-2 Mountain apron | `agent/course` | Soft berms/shelves beyond strip visible in all three fresh frames |
| P0-3 Void recovery | `agent/physics` | Landed in merge set; not verifiable in stills — keep unit coverage |
| P1-4 Kill flat pale snow (DQ) | `agent/materials` | Mottling clears `flat_white_snow`; residual specular work → new P1-4b |
| P1-6 Carve edge spray (start) | `agent/vfx` | Soft spray in `carve.png`; vfx 2→5 — residual intensity → new P1-6b |
| P1-7 Rider contrast | `agent/rider-art` | Dark gear readable; residual stance → new P1-7b |

---

## P0-1 — Forest trees still float (REOPEN / NOT DONE)

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/props` |
| **Priority** | **P0** |
| **Files** | `src/course/Props.ts`, `src/course/props/physics.ts`, `src/course/CourseModule.ts`, `src/course/TerrainGenerator.ts` (`sampleTerrainAt` / meshWidth bed Y) |
| **Problem** | `run-48610/forest.png` still shows tree cluster hovering above the ridge despite snap merges (`f699910`, `11de41c`). course_start trees look planted; forest section does not. |
| **Acceptance** | Next `npm run capture -- --shot forest`: every trunk base intersects snow mesh; critic must not call out floating props. Physics colliders match snapped visual Y. |
| **Commit message** | `props: fix forest-section terrain snap on apron mesh` |

---

## P0-5 — Sun + contact shadows must show in captures

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/lighting` |
| **Priority** | **P0** |
| **Files** | `src/render/RenderModule.ts`, `src/render/Pipeline.ts`, `src/render/post/PostStack.ts` |
| **Problem** | Lighting merge claimed; gameplay frames still have **zero** cast shadows under rider/trees — `flat_ambient` DQ remains. |
| **Acceptance** | Gameplay captures show clear sun side + contact shadow under rider/trees; critic clears `flat_ambient`. |
| **Commit message** | `lighting: make sun and contact shadows visible in gameplay` |

---

## P1-4b — Snow specular + powder/packed response

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/materials` |
| **Priority** | **P1** |
| **Files** | `src/render/materials/MaterialLibrary.ts`, `src/render/materials/proceduralMaps.ts`, `src/render/materials/pbrMaps.ts`, `src/course/surfaces.ts` |
| **Problem** | Mottling cleared flat-white DQ; snow still lacks sun specular and powder vs packed differentiation. |
| **Acceptance** | Captures show readable specular variation; powder vs packed distinguishable; snow score moving toward ≥8. |
| **Commit message** | `materials: snow specular and powder/packed response` |

---

## P1-6b — Intensify carve edge spray

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/vfx` |
| **Priority** | **P1** |
| **Files** | `src/vfx/VfxModule.ts`, `src/vfx/BoardTrail.ts`, `src/vfx/ParticlePool.ts` |
| **Problem** | Soft spray exists but sparse/low-energy — does not sell edge load. |
| **Acceptance** | `carve` capture shows dense, grounded edge spray integrated with board/snow; vfx ≥7 path. |
| **Commit message** | `vfx: denser grounded carve edge spray` |

---

## P1-7b — Carve-ready stance

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/rider-art` |
| **Priority** | **P1** |
| **Files** | `src/rider/visual/RiderVisual.ts`, `src/rider/visual/buildProceduralRig.ts` |
| **Problem** | Contrast gear landed; carve frames still near-upright with weak knee/edge compression. |
| **Acceptance** | Carve captures show knee flex / edge-ready stance matching board yaw. |
| **Commit message** | `rider-art: carve-ready knee flex and edge stance` |

---

## P1-9 — Capture regression for floating props

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/capture` |
| **Priority** | **P1** (elevated from P2 — float survived merges) |
| **Files** | `tools/critic/capture.mjs`, `tools/critic/blank-frame.mjs`, related probes under `tools/critic/` |
| **Problem** | Blank-frame gate does not catch floating props; forest still ships float after snap merges. |
| **Acceptance** | Probe fails capture if prop Y ≫ terrain sample at same XZ; forest re-run after props fix. |
| **Commit message** | `capture: probe floating props vs terrain sample` |

---

## P2-8 — In-run HUD

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/ui` |
| **Priority** | **P2** |
| **Files** | `src/ui/UiModule.ts`, `src/ui/styles.css` |
| **Problem** | Gameplay captures have no speed/trick/score/boost HUD. |
| **Acceptance** | Gameplay captures show restrained in-run HUD; title brand strength unchanged. |
| **Commit message** | `ui: show in-run HUD on gameplay captures` |

---

## P2-10 — Feature sculpt on apron

| Field | Value |
|-------|-------|
| **Owning branch** | `agent/course` |
| **Priority** | **P2** |
| **Files** | `src/course/TerrainGenerator.ts`, `src/course/CourseDefs.ts`, `src/course/SplinePath.ts` |
| **Problem** | Apron continuity landed as soft empty hills — no readable kickers, tree-line beats, or banked features. |
| **Acceptance** | Captures show intentional features spaced for flow; course_composition moves off soft-corridor look. |
| **Commit message** | `course: sculpt berms kickers and tree-line beats` |

---

## Integration order (main agent)

1. **props** forest snap fix → recapture `forest` (must kill float)
2. **lighting** visible sun/shadows → clear `flat_ambient`
3. **capture** float probe (lock the win)
4. Materials specular + VFX density + rider stance
5. UI HUD + course feature sculpt
6. Critic rescore + `npm run gate -- --verdict captures/verdict.json --fps 60`
