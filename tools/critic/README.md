# Critic / capture tools

Deterministic screenshot capture, blank-frame smoke gate, flicker probe, and quality rubric.

## Commands

```bash
npm run capture -- --shot course_start   # alpine start gate
npm run capture -- --shot carve          # perform() carve macro (90f)
npm run capture -- --shot forest         # timberline scene preset
npm run capture -- --shot title          # title / brand
npm run capture                          # full suite (scene + action macros)
npm run smoke                            # capture course_start + blank-frame fail-fast
npm run smoke -- --shot forest           # blank-check a specific shot
npm run smoke -- --file path/to.png      # analyse an existing PNG
npm run flicker -- --shot forest         # temporal flicker probe
node tools/critic/blank-frame.mjs a.png  # luma / variance check only
node tools/critic/capture.mjs --help
```

## Gate shots

Must exist and pass blank-frame detect: `title`, `course_start`, `carve`, `forest`.

## Blank / washed-frame detect

Fails when **mean luma is too high** (`≥ 210`) **or** **variance/stddev is too low** (`σ ≤ 14`), plus a soft bright-wash band (`mean ≥ 155` and `σ ≤ 22`). Capture runs this after every PNG by default; disable with `--no-blank-check`.
