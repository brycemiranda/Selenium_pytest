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
