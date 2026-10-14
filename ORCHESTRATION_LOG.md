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
