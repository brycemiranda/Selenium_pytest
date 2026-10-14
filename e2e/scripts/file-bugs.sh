#!/usr/bin/env bash
# Files one Jira Bug per injected defect the e2e suite caught, links each to the story,
# and comments on the story. Uses acli only (already logged in: `acli jira auth login --web`).
# No credentials are read or written here.
#
#   e2e/scripts/file-bugs.sh            # file for real
#   DRY_RUN=1 e2e/scripts/file-bugs.sh  # print the payloads and commands only
#
# Re-running is safe: a bug whose summary already exists in the project is skipped.
set -euo pipefail

PROJECT="${PROJECT:-PIQ}"
STORY="${STORY:-PIQ-1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

run() {
  printf '+ %s\n' "$*" >&2
  if [[ -z "${DRY_RUN:-}" ]]; then "$@"; fi
}

filed=()
for bug in allergy dob; do
  draft="$HERE/bugs/$bug.txt"
  json="$WORK/$bug.json"
  node "$HERE/text-to-adf.mjs" "$draft" "$PROJECT" > "$json"
  summary="$(node -e 'console.log(require(process.argv[1]).summary)' "$json")"
  want_priority="$(node -e 'console.log(require(process.argv[1]).additionalAttributes?.priority?.name ?? "")' "$json")"

  if [[ -n "${DRY_RUN:-}" ]]; then
    echo "----- $bug: payload for acli --from-json -----" >&2
    cat "$json" >&2
  fi

  existing="$(acli jira workitem search --jql "project = $PROJECT AND type = Bug AND summary ~ \"\\\"$summary\\\"\"" --csv --fields key 2>/dev/null | tail -n +2 | head -1 || true)"
  if [[ -n "$existing" ]]; then
    echo "skip $bug: $existing already has summary \"$summary\"" >&2
    filed+=("$existing $summary")
    continue
  fi

  if [[ -n "${DRY_RUN:-}" ]]; then
    run acli jira workitem create --from-json "<$bug.json>" --json
    run acli jira workitem view "<NEW-KEY>" --fields priority,labels,issuetype --json
    run acli jira workitem link create --out "<NEW-KEY>" --in "$STORY" --type Blocks --yes
    filed+=("<NEW-KEY> $summary")
    continue
  fi

  out="$(run acli jira workitem create --from-json "$json" --json)"
  key="$(grep -oE "\\b$PROJECT-[0-9]+\\b" <<<"$out" | head -1)"
  [[ -n "$key" ]] || { echo "could not read the new key from: $out" >&2; exit 1; }
  echo "created $key ($bug)" >&2

  got="$(run acli jira workitem view "$key" --fields priority,labels,issuetype --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const f=JSON.parse(s).fields;console.log([f.issuetype?.name, f.priority?.name ?? "", (f.labels||[]).sort().join(",")].join("|"))})')"
  echo "read back $key: $got (type|priority|labels)" >&2
  if [[ "$got" != "Bug|$want_priority|injected-defect,playwright-agents" ]]; then
    echo "WARNING: $key does not match the draft (wanted Bug|$want_priority|injected-defect,playwright-agents); fix it in Jira" >&2
  fi

  run acli jira workitem link create --out "$key" --in "$STORY" --type Blocks --yes
  filed+=("$key $summary")
done

comment="$WORK/story-comment.txt"
{
  echo "Bugs filed from the generated Playwright tests (labels: injected-defect, playwright-agents):"
  for f in "${filed[@]}"; do echo "- $f"; done
  echo
  echo "Reports with traces: https://brycemiranda.github.io/Selenium_pytest/e2e-report/allergy/ and https://brycemiranda.github.io/Selenium_pytest/e2e-report/dob/ (clean run: https://brycemiranda.github.io/Selenium_pytest/e2e-report/clean/)"
  echo "Filed by Claude Code with acli after review by Bryce Miranda."
} > "$comment"
if [[ -n "${DRY_RUN:-}" ]]; then
  echo "----- comment for $STORY -----" >&2
  cat "$comment" >&2
fi
run acli jira workitem comment create --key "$STORY" --body-file "$comment"
