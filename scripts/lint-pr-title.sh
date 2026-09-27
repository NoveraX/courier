#!/usr/bin/env bash
# Lints the header a squash merge of a pull request will write.
#
#   scripts/lint-pr-title.sh <title> <number> [<subject of its only commit>]
#
# GitHub writes that header as the title, or, for a single commit, as that
# commit's subject, and appends " (#<number>)". Each candidate is checked
# alone, for what the suffix would hide from the rules (a trailing period),
# and with the suffix, for the length. A title in a form only git writes is
# refused: as a squash header, a merge or fixup line would slip past every
# later check.
set -euo pipefail
cd "$(dirname "$0")/.."

title=$1
number=$2
subject=${3:-}
commitlint=(node_modules/.bin/commitlint -g commitlint.config.cjs)

for header in "$title" ${subject:+"$subject"}; do
  if [[ $header =~ ^(Merge\ |fixup!\ |squash!\ |amend!\ ) ]]; then
    echo "\"$header\" is a form git writes, not a squash-merge header" >&2
    exit 1
  fi
  printf '%s\n' "$header" | "${commitlint[@]}"
  printf '%s (#%s)\n' "$header" "$number" | "${commitlint[@]}"
done
