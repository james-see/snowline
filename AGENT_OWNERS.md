# Agent ownership & branches

File-map ownership. **Worktree required** for every concurrent owner agent.

| Branch | Owns | Gate focus |
|--------|------|------------|
| `agent/physics` | `src/rider/BoardPhysics.ts`, `tuning.ts` | control ≥9, physics ≥9 |
| `agent/tricks` | `src/rider/AirTricks.ts`, grind/landing | trick ≥9 |
| `agent/camera` | `src/camera/**` | camera ≥8; fill frame like user refs |
| `agent/rider-art` | `src/rider/visual/**` | rider ≥8; vivid gear |
| `agent/course` | TerrainGenerator, CourseDefs, CourseModule, SplinePath | peaks/relief; B1 |
| `agent/props` | `src/course/Props.ts`, `props/**` | dense forest + furniture; B2/B6/B10 |
| `agent/materials` | `src/render/materials/**` | corduroy + snow color; B4/B5 |
| `agent/vfx` | `src/vfx/**` | spray ≥8 |
| `agent/lighting` | Pipeline, RenderModule, post/** | long sun shadows; B3/B11 |
| `agent/audio` | `src/audio/**` | feedback |
| `agent/ui` | `src/ui/**` | in-run HUD; B9 |
| `agent/score` | score/modes | modes |
| `agent/perf` | Lod | 60fps with denser props |
| `agent/capture` | tools/critic | shots + refs in brief |
| `agent/docs` | root md | docs |

## HARD rules — mandatory worktrees (no stash thrash)

**Root cause:** Parallel agents shared one working tree on `main`. Merge agents ran `git stash` to get a clean tree, parking other owners' uncommitted WIP under cryptic names. Camera/lighting/course/rider looked "wiped" until stash pop. Do not repeat that.

### 1. Worktree required

Every concurrent owner agent **MUST** create/use its own git worktree under:

```text
~/.cursor/worktrees/<id>/snowline-...
```

Checked out to **their branch only**. Do not edit another owner's paths (see table).

### 2. Primary checkout is integrator-only

`/Users/jc/p/snowline` on `main` is **integrator-only**: clean merges + critic. Owners **never** leave uncommitted WIP in that working tree. Never commit owner WIP there.

### 3. Merge agents — clean or abort

Merge agents operate on the primary `main` checkout **only when `git status` is clean**.

- If dirty: **abort**, tell the parent/director — **never stash** other owners' work.
- Optional: move WIP onto that owner's branch/worktree, then retry.
- Before merge: `./scripts/require-clean-main.sh`

### 4. How to create a worktree

From the primary repo (or any linked checkout):

```bash
# New branch from main tip
git worktree add -b <owner-branch> \
  ~/.cursor/worktrees/<id>/snowline-<slug> \
  main

# Existing branch
git worktree add \
  ~/.cursor/worktrees/<id>/snowline-<slug> \
  <owner-branch>
```

Examples:

```bash
git worktree add -b course-peaks-fill-atmosphere \
  ~/.cursor/worktrees/course-peaks/snowline-peaks \
  main

git worktree add \
  ~/.cursor/worktrees/lighting-abc123/snowline-lighting \
  agent/lighting
```

Work in that path only. Commit on the owner branch. Parent merges from clean primary `main`.

### 5. Critic after merge

After merging to `main`, run critic from the primary `main` checkout (clean) **or** a critic worktree on `main` tip:

```bash
git worktree add ~/.cursor/worktrees/critic-<id>/snowline-critic main
# in that worktree: npm run capture && npm run critic && npm run gate ...
```

### 6. Stash — last resort only (almost never)

Prefer refuse-merge or move-WIP-to-owner-worktree. If you must stash:

```text
wip-<owner>-<branch>-<reason>
```

Immediately notify/resume that owner to recover onto **their** worktree/branch. Never anonymous / `cross-agent-wip` stashes. **Never stash to unblock a merge.**

### 7. Local nested worktrees

Do not commit `.worktrees/` (gitignored). Prefer `~/.cursor/worktrees/<id>/snowline-...` as above.

## User-ref loop

See [GATE_USER_REFS.md](GATE_USER_REFS.md). Director scores against `refs/snowboard/images/user_ref_*.png` and fans owners until all binary checks PASS.
