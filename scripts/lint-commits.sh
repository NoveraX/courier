#!/usr/bin/env bash
# Lints commit messages with the repository's commitlint config.
#
#   scripts/lint-commits.sh <head> [<pull-request-base>]
#
# With a pull-request base, the commits from its merge base to <head> are
# checked. Without one, everything since the last release tag reachable from
# <head> is checked, not only what the latest push brought: an earlier run may
# have been cancelled or skipped, and the next release is built from all of
# it. With no merge base or no release tag, the whole history is checked.
# Fixup, squash and amend commits are refused: they exist to be folded away
# before they land, and the commit-msg hook lets them through for that.
set -euo pipefail
cd "$(dirname "$0")/.."

head=$1
pr_base=${2:-}
commitlint=(node_modules/.bin/commitlint -g commitlint.config.cjs)

if [ -n "$pr_base" ]; then
  base=$(git merge-base "$pr_base" "$head" || true)
else
  base=$(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*' "$head" 2>/dev/null || true)
fi

if [ -z "$base" ]; then
  base=$(git rev-list --max-parents=0 "$head" | tail -n 1)
  echo "Checking the root commit $base"
  git log -1 --format=%B "$base" | "${commitlint[@]}"
fi

count=$(git rev-list --count "$base..$head")
echo "Checking $count commits in $base..$head"
if [ "$count" -eq 0 ]; then
  exit 0
fi

unsquashed=$(git log --format='%h %s' "$base..$head" | grep -E '^[0-9a-f]+ (fixup|squash|amend)! ' || true)
if [ -n "$unsquashed" ]; then
  printf 'Fold these commits into the ones they amend:\n%s\n' "$unsquashed" >&2
  exit 1
fi

"${commitlint[@]}" --from "$base" --to "$head"
