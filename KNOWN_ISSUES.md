# Known Issues

## P0 — Blank-sky / whiteout gameplay captures

**Status:** open (fix in progress on parallel branches)

**Symptom:** Title shot looks fine. Gameplay / course captures render as washed-out empty sky — no mountain, no rider.

**Likely causes (triad):**

1. Rider spawn not on terrain mesh (`agent/course`)
2. Chase camera framed into sky (`agent/camera`)
3. Post-stack fog/exposure crushing the frame to white (`agent/lighting`; WIP on `fix/lighting-post-whiteout`)

**Verify fix:**

```bash
npm install
npm run build
npm run capture -- --shot course_start
```

Expect mountain + rider in the shot (not uniform bright sky).

## Other

- Absolute frame-time samples drift between sessions — use within-session deltas; gate on 60 FPS playability.
- Grind detection is proximity/heuristic; steep approaches can miss snap.
- Procedural rider/board are placeholders for later glTF cosmetics.
- Capture `hold()` stability is GPU/driver-sensitive; Metal ANGLE recommended on Apple Silicon.
- Forest LOD popping on Low at long view distances.
