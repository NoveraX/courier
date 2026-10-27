#!/usr/bin/env bash
# Lints the header a squash merge of a pull request will write.
#
#   scripts/lint-pr-title.sh <title> <number> [<subject of its only commit>]
#
# GitHub writes that header as the title and appends " (#<number>)". A
# repository whose squash title is COMMIT_OR_PR_TITLE writes the subject of a
# single commit instead, so that subject is checked as well, unless
# SQUASH_MERGE_COMMIT_TITLE says the repository uses PR_TITLE. When the setting
# is not known, the subject is checked, as it may become the header. Each
# candidate is checked alone, for what the suffix would hide from the rules
# (a trailing period), and with the suffix, for the length. A title in a form
# only git writes is refused: as a squash header, a merge or fixup line would
# slip past every later check.
set -euo pipefail
cd "$(dirname "$0")/.."

title=$1
number=$2
subject=${3:-}
squash_title=${SQUASH_MERGE_COMMIT_TITLE:-}
commitlint=(node_modules/.bin/commitlint -g commitlint.config.cjs)

headers=("$title")
if [ -n "$subject" ] && [ "$squash_title" != PR_TITLE ]; then
  if [ "$squash_title" != COMMIT_OR_PR_TITLE ]; then
    echo "The repository's squash title setting is not known: the commit's subject is checked too" >&2
  fi
  headers+=("$subject")
fi

for header in "${headers[@]}"; do
  if [[ $header =~ ^(Merge\ |fixup!\ |squash!\ |amend!\ ) ]]; then
    echo "\"$header\" is a form git writes, not a squash-merge header" >&2
    exit 1
  fi
  printf '%s\n' "$header" | "${commitlint[@]}"
  printf '%s (#%s)\n' "$header" "$number" | "${commitlint[@]}"
done
