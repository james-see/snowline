# Snowboard critic references

Local visual bar for the capture/critic loop. **Images are not committed** (see `.gitignore`); fetch them with:

```bash
npm run refs:fetch
```

## Why

The rubric alone drifts toward “better than last night.” Side-by-side refs keep scores honest against:

| Kind | Role |
|------|------|
| **Game** (SSX 3, etc.) | Chase cam, course density, HUD, marketing-screenshot bar |
| **Photo** (Commons CC) | Real powder/trees/silhouette/lighting truth |

## Critic usage

`npm run critic` / `tools/critic/run.mjs` appends every present `images/*` path to `CRITIC_BRIEF.txt` with per-ref `lookFor` notes. Critic agents **must open those files** and score Snowline frames relative to them (Snowline is a browser arcade title — match *readability and mountain density*, not console polycount).

Manual drop-ins: put any press/gameplay still under `images/` and add a row to `manifest.json` (or rely on filename heuristics in the brief).

## License

- Commons CC photos: keep attribution in manifest; fine to re-fetch.
- Commercial game screenshots: **local QA only**, fair-use for private critique — do not ship, publish, or redistribute.
