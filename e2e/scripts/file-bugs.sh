#!/usr/bin/env bash
# Files one Jira Bug per injected defect the e2e suite caught, links each to the story,
# and comments on the story. Uses acli only (already logged in: `acli jira auth login --web`).
# No credentials are read or written here.
#
#   e2e/scripts/file-bugs.sh [name...]            # file for real; names are drafts in bugs/<name>.txt (default: all)
#   DRY_RUN=1 e2e/scripts/file-bugs.sh [name...]  # print the payloads and commands only
#
# Re-running is safe: a bug whose summary already exists in the project is skipped,
# and the story comment is only posted when something new was filed.
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

if [[ $# -gt 0 ]]; then bugs=("$@"); else bugs=(); for f in "$HERE"/bugs/*.txt; do bugs+=("$(basename "$f" .txt)"); done; fi

# Key of the Bug in $PROJECT whose summary is exactly $1 (empty if none).
find_key() {
  acli jira workitem search --jql "project = $PROJECT AND type = Bug AND summary ~ \"\\\"$1\\\"\"" --json --fields key,summary 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const want=process.argv[1];let j=[];try{j=JSON.parse(s)}catch{};const items=Array.isArray(j)?j:(j.issues||[]);const hit=items.find(i=>(i.fields?.summary)===want);console.log(hit?hit.key:"")})' "$1"
}

# Link $1 to the story with "Relates", unless that link already exists.
ensure_link() {
  # `link list --json` leaves out the key on the inward side (outwardIssueKey: null), so read issuelinks instead.
  if acli jira workitem view "$1" --fields issuelinks --json \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const k=process.argv[1];const hit=(JSON.parse(s).fields.issuelinks||[]).some(l=>l.inwardIssue?.key===k||l.outwardIssue?.key===k);process.exit(hit?0:1)})' "$STORY"; then
    echo "$1 already linked to $STORY" >&2
  else
    run acli jira workitem link create --out "$1" --in "$STORY" --type Relates --yes
    changed=1
  fi
}

filed=()
changed=0
for bug in "${bugs[@]}"; do
  draft="$HERE/bugs/$bug.txt"
  json="$WORK/$bug.json"
  node "$HERE/text-to-adf.mjs" "$draft" "$PROJECT" > "$json"
  summary="$(node -e 'console.log(require(process.argv[1]).summary)' "$json")"
  want_priority="$(node -e 'console.log(require(process.argv[1]).additionalAttributes?.priority?.name ?? "")' "$json")"
  want_labels="$(node -e 'console.log([...require(process.argv[1]).labels].sort().join(","))' "$json")"

  if [[ -n "${DRY_RUN:-}" ]]; then
    echo "----- $bug: payload for acli --from-json -----" >&2
    cat "$json" >&2
  fi

  existing="$(find_key "$summary")"
  if [[ -n "$existing" ]]; then
    echo "skip create for $bug: $existing already has summary \"$summary\"" >&2
    ensure_link "$existing"   # run() keeps this read-only under DRY_RUN
    filed+=("$existing $summary [$want_labels]")
    continue
  fi

  if [[ -n "${DRY_RUN:-}" ]]; then
    run acli jira workitem create --from-json "<$bug.json>"
    run acli jira workitem view "<NEW-KEY>" --fields priority,labels,issuetype --json
    run acli jira workitem link create --out "<NEW-KEY>" --in "$STORY" --type Relates --yes
    filed+=("<NEW-KEY> $summary [$want_labels]")
    changed=1
    continue
  fi

  run acli jira workitem create --from-json "$json" >/dev/null
  # Look the new key up by its exact summary. Don't grep the create output for "PIQ-n":
  # it echoes the description, which mentions the story key (this picked PIQ-1 on the first run).
  # Jira search can lag a few seconds behind the create.
  key=""
  for _ in {1..15}; do key="$(find_key "$summary")"; [[ -n "$key" ]] && break; sleep 2; done
  [[ -n "$key" && "$key" != "$STORY" ]] || { echo "could not find the new bug \"$summary\"" >&2; exit 1; }
  echo "created $key ($bug)" >&2

  got="$(run acli jira workitem view "$key" --fields priority,labels,issuetype --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const f=JSON.parse(s).fields;console.log([f.issuetype?.name, f.priority?.name ?? "", (f.labels||[]).sort().join(",")].join("|"))})')"
  echo "read back $key: $got (type|priority|labels)" >&2
  if [[ "$got" != "Bug|$want_priority|$want_labels" ]]; then
    echo "WARNING: $key does not match the draft (wanted Bug|$want_priority|$want_labels); fix it in Jira" >&2
  fi

  changed=1
  ensure_link "$key"
  filed+=("$key $summary [$want_labels]")
done

if [[ $changed -eq 0 ]]; then
  echo "nothing new filed or linked; no comment on $STORY" >&2
  exit 0
fi

comment="$WORK/story-comment.txt"
{
  echo "Bugs filed from the generated Playwright tests [labels]:"
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
