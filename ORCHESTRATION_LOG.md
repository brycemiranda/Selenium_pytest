# Orchestration log

Claude Code (model: Claude Opus 5.5) ran this demo with Bryce Miranda reviewing at three checkpoints.
This log is written as the work happens. Commands are copied exactly as run. Anything that failed, and anything the AI got wrong, stays in.

Tools: CLI only (`playwright-cli`, `acli`, `gh`, `git`, `npm`). No MCP servers.

---

## Phase 0: Preflight (2026-10-14)

### First attempt: blocked

| Check | Command | Result |
|---|---|---|
| Node | `node --version` | v16.20.2 (nvm default). Too old for Playwright. |
| playwright-cli | `which playwright-cli` | not installed |
| acli | `acli --version` | not installed |
| Push | `git push --dry-run origin main` | failed: SSH remote, `Permission denied (publickey)` |
| Jira | — | `<SITE>/<KEY>/<STORY>` placeholders were not filled in yet |

I stopped and asked. Bryce answered: SITE=`brycegdsc`, KEY=`PIQ`, STORY=`PIQ-1`. Allowed: Node 22 via nvm, an HTTPS remote, and installing playwright-cli. Bryce installed `acli` and logged in.

### Fixes

```bash
nvm install 22 && nvm alias default 22
zsh -lic 'node --version'                 # v22.23.3 in a fresh login shell

gh auth setup-git
git remote set-url origin https://github.com/brycemiranda/Selenium_pytest.git
git push --dry-run origin main            # rejected: "fetch first" (auth OK, remote had new commits)

npm install -g @playwright/cli@latest
```

**Mistake (mine):** the first `npm install -g @playwright/cli@latest` ran in a non-interactive shell where nvm's v16 was still first on PATH. `nvm alias default` only affects *new* login shells. So the CLI went into Node 16 and crashed on start (`TypeError: Class extends value undefined`).
Caught by running `playwright-cli --help` right after installing. Fix: `npm uninstall -g @playwright/cli`, then `nvm use 22`, then install again. From then on, every command runs after `nvm use 22`.

```bash
playwright-cli --version                  # 0.1.22
playwright-cli --help                     # read in full
playwright-cli --help install             # confirms --skills (claude|agents) and --global
```

`git pull --ff-only` was refused because the local, uncommitted `tests/pages/login_page.py` would be overwritten. I checked before touching it:

```bash
git diff main origin/main -- tests/pages/login_page.py
git hash-object tests/pages/login_page.py               # dff7cb34...
git rev-parse origin/main:tests/pages/login_page.py     # dff7cb34... (identical)
```

The uncommitted edit was byte-identical to upstream commit `34cb5bd Remove stray test from LoginPage`, so:

```bash
git stash push tests/pages/login_page.py -m "local copy of 34cb5bd"
git pull --ff-only                        # 5219df4..64bc86e
git stash pop                             # no-op, tree clean
git push --dry-run origin main            # Everything up-to-date (push access OK)
git checkout -b orchestration-demo
playwright-cli install --skills
```

`playwright-cli install --skills` added two lines to the root `.gitignore` (`# Playwright CLI output (may contain credentials)` / `.playwright-cli/`). The root `.gitignore` is off limits, so I reverted it with `git checkout -- .gitignore` and moved the entry to `.git/info/exclude`. I also excluded `.claude/` (the installed skill) and `.vscode/` there so neither gets committed by accident.

### Preflight result

| Check | Result |
|---|---|
| Branch | `orchestration-demo` from `main` @ `64bc86e`, working tree clean |
| Push | `git push --dry-run` OK over HTTPS (`gh` credential helper, account `brycemiranda`) |
| Node / npm | v22.23.3 / 10.9.9 |
| playwright-cli | 0.1.22, skill in `.claude/skills/playwright-cli/` |
| acli | 1.3.39-stable. `acli jira auth status` reports authenticated to `brycegdsc.atlassian.net` (oauth) |
| Story | `acli jira workitem view PIQ-1`: Story, To Do, Medium. AC1–AC4 below |
| Live app | `playwright-cli -s=preflight open https://brycemiranda.github.io/Selenium_pytest/`, filled `demo`/`demo`, clicked `login-submit`. All 13 `data-test-id`s present; intake form and patient table visible after login; `intake-error` and `login-error` hidden until triggered |

PIQ-1 acceptance criteria (quoted from Jira):

- AC1: When I save a patient with allergy "Penicillin", the patient list shows "Penicillin" for that patient.
- AC2: A date of birth in the future is rejected with a visible error message, and the patient is not saved.
- AC3: Today's date is accepted as a date of birth.
- AC4: A date of birth not in YYYY-MM-DD format is rejected with a visible error message.

Skill vs. brief (the brief wins in each case):

- The skill saves plans to `specs/<feature>.plan.md`. The brief says `e2e/specs/patient-intake.md`.
- The skill prefers role locators. The brief requires `getByTestId`.
- The skill's heal step (§3.5) says to mark a confirmed app bug `test.fixme(...)`. Ground rule 3 forbids that: the injected bugs must make tests fail.

Notes from reading the app source (`docs/app.js`, read only):

- `validate()` computes "today" as `new Date().toISOString().slice(0, 10)`, which is the **UTC** date, not the browser's local date. See Phase 2.
- The DOB check is a regex (`^\d{4}-\d{2}-\d{2}$`) plus a string compare. Impossible dates such as `2026-02-30` pass.
- The live page logs one console error: `favicon.ico` 404 at the domain root. Harmless.

Shell gotchas (zsh): an unquoted `======` in `echo` triggers `=cmd` expansion, and `$P` holding `playwright-cli -s=x` is not word-split. I write the commands out in full.

---

## Phase 1: Playwright Test (TypeScript) in `e2e/`

### Why TypeScript (checked, and the brief's premise was out of date)

The brief cites microsoft/playwright#38610 as an *open* request for Python test agents. When checked, it was closed:

```bash
gh issue view 38610 --repo microsoft/playwright --json title,state,url,labels   # state: CLOSED
gh api repos/microsoft/playwright/issues/38610/timeline --paginate --jq '...'   # closed 2026-08-11 by microsoft/playwright#42165
gh pr view 315 --repo microsoft/playwright-pytest --json title,state,mergedAt,body
#   "feat: add --playwright-debug=cli for Python test agents", merged 2026-08-10 (pytest-playwright 0.9.0)
grep -rn -i 'pytest\|python' .claude/skills/playwright-cli/                     # no matches
```

So a Python attach loop now exists (`pytest --playwright-debug=cli -s`), and this repo already pins `pytest-playwright==0.10.0`. But the skill shipped with `@playwright/cli` 0.1.22 (2026-09-28) only documents plan / generate / heal for `@playwright/test`. Every `playwright-cli` action prints JS/TS (`### Ran Playwright code` blocks). I kept TypeScript to follow the installed skill exactly.

**One-line reason (used on the demo page):** the installed `playwright-cli` skill's plan / generate / heal workflow targets `@playwright/test` and emits TypeScript; Python attach support (`pytest --playwright-debug=cli`, pytest-playwright 0.9.0) shipped in Aug 2026 but isn't in the bundled skill yet.

### Setup

```bash
mkdir -p e2e && cd e2e
# package.json written by hand (name, private, scripts), then:
npm install --save-dev --save-exact @playwright/test@1.64.1 @types/node@22.20.5 typescript@7.0.2
npx playwright --version                  # Version 1.64.1
npx playwright install chromium           # exit 0, chromium-1248 already cached
npx playwright install --list
```

`npm view @playwright/test dist-tags`: latest = 1.64.1, pinned exactly. TypeScript is only used for `npm run typecheck`; Playwright transpiles the tests itself.

Files:

- `e2e/.gitignore`: `node_modules/`, `test-results/`, `playwright-report/`
- `e2e/playwright.config.ts`: chromium only, `testIdAttribute: 'data-test-id'`, HTML reporter (`open: 'never'`) plus list, `trace: 'on'`, `retries: 0` (a retry would hide flakiness), `baseURL` from `BASE_URL`, defaulting to the live app.
- `e2e/tests/fixtures.ts`: the **only** place that reads `BUGS`.
- `e2e/tests/seed.spec.ts`: the seed. The `loggedInPage` fixture opens the app and logs in.

### Subpath pitfall

```bash
node -e "for (const p of ['/','./']) console.log(JSON.stringify(p),'->',new URL(p,'https://brycemiranda.github.io/Selenium_pytest/').href)"
# "/"  -> https://brycemiranda.github.io/            (wrong: domain root)
# "./" -> https://brycemiranda.github.io/Selenium_pytest/
```

The config adds a trailing slash to `BASE_URL` if it's missing, and the fixture navigates to `./` or `./?bugs=<BUGS>`. The fixture also asserts that the `bug-allergy` / `bug-dob` checkboxes match `BUGS`. Without that check, a broken toggle would quietly test the clean app while the run is labelled "dob". An unknown `BUGS` value throws.

### Verified

```bash
export PLAYWRIGHT_HTML_OPEN=never
for b in "" allergy dob allergy,dob; do BUGS=$b npx playwright test tests/seed.spec.ts --reporter=line; done   # 1 passed x4
BASE_URL=https://brycemiranda.github.io/Selenium_pytest npx playwright test tests/seed.spec.ts                 # 1 passed (no trailing slash)
BUGS=bogus npx playwright test tests/seed.spec.ts       # Error: Unknown BUGS value "bogus". Expected one of: allergy, dob
npx tsc --noEmit                                         # ok
npx playwright test --help                               # --debug [mode]: "inspector" | "cli" (implies --headed, --workers=1, --timeout=0)
```

**Mistake (mine, again):** one `npx playwright test --help` ran without `nvm use 22` and got "Playwright requires Node.js 20 or higher". Rerun correctly. Every command now sources `nvm use 22` first.

---

## Phase 2: Plan from the Jira story

The plan step follows the skill's §1 (go through the seed, then explore with `playwright-cli`). Output: `e2e/specs/patient-intake.md`.

### Exploration commands

```bash
cd e2e
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/seed.spec.ts --debug=cli   # background; prints: Run "playwright-cli attach tw-3e7e60"
playwright-cli attach tw-3e7e60       # Paused: Navigate ./ at tests/fixtures.ts:23
playwright-cli resume                 # -> "The browser 'default' is not open"
playwright-cli -s=tw-3e7e60 resume    # ran the seed to the end; the test passed and the browser closed
```

**Docs vs reality, #1:** after `attach`, the skill's examples use bare `playwright-cli resume` / `snapshot`. In 0.1.22 every command needs `-s=<session>`.
**Docs vs reality, #2:** the skill says "resume so that seed test runs fully, then probe". But `resume` lets the test *finish*, which closes the browser. What works is `pause-at` on the seed's last line:

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/seed.spec.ts --debug=cli   # background; tw-da8ee1
playwright-cli attach tw-da8ee1
playwright-cli --help pause-at                        # <file>:<line>
playwright-cli -s=tw-da8ee1 pause-at seed.spec.ts:7   # Paused: Expect "toBeVisible" getByTestId('intake-name'); page is logged in
```

**Docs vs reality, #3:** in the attached session, `playwright-cli -s=tw-da8ee1 fill "getByTestId('intake-name')" ...` gives `does not match any elements`. The CLI's `getByTestId` uses `data-testid`, ignoring the test config's `testIdAttribute`. I used CSS `[data-test-id="..."]` targets. The CLI then emits `page.locator('[data-test-id="intake-name"]')`, which the tests write as the equivalent `page.getByTestId('intake-name')`.

Probes (each `fill` / `click` printed its Playwright code; state read with `--raw eval`):

```bash
playwright-cli -s=tw-da8ee1 fill '[data-test-id="intake-name"]' 'Ada Testpatient'
playwright-cli -s=tw-da8ee1 fill '[data-test-id="intake-dob"]' '1990-04-12'
playwright-cli -s=tw-da8ee1 fill '[data-test-id="intake-allergies"]' 'Penicillin'
playwright-cli -s=tw-da8ee1 fill '[data-test-id="intake-medication"]' 'Lisinopril'
playwright-cli -s=tw-da8ee1 click '[data-test-id="intake-save"]'
playwright-cli -s=tw-da8ee1 --raw eval "JSON.stringify({rows:[...document.querySelectorAll('[data-test-id=patient-row]')].map(r=>[...r.cells].map(c=>c.textContent).join('|')), ...})"
# ...same fill/click/eval loop for every DOB value below...
playwright-cli -s=tw-da8ee1 run-code "async page => { await page.clock.setFixedTime(new Date('2026-10-15T02:00:00Z')); return await page.evaluate(() => ({utc:new Date().toISOString().slice(0,10), local:new Date().toLocaleDateString('en-CA')})); }"
playwright-cli -s=tw-da8ee1 tab-new https://brycemiranda.github.io/Selenium_pytest/   # fresh, logged-out page for the login probes
playwright-cli -s=tw-da8ee1 reload
playwright-cli -s=tw-da8ee1 tab-close
playwright-cli -s=tw-da8ee1 resume    # seed finished: 1 passed
playwright-cli list                   # (no browsers)
```

Observed on the clean app (browser zone America/New_York, real date 2026-10-14):

| Input | Result |
|---|---|
| Penicillin / "Penicillin, Sulfa drugs" | saved verbatim in the allergies cell |
| DOB 2099-01-01 | visible "Date of birth cannot be in the future.", not saved, form keeps the values |
| DOB 2026-10-14 (today) | saved |
| DOB 2026-10-15 (tomorrow) | visible future error, not saved |
| `1990/04/12`, `12-04-1990`, `1990-4-12`, `19900412`, `abc`, empty | visible "Date of birth must be YYYY-MM-DD.", not saved |
| `" 1990-04-12 "` | trimmed, saved as `1990-04-12` |
| `2026-02-30`, `0000-00-00` | **saved** (impossible dates accepted) |
| `2026-13-45` | rejected, but only as "in the future" |
| empty name | visible "Name is required." |
| clock pinned to 2026-10-15T02:00Z (22:00 NY), DOB 2026-10-15 | **saved**: the local "tomorrow" is accepted (UTC-today defect) |
| login demo/wrong-password, empty, DEMO/demo | visible "Invalid username or password.", intake hidden |
| login demo/demo after a failure | error hidden, intake + list visible |
| reload | back to the sign-in form, list cleared |

### Plan decisions

- **Date pinning** at 2026-06-15T12:00:00Z for the today/tomorrow boundary, so the suite is deterministic in any time zone (UTC−11…UTC+11) and at any hour. The trade-off: it masks the UTC-today defect. That defect is listed as a known gap in the plan for Bryce to decide on, not hidden.
- **Bug isolation:** only AC1 scenarios assert allergies, and only AC2 scenarios assert future-date rejection, so each toggle fails exactly its own scenarios.
- **AC4 data-driven:** six values in one file (deviates from the skill's one-test-per-file rule, which I log here).
- **Login:** two scenarios with no AC (PIQ-1 has no login criterion), titled `NO-AC (login) …`.

The plan has 13 tests plus the seed. AC coverage: AC1 2, AC2 2, AC3 1, AC4 6. No AC is uncovered.

**CHECKPOINT 1:** waiting for Bryce.

**Checkpoint 1 outcome:** Bryce replied "continue". I took that as approval of the plan and the comment text, and as accepting my defaults on the open questions: the UTC-today and impossible-date issues stay as documented gaps (I'll ask again at Checkpoint 2 whether to file UTC-today as a bug); login titles use `NO-AC (login)`; the demo page uses the corrected "why TypeScript" line.

```bash
git push -u origin orchestration-demo        # so the plan link in the comment resolves
curl -s -o /dev/null -w "%{http_code}\n" https://github.com/brycemiranda/Selenium_pytest/blob/orchestration-demo/e2e/specs/patient-intake.md   # 200
acli jira workitem comment-create --help     # (the brief's spelling) -> just prints the `workitem` command list: no such subcommand
acli jira workitem comment create --help
acli jira workitem comment create --key PIQ-1 --body-file e2e/scripts/piq1-plan-comment.txt   # ✓ Comment on work item PIQ-1 has been successfully added
acli jira workitem comment list --key PIQ-1  # comment 10000, author Bryce Miranda (acli acts as the logged-in user)
```

**Docs vs reality, #4:** in acli 1.3.39 the command is `acli jira workitem comment create`, not `comment-create`. The examples in its own `--help` also leave out `create` (`acli jira workitem comment --key ...`).

---

## Phase 3: Generate, run, prove the tests can fail

### Generation (skill §2.2, one scenario per seed session, sequentially)

I scripted the skill's loop so each scenario gets a fresh seed. For each one: start `npx playwright test tests/seed.spec.ts --debug=cli` in the background, `playwright-cli attach tw-…`, `pause-at`, run the scenario's steps, collect the printed code, `resume`, and wait for the seed to exit. Sessions: 1.1 `tw-2e2ec7`, 1.2 `tw-c3c8ab`, 2.1 `tw-0583f0`, 2.2 `tw-90477c`, 3.1 `tw-dd5d3c`, 4.1 `tw-16ffd3`, 5.1 `tw-bbd562`, 5.2 `tw-6916c3`. A representative scenario (2.2), exactly as run:

```bash
playwright-cli attach tw-90477c
playwright-cli -s=tw-90477c pause-at seed.spec.ts:7
playwright-cli -s=tw-90477c run-code "async page => { await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z')); }"
playwright-cli -s=tw-90477c --raw eval "new Date().toISOString()"                                # "2026-06-15T12:00:00.000Z"
playwright-cli -s=tw-90477c fill '[data-test-id="intake-name"]' 'Eli Tomorrow'                   # await page.locator('[data-test-id="intake-name"]').fill('Eli Tomorrow');
playwright-cli -s=tw-90477c fill '[data-test-id="intake-dob"]' '2026-06-16'
playwright-cli -s=tw-90477c click '[data-test-id="intake-save"]'
playwright-cli -s=tw-90477c --raw eval "el => el.checkVisibility()" '[data-test-id="intake-error"]'   # true
playwright-cli -s=tw-90477c --raw eval "el => el.textContent" '[data-test-id="intake-error"]'         # "Date of birth cannot be in the future."
playwright-cli -s=tw-90477c --raw eval "document.querySelectorAll('[data-test-id=patient-row]').length"  # 0
```

Each `--raw eval` result became an assertion: `checkVisibility()` true becomes `toBeVisible()`, `textContent` becomes `toHaveText(...)`, and the row count becomes `toHaveCount(...)`.

**Mistake (mine):** for the login scenarios I first used `pause-at fixtures.ts:73` (the line `await logIn(page)`). It didn't pause; the seed ran to the end. Probing showed that `pause-at` only stops on Playwright API calls, not on calls to my own helpers. `pause-at fixtures.ts:33` (the first `fill` in `logIn`) worked. After the login-valid exploration the seed run then "failed": the fixture's own `fill` on the username field timed out because I had already logged in by hand. That's a side effect of exploring, not a test problem (log: `Test timeout of 30000ms exceeded while setting up "loggedInPage"`).

**My own script bugs:** my output filter first dropped bare `true`/`false`/number results from `--raw eval`. I fixed the regex and reran the affected scenarios.

Test files (`e2e/tests/`): `allergies/ac1-penicillin-shown-for-that-patient`, `allergies/ac1-multiple-allergies-kept-verbatim`, `dob/ac2-far-future-dob-rejected`, `dob/ac2-tomorrow-rejected`, `dob/ac3-today-accepted`, `dob/ac4-invalid-dob-format-rejected` (6 tests), `login/login-valid-credentials-shows-intake`, `login/login-wrong-password-shows-error`.
Checked against the requirements: `getByTestId` only (plus `[data-field=…]` cells inside a row, which have no test id); web-first `expect` only; no `waitForTimeout`, no `networkidle`; every error message is asserted `toBeVisible()` before `toHaveText()`; titles start with the AC id.

### Runs

```bash
npx tsc --noEmit                                         # ok
PLAYWRIGHT_HTML_OPEN=never npx playwright test           # 14 passed. No healing needed: nothing failed on the clean app.
BUGS=allergy PLAYWRIGHT_HTML_OPEN=never npx playwright test   # 2 failed (both AC1), 12 passed
BUGS=dob     PLAYWRIGHT_HTML_OPEN=never npx playwright test   # 2 failed (both AC2), 12 passed
```

Failure reasons were checked, not just counts. `allergy`: `toHaveText` expected "Penicillin" / "Penicillin, Sulfa drugs", received "". `dob`: `toBeVisible()` on `intake-error`, received hidden. No test passed under the bug it should catch, so no test needed strengthening.

On visible-before-text: under `dob` a text-only check would *also* have failed here, because the error was never shown, so its text is still "". The visibility check matters in a different case. `app.js` hides the error on a successful save but doesn't clear its text, so after a rejected save followed by a good one, a hidden element still holds the old message. A text-only assertion would pass on it.

### Flakiness record (3 × 3 runs, `retries: 0`)

```bash
for b in clean allergy dob; do for i in 1 2 3; do
  BUGS=$([ $b = clean ] || echo $b) PLAYWRIGHT_JSON_OUTPUT_NAME=runs/$b-$i.json npx playwright test --reporter=json
done; done
```

| Run | 1 | 2 | 3 |
|---|---|---|---|
| clean | 14 P / 0 F | 14 P / 0 F | 14 P / 0 F |
| allergy | 12 P / 2 F | 12 P / 2 F | 12 P / 2 F |
| dob | 12 P / 2 F | 12 P / 2 F | 12 P / 2 F |

| Test | clean | allergy | dob |
|---|---|---|---|
| AC1 multiple allergies are kept verbatim | PPP | FFF | PPP |
| AC1 Penicillin is shown for that patient | PPP | FFF | PPP |
| AC2 far-future date of birth is rejected and not saved | PPP | PPP | FFF |
| AC2 tomorrow is rejected and not saved | PPP | PPP | FFF |
| AC3 today is accepted as a date of birth | PPP | PPP | PPP |
| AC4 × 6 formats | PPP each | PPP each | PPP each |
| NO-AC (login) × 2 | PPP each | PPP each | PPP each |
| seed | PPP | PPP | PPP |

0 flaky across 126 test executions. That's a small sample: 3 runs from one machine against the live site.

I verified the stale-text claim above before keeping it (it was based on reading `app.js`):

```bash
playwright-cli -s=stale open https://brycemiranda.github.io/Selenium_pytest/
# log in, save "Hal Stale" with DOB 2099-01-01 (rejected), change DOB to 1990-01-01, save again (accepted)
playwright-cli -s=stale --raw eval "JSON.stringify((e=>[e.checkVisibility(), e.textContent])(document.querySelector('[data-test-id=intake-error]')))"
# "[false,\"Date of birth cannot be in the future.\"]"  -> hidden, old text still there
playwright-cli -s=stale close
```

---

## Phase 4: Publish the evidence

```bash
grep -rhoE 'PLAYWRIGHT_HTML_[A-Z_]+' e2e/node_modules/playwright/ | sort -u   # confirms PLAYWRIGHT_HTML_OUTPUT_DIR and PLAYWRIGHT_HTML_TITLE exist in 1.64.1
cd e2e
for b in clean allergy dob; do
  BUGS=$([ $b = clean ] || echo $b) PLAYWRIGHT_HTML_OPEN=never \
  PLAYWRIGHT_HTML_OUTPUT_DIR=../docs/e2e-report/$b PLAYWRIGHT_HTML_TITLE="PIQ-1 e2e: $b run" \
  npx playwright test --reporter=html
done
du -sh docs/e2e-report docs/e2e-report/*/        # 11M total: clean 3.9M, allergy 3.8M, dob 3.7M; 42 trace zips (14 per run)
```

**Size: 11 MB committed.** Committing generated reports is a deliberate shortcut so the current Pages setup (deploy from `main` → `/docs`) keeps working with no workflow changes. **The better option:** a Pages deploy from Actions (`actions/upload-pages-artifact` + `actions/deploy-pages`) in a job that `needs:` the e2e jobs, publishing the reports as build output. Then nothing generated lives in git, and the published reports always match the commit that produced them.

**What the traces contain:** traces store source locations as absolute paths. Checked before committing:

```bash
for z in docs/e2e-report/*/data/*.zip; do unzip -p "$z"; done | grep -a -o -E "/Users/brycemiranda[^\"' ]{0,80}" | sort | uniq -c
#   only /Users/brycemiranda/patient-intake-qa/e2e/tests/*.ts and e2e/node_modules/playwright-core/... paths
for z in docs/e2e-report/*/data/*.zip; do unzip -p "$z"; done | grep -a -i -E "gho_|ATATT|bearer |authorization|@gmail\.com|atlassian"
#   no matches
```

So the traces expose a local directory layout, which includes the public GitHub username. No tokens or emails. Reports built in CI would show `/home/runner/...` instead.

### Verified locally with playwright-cli

```bash
python3 -m http.server 8765 --directory docs      # background
playwright-cli -s=report open http://localhost:8765/e2e-report/dob/
playwright-cli -s=report find "AC2"
playwright-cli -s=report --raw eval "document.querySelector('nav')?.innerText"
playwright-cli -s=report click e56                # "View Trace" on AC2 far-future
playwright-cli -s=report find --regex "Fill|Click|toBeVisible|Error|error"
playwright-cli -s=report console error
playwright-cli -s=report goto http://localhost:8765/e2e-report/clean/     # + allergy; then goto each report's first matching "View Trace" href
playwright-cli -s=report goto "http://localhost:8765/e2e-report/dob/#?q=s:failed"   # collect testId deep links for the Jira evidence
playwright-cli -s=report close
```

| Report | Title | Counts | Trace opened | Trace shows |
|---|---|---|---|---|
| clean | PIQ-1 e2e: clean run | 14 / 14 passed | AC3 today | "Set fixed time … 08:00 EDT" (= 12:00 UTC), fills, Click, `toBeHidden` |
| allergy | PIQ-1 e2e: allergy run | 12 passed / 2 failed | AC1 Penicillin | fills incl. "Penicillin", Click, expects |
| dob | PIQ-1 e2e: dob run | 12 passed / 2 failed | AC2 far-future | fills, Click, `toBeVisible` 5.0s (the failure), error-context attachment; 0 console errors |

Deep links to the failing tests (used in the Jira bugs). These IDs are hashes of file + title, so they stay the same when the report is regenerated:

- allergy: `#?testId=11a438ffe646e21df862-f3f5afc598b3521c7db2` (AC1 Penicillin), `#?testId=de0d0600ec6008df6544-cddb7d2ca40b921eb20c` (AC1 multiple)
- dob: `#?testId=c1ee32bd21b0cb75f6cc-a29f19bb5153b331ca17` (AC2 far-future), `#?testId=65123cde7074dae2778b-bda4fbe559d127f0bbff` (AC2 tomorrow)

Opening `dob/#?testId=c1ee…` showed the test page with "Error: expect(locator).toBeVisible() failed … Received: hidden" and a View Trace button. Nothing was broken, so nothing needed fixing.

---

## Phase 5: File the bugs in Jira (drafts, before Checkpoint 2)

Checked what acli and the project actually support before drafting:

```bash
node -e "...chromium.launch()...b.version()"           # chromium 156.0.8078.4 (Playwright 1.64.1)
acli jira workitem create --help                      # flags: --type --summary --label --description-file --from-json ... (no priority flag)
acli jira workitem create --generate-json             # has additionalAttributes (documented for custom fields)
acli jira workitem edit --help ; acli jira workitem edit --generate-json   # no priority here either
acli jira workitem link --help ; acli jira workitem link create --help
acli jira workitem link type                          # Blocks, Cloners, Duplicate, Relates
acli jira project view --key PIQ --json               # issue types: Subtask, Epic, Story, Bug, Task (team-managed)
acli jira workitem search --jql "project = PIQ ORDER BY key"   # only PIQ-1
acli jira workitem search --jql 'project = PIQ AND summary ~ "\"keeps allergies\""' --csv --fields key   # PIQ-1 (phrase search works; used to skip duplicates)
```

**Docs vs reality, #5:** acli 1.3.39 can't set priority with a flag on `create` or `edit`. The only route is `create --from-json` with `additionalAttributes.priority`, which acli documents for custom fields only. Whether it works is **unverified until the first real create**. `file-bugs.sh` reads type, priority and labels back after creating and warns on any mismatch instead of assuming.

There is no Severity field in a Free team-managed project, so severity goes in the description.

Files:
- `e2e/scripts/bugs/allergy.txt`, `e2e/scripts/bugs/dob.txt`: the drafts (plain text: summary, priority, labels, body)
- `e2e/scripts/text-to-adf.mjs`: draft → acli `--from-json` payload (ADF description, URLs as links)
- `e2e/scripts/file-bugs.sh`: create → read back → link (`Blocks` PIQ-1) → comment on PIQ-1. Skips bugs whose summary already exists. `DRY_RUN=1` prints the payloads and commands.

```bash
bash -n e2e/scripts/file-bugs.sh            # ok
DRY_RUN=1 e2e/scripts/file-bugs.sh          # payloads + commands printed; the only Jira call is the read-only duplicate search
```

Evidence links point at the GitHub Pages reports (live only after the PR merges to `main`) and at test files pinned to commit `caaec7f` (permalinks survive branch deletion).

**CHECKPOINT 2:** waiting for Bryce. (Outcome below.)

### Checkpoint 2 outcome

Bryce approved A and B with changes:
- Link type **Relates**, not Blocks. The clean app passes all four ACs, so the story isn't blocked: the defects only exist with a toggle on. (My suggestion of Blocks was rejected.)
- Priority via `additionalAttributes`: go ahead, and report back if the read-back warns.
- File the UTC "today" defect as Bug 3, label `found-by-tests`, say clearly that it was not planted, and show the draft first.
- Cover it with a `test.fail()` test annotated with the Jira key. Don't change the app. Regenerate the reports.
- Record that the brief's `comment-create` was wrong for acli 1.3.39 (see "Docs vs reality, #4" above: caught from `acli jira workitem comment-create --help`, which just prints the `workitem` command list).

### Filing A and B

```bash
sed -i '' 's/--type Blocks --yes/--type Relates --yes/g' e2e/scripts/file-bugs.sh
DRY_RUN=1 e2e/scripts/file-bugs.sh allergy dob
e2e/scripts/file-bugs.sh allergy dob
```

**Mistake (mine), run 1:** the script took the new key from the first `PIQ-<n>` in `acli jira workitem create --json` output. That output echoes the description, which mentions "PIQ-1 AC1", so the script used **PIQ-1** as the new bug:

```
+ acli jira workitem create --from-json .../allergy.json --json
created PIQ-1 (allergy)
read back PIQ-1: Story|Medium| (type|priority|labels)
WARNING: PIQ-1 does not match the draft (wanted Bug|Highest|injected-defect,playwright-agents); fix it in Jira
+ acli jira workitem link create --out PIQ-1 --in PIQ-1 --type Relates --yes
✗ You cannot link an issue to itself.
```

The read-back warning and Jira's self-link refusal stopped it. PIQ-1 was not changed. **PIQ-2 had been created correctly** (Bug, Highest, both labels), so `additionalAttributes.priority` *does* work in acli 1.3.39 (resolves "Docs vs reality, #5"). Fix: look the key up by exact summary (`find_key`, retrying for search-index lag) instead of grepping the create output; make an existing bug still get its link; take the label check from the draft.

Run 2:

```
skip create for allergy: PIQ-2 already has summary "Allergies are silently dropped when a patient is saved"
+ acli jira workitem link create --out PIQ-2 --in PIQ-1 --type Relates --yes    ✓ (PIQ-2 Relates PIQ-1)
+ acli jira workitem create --from-json .../dob.json
created PIQ-3 (dob)
read back PIQ-3: Bug|High|injected-defect,playwright-agents
+ acli jira workitem link create --out PIQ-3 --in PIQ-1 --type Relates --yes    ✓ (PIQ-3 Relates PIQ-1)
+ acli jira workitem comment create --key PIQ-1 --body-file .../story-comment.txt   ✓ (comment 10001)
```

**Mistake (mine), run 3, the "idempotency check":** I reran the script for real to show that a second run makes no writes, and it **did write**. `ensure_link` grepped `acli jira workitem link list --key PIQ-2 --json` for `"PIQ-1"`, but that JSON leaves out the linked key on the inward side (`{"id":"10000","outwardIssueKey":null,"typeName":"Relates"}`). The check therefore failed, and the script called `link create` again for PIQ-2 and PIQ-3 (Jira did not add duplicate links: `link list --key PIQ-1` still shows exactly 10000 → PIQ-2 and 10001 → PIQ-3) and posted a **duplicate comment, 10002**, on PIQ-1. I should have checked the JSON shape first and run the rerun with `DRY_RUN=1`. Fix: read `acli jira workitem view <key> --fields issuelinks --json` (it has `inwardIssue.key`), and let `ensure_link` run under `DRY_RUN` (writes go through `run()`, so they stay off). Then:

```bash
DRY_RUN=1 e2e/scripts/file-bugs.sh allergy dob   # PIQ-2/PIQ-3 already linked; "nothing new filed or linked; no comment on PIQ-1"
e2e/scripts/file-bugs.sh allergy dob             # same output, no writes; comments still 10000,10001,10002
```

Comment 10002 is still there. Deleting it is a Jira write, so I asked Bryce first.

Jira state after A and B (`acli jira workitem search --jql "project = PIQ ORDER BY key" --csv --fields key,issuetype,priority,status,labels,summary`):

| Key | Type | Priority | Status | Labels | Summary |
|---|---|---|---|---|---|
| PIQ-1 | Story | Medium | To Do | | Intake form keeps allergies and rejects invalid birth dates |
| PIQ-2 | Bug | Highest | To Do | injected-defect, playwright-agents | Allergies are silently dropped when a patient is saved |
| PIQ-3 | Bug | High | To Do | injected-defect, playwright-agents | Future date of birth is accepted and the patient is saved |

---

## What the tests found: "today" is the UTC date (real defect, not injected)

`docs/app.js:65`: `const today = new Date().toISOString().slice(0, 10);` compares a local calendar date with the **UTC** date.

Reproduced with real `timezoneId`s and a pinned clock (Node + `@playwright/test`'s `chromium`, live app, no toggle):

| timezoneId | Local time | UTC | DOB entered | Result |
|---|---|---|---|---|
| Pacific/Kiritimati | 2026-06-16 02:00 | 2026-06-15 12:00 | 2026-06-16 (local **today**) | **rejected**: "Date of birth cannot be in the future.", 0 rows |
| America/New_York | 2026-06-15 21:00 EDT | 2026-06-16 01:00 | 2026-06-16 (local **tomorrow**) | **accepted**: no error, 1 row |
| America/New_York (control) | 2026-06-15 19:30 EDT | 2026-06-15 23:30 | 2026-06-16 (local tomorrow) | rejected, correct |

A correction to the brief: "after 20:00" in New York holds under EDT (UTC−4). Under EST (UTC−5) the window starts at 19:00.

Test: `e2e/tests/dob/found-utc-today.spec.ts`. Two tests, each with `test.use({ timezoneId })`, a pinned clock, `test.fail()`, and an `issue` annotation. The Kiritimati test is marked to fail only when `BUGS` doesn't include `dob`: with the future check turned off, local today is accepted, so the test passes for that reason.

```bash
npx tsc --noEmit                                  # ok
PLAYWRIGHT_HTML_OPEN=never npx playwright test    # clean: 16 passed (the 2 UTC tests are expected failures)
BUGS=allergy ... npx playwright test              # 2 failed (AC1 only), 14 passed
BUGS=dob ...     npx playwright test              # 2 failed (AC2 only), 14 passed; Kiritimati passes, New York is an expected failure
```

**Does `test.fail()` flag the fix?** I checked against a scratch copy of the app (in the session scratchpad, not the repo) with line 65 changed to use the local date, served on `localhost:8766`:

```bash
BASE_URL=http://localhost:8766/Selenium_pytest/ npx playwright test
#  1) ... AC3 local today is accepted in UTC+14 (Pacific/Kiritimati)   Expected to fail, but passed.
#  2) ... AC2 local tomorrow is rejected at 21:00 in New York           Expected to fail, but passed.
#  2 failed, 14 passed
git diff --stat docs/    # empty: the real app is unchanged
```

This also confirms the root cause: changing that one line fixes both cases.

The test was written from the reproduction above, not from a `playwright-cli` session. `timezoneId` is a context option set with `test.use()`, and the seed's attached session can't change it.

Bug 3 draft: `e2e/scripts/bugs/utc-today.txt` (labels `found-by-tests`, `playwright-agents`; proposed Major / Medium). `DRY_RUN=1 e2e/scripts/file-bugs.sh utc-today` checked. Approved as drafted (see below).

### Bug 3 approved, filed as PIQ-4

Bryce approved Major / Medium and asked for 3 runs per case so Frequency matches PIQ-2 and PIQ-3:

```bash
node -e '...for each [timezoneId, pinned clock] x 3: open app, demo/demo, DOB 2026-06-16, Save, read intake-error visibility + row count...'
# case 1: local today, UTC+14 (expect saved)            -> rejected, rejected, rejected
# case 2: local tomorrow, 21:00 EDT (expect rejected)   -> saved, saved, saved
# control: local tomorrow, 19:30 EDT (expect rejected)  -> rejected, rejected, rejected
```

Frequency in the draft changed to "3 of 3" for each case and the control. Then:

```bash
DRY_RUN=1 e2e/scripts/file-bugs.sh utc-today
e2e/scripts/file-bugs.sh utc-today
# created PIQ-4 (utc-today)
# read back PIQ-4: Bug|Medium|found-by-tests,playwright-agents
# ✓ Link between issues has been successfully created (PIQ-4 Relates PIQ-1)
# ✓ Comment on work item PIQ-1 has been successfully added   (10003)
```

### Duplicate comment removed (approved by Bryce)

`acli jira workitem comment list --json` has no timestamps, so I read them from the issue instead:

```bash
acli jira workitem view PIQ-1 --fields comment --json   # id, created, author, sha1(body)
# 10000 2026-10-14T12:14:58 sha1:27b2157e03aa  (plan)
# 10001 2026-10-14T12:59:09 sha1:74c8586632e8  (bugs A+B, original)
# 10002 2026-10-14T12:59:25 sha1:74c8586632e8  (identical body, 16 s later: the duplicate)
# 10003 2026-10-14T13:16:29 sha1:fdfcc2ea9ab5  (bug 3)
acli jira workitem comment delete --help                 # example says --issue, flag list says --key (docs vs reality, #6)
acli jira workitem comment delete --key PIQ-1 --id 10002 # ✓ Successfully deleted the comment with id 10002
acli jira workitem view PIQ-1 --fields comment --json    # 10000, 10001, 10003
```

### Annotation, reruns, reports

```bash
sed -i '' "s/const ISSUE = 'PIQ-TBD'.*/const ISSUE = 'PIQ-4'; \/\/ Jira bug for this defect/" e2e/tests/dob/found-utc-today.spec.ts
npx tsc --noEmit                                          # ok
# 3 x 3 runs again with the 16-test suite (JSON reporter, retries 0)
```

| Run | 1 | 2 | 3 |
|---|---|---|---|
| clean | 16 expected / 0 unexpected | 16 / 0 | 16 / 0 |
| allergy | 14 expected / 2 unexpected | 14 / 2 | 14 / 2 |
| dob | 14 expected / 2 unexpected | 14 / 2 | 14 / 2 |

Per test, everything matches the first record. The new tests (x = failed as expected under `test.fail()`):

| Test | clean | allergy | dob |
|---|---|---|---|
| AC3 local today is accepted in UTC+14 (Pacific/Kiritimati) | xxx | xxx | PPP |
| AC2 local tomorrow is rejected at 21:00 in New York | xxx | xxx | xxx |

0 flaky across 144 test executions.

Reports regenerated with the same `PLAYWRIGHT_HTML_OUTPUT_DIR` loop: **13 MB** (clean 4.0M, allergy 4.5M, dob 4.2M), 48 trace zips; the old files were replaced. Checked with `playwright-cli -s=check` on `localhost:8765`. All six deep links used in PIQ-2/3/4 open the right test with a View Trace button, and both UTC tests show `issue: https://brycegdsc.atlassian.net/browse/PIQ-4`. The testIds for AC1/AC2 are unchanged.

---

## Phase 6: The demo page

`docs/orchestration/index.html`: one static page, no scripts, no external CSS, inline styles using the app's palette (`#1f5f7a`, `#1d2733`, the yellow banner, 8px section cards). Sections: what this is (with the credit line, and the AC wording "drafted with Claude, then reviewed and approved by Bryce Miranda"), the pipeline, the runs, the Jira snapshot, **What the tests found** (PIQ-4), links, and **What the AI got wrong**. The last one lists both script mistakes, the EDT/EST correction, the brief's `comment-create`, #38610, and the skill/acli doc gaps.

Jira snapshot:

```bash
acli jira workitem search --jql "project = PIQ ORDER BY key" --fields key,issuetype,summary,status,priority --csv   # 2026-10-14 13:19 EDT
```

Jira keys are plain text, not links, because the site is private.

### Link check (local server, playwright-cli)

```bash
git push origin orchestration-demo
playwright-cli -s=links open http://localhost:8765/orchestration/
playwright-cli -s=links --raw eval "JSON.stringify([...new Set([...document.querySelectorAll('a[href]')].map(a=>a.href))])"    # 15 links
playwright-cli -s=links --raw eval "(async()=>{...fetch every same-origin link, report status...})()"
#   200 /orchestration/#found, /e2e-report/{clean,allergy,dob}/, /, /?bugs=allergy, /?bugs=dob, /?bugs=allergy,dob
playwright-cli -s=links goto "http://localhost:8765/?bugs=..."   # + eval of bug-allergy / bug-dob .checked
#   /                  {allergy:false, dob:false}
#   /?bugs=allergy     {allergy:true,  dob:false}
#   /?bugs=dob         {allergy:false, dob:true}
#   /?bugs=allergy,dob {allergy:true,  dob:true}
```

GitHub links point at `main`, so they only resolve after the merge. I checked them on the branch instead:

```bash
curl -s -o /dev/null -w '%{http_code}' https://github.com/.../blob/orchestration-demo/<path>   # several 503s, even with 3 s gaps
gh api "repos/brycemiranda/Selenium_pytest/contents/<path>?ref=orchestration-demo"           # all 6 paths exist
gh api ".../contents/docs/app.js?ref=main" --jq .content | base64 -d | sed -n 65p             # const today = new Date().toISOString().slice(0, 10);
playwright-cli -s=links goto https://github.com/.../blob/orchestration-demo/docs/app.js      # title "Unicorn! · GitHub"
```

**Mistake (mine):** my first browser check reported those Unicorn pages (GitHub's 503 page) as "ok", because it only looked for "Not Found" in the title. Caught by reading the printed titles. After a 45 s pause, a retry with a check that rejects `Unicorn|Not Found` loaded both pages correctly. githubstatus.com reported "All Systems Operational", so these were transient errors. **Rechecking every GitHub link on `main` is part of Checkpoint 3.**

### Phone layout

```bash
playwright-cli -s=mobile open --device="iPhone 15" http://localhost:8765/orchestration/
playwright-cli -s=mobile --raw eval "...scrollWidth vs innerWidth, elements past the right edge, script count..."
#   {vw:393, docW:393, overflowing:[], scripts:0, externalCss:0}
playwright-cli -s=mobile screenshot '#pipeline' --filename=pipeline.png   # pipeline wraps into rows, readable
```

---

## Phase 7: README and pull request

- README: "Claude Code orchestration demo" section right after "Try it" (link, one sentence, the credit line).
- Before opening the PR:

```bash
git diff --stat main...HEAD -- tests requirements.txt .gitignore .github/workflows/ci.yml ci pytest.ini api docs/index.html docs/app.js docs/style.css   # empty
git diff main...HEAD -- . ':!docs/e2e-report' | grep -iE '^\+.*(gho_|ghp_|ATATT|api[_-]?token|password\s*=|secret|bearer )'
#   only two hits: this log's own scan command, and the public demo/demo default in fixtures.ts
```

(`pytest.ini` is on the brief's do-not-modify list but doesn't exist in the repo.)

```bash
git push origin orchestration-demo
gh pr create --base main --head orchestration-demo --title "Claude Code orchestration demo: Jira → Playwright tests → Jira bugs → reports" --body-file pr-body.md
#   https://github.com/brycemiranda/Selenium_pytest/pull/1
gh pr checks 1      # test (clean) / test (allergy) / test (dob): pass, for both the push and pull_request runs (6 jobs)
```

The existing CI runs only the Python suites. The new `e2e/` suite isn't in CI; adding a clean-app-only e2e job is waiting on Bryce's decision.

**CHECKPOINT 3:** waiting for Bryce to review and merge. (Review round and post-merge checks below.)

### Checkpoint 3 review round

**1. Credit line (a correction to the brief).** The brief's line was "Orchestrated by Claude Code; requirement, review checkpoints and verification by Bryce Miranda." The acceptance criteria were drafted with Claude and approved by Bryce, so in the page banner and the README it now reads: **"Orchestrated by Claude Code; requirement approval, review checkpoints and verification by Bryce Miranda."** It's also listed under the brief corrections on the page.

**2. #38610 and "Python attach support shipped in Aug 2026" were challenged.** Bryce's separate check today (the GitHub issue page, fetched twice) showed #38610 as Open with no linked PRs. Primary evidence:

```bash
gh issue view 38610 -R microsoft/playwright --json state,stateReason,closedAt,url
#   {"closedAt":"2026-08-11T08:34:42Z","state":"CLOSED","stateReason":"COMPLETED","url":"https://github.com/microsoft/playwright/issues/38610"}
gh api repos/microsoft/playwright/issues/38610/events --jq '.[] | select(.event=="closed" or .event=="reopened") | {event, actor: .actor.login, created_at}'
#   {"event":"closed","actor":"Skn0tt","created_at":"2026-08-11T08:34:42Z"}   (never reopened)
gh pr view 42165 -R microsoft/playwright --json state,mergedAt,closingIssuesReferences
#   MERGED 2026-08-11T08:34:41Z, closes [38610]
playwright-cli -s=issue2 open https://github.com/microsoft/playwright/issues/38610 ; playwright-cli -s=issue2 screenshot
#   rendered page: purple "Closed" badge, linked "#42165"

gh release view v0.9.0 -R microsoft/playwright-pytest --json tagName,publishedAt,url,body
#   v0.9.0, published 2026-08-10T10:00:04Z: "Adds `--playwright-debug=cli`: pytest pauses at the start of the first context and prints a `python -m playwright cli attach …` command ..."
gh api repos/microsoft/playwright-pytest/compare/70e8949905d62e92531973d78a267e3620b6d66f...v0.9.0 --jq '{status}'   # "identical": v0.9.0 is PR #315's merge commit
gh api repos/microsoft/playwright-pytest/compare/70e8949905d62e92531973d78a267e3620b6d66f...v0.8.0 --jq '{status}'   # "behind": not in v0.8.0
python3 -m venv <scratch>/pyenv && <scratch>/pyenv/bin/python -m pip install pytest-playwright==0.10.0
<scratch>/pyenv/bin/python -m pytest --help | grep -A3 -- --playwright-debug
#   --playwright-debug={cli}   Enable Playwright CLI debugging. Requires -s/--capture=no.
```

**Which source was wrong:** the outside check. The API, the event log, the closing PR, the rendered issue page, the release notes and an installed copy of the pinned 0.10.0 all agree. I can't tell why that fetch showed Open; a cached or stale copy of the page is one possibility. Both claims stay. The page now cites the release (v0.9.0), the issue and PR #42165, so readers can check for themselves. (The pytest-playwright check used a throwaway venv in the session scratchpad. The repo's `.venv` and `requirements.txt` were not touched.)

The three new links were checked with `playwright-cli -s=cite` (titles: "Release v0.9.0 · microsoft/playwright-pytest", issue #38610, PR #42165; none was a Unicorn or 404 page). The banner text was read back from the local server.

CI on `8bceead` (the review fixes): 6 of 6 jobs green; PR mergeable. Bryce merged with a merge commit.

---

## After the merge: live verification

```bash
gh pr view 1 --json state,mergedAt,mergeCommit          # MERGED 2026-10-14T18:46:47Z, merge commit 023cfe0
gh api repos/brycemiranda/Selenium_pytest/pages --jq '{status, build_type, source}'   # legacy build from main:/docs
gh api repos/brycemiranda/Selenium_pytest/pages/builds/latest                         # polled until "built 023cfe0"
curl -s -o /dev/null -w '%{http_code}' https://brycemiranda.github.io/Selenium_pytest/orchestration/   # 200
```

All of the following were checked with `playwright-cli` against **https://brycemiranda.github.io/Selenium_pytest/**:

| What | How | Result |
|---|---|---|
| Demo page is the merged version | `-s=live open .../orchestration/`, read `.banner` | "…requirement approval, review checkpoints and verification by Bryce Miranda." |
| 8 same-origin links on the page | `fetch(..., {cache:'no-store'})` from the page | all 200 |
| 4 live-app toggle links | `goto` + read `bug-allergy` / `bug-dob` `.checked` | none / allergy / dob / both, as labelled |
| 10 GitHub links on the page (now on `main`) | `goto` each and reject `Unicorn\|Not Found` titles | all ok |
| Report counts | `goto e2e-report/<run>/`, read `nav` | clean 16/16 passed; allergy 14 passed / 2 failed; dob 14 passed / 2 failed |
| One trace per run | follow "View Trace" for AC3 today / AC1 Penicillin / AC2 far-future | Trace Viewer loads the actions (and the app DOM snapshot); 0 console errors |
| All 15 URLs inside PIQ-2/3/4 | `acli jira workitem view <key> --fields description --json`, pull every `href`, `goto` each | 14 ok on the first pass, incl. all 6 `#?testId=` deep links (right test + View Trace). The `app.js#L65` permalink returned a Unicorn 503 once; `gh api .../contents/docs/app.js?ref=18190416…` showed line 65 is the `toISOString()` line, and a retry 40 s later loaded the page |

Console: only the known `favicon.ico` 404 at the domain root. The Trace Viewer logs 3 iframe-sandbox warnings, which are its own and not errors.

**Mistake (mine):** my first live trace check reported "0 action rows" for all three traces. I had anchored the `playwright-cli find --regex` pattern with `^`, but `find` matches against indented snapshot lines. Looking at the page showed the trace fully loaded. With the unanchored pattern (the one used locally in Phase 4), all three traces show their actions.

---

## Finish

**Same steps without an AI agent.** Every step in this run is a CLI command recorded above: `npx playwright test` with `BUGS`, `PLAYWRIGHT_HTML_OUTPUT_DIR`, `acli jira workitem …`, `gh …`. Apart from the parts that need judgement (planning, drafting, reviewing), the same commands could run in CI with no agent. For example, a job runs the suite per toggle, publishes the reports with an Actions Pages deploy, and runs `e2e/scripts/file-bugs.sh` (which is idempotent) behind a manual approval.

Open question for Bryce: add an `e2e` job to CI that runs the TypeScript suite on the **clean app only**. Not done without asking.

**Decision (Bryce, 2026-10-14): no CI job today. `.github/workflows/ci.yml` is left as is.**

## Next steps

- **CI job for the e2e suite (planned, not built):** run `e2e/` in CI against a local copy of the app, not the live site. Serve it with `python -m http.server <port> --directory docs`, so the URL is `http://localhost:<port>/` (no `/Selenium_pytest/` subpath), and run `BASE_URL=http://localhost:<port>/ npx playwright test` on the **clean app only** (no `BUGS`). Upload the HTML report (`e2e/playwright-report/`) as a workflow artifact. Running the suite locally against a served copy already works: Phase 3's `test.fail()` check did the same thing against a patched copy on `localhost:8766`.
- Later: replace the committed `docs/e2e-report/` with an Actions Pages deploy that `needs:` the tests (see Phase 4).
