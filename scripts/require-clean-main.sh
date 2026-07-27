#!/usr/bin/env bash
# Merge gate: refuse unless on main with a clean working tree.
# See AGENT_OWNERS.md — never stash other owners' WIP to "fix" dirtiness.
set -euo pipefail

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "error: must be on main (currently: $branch)" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree dirty on main — refuse merge." >&2
  echo "Abort and tell parent. Owners must use ~/.cursor/worktrees/<id>/snowline-..." >&2
  echo "Do NOT stash-and-forget. See AGENT_OWNERS.md HARD rules." >&2
  git status --short >&2
  exit 1
fi

echo "main working tree clean — ok to merge"
