# Patient Intake QA Demo

[![CI](https://github.com/brycemiranda/Selenium_pytest/actions/workflows/ci.yml/badge.svg)](https://github.com/brycemiranda/Selenium_pytest/actions/workflows/ci.yml)

A small Selenium + pytest suite against a fictional clinic's patient-intake app, with switchable bugs to show each test catches the defect it claims to.

> Fictional clinic (Larkspur Hollow Clinic). Fake data only. No real patient information.

## Try it

Sign in with `demo` / `demo`, then add a patient.

| Link | What to try | What you'll see |
|---|---|---|
| [Clean app](https://brycemiranda.github.io/Selenium_pytest/) | Add a patient with allergy `Penicillin`, then one with DOB `2099-01-01` | Penicillin shows in the list, and the future DOB is rejected with an error |
| [Allergy bug on](https://brycemiranda.github.io/Selenium_pytest/?bugs=allergy) | Add a patient with allergy `Penicillin` | The patient saves, but the Allergies cell is empty and nothing warns you |
| [DOB bug on](https://brycemiranda.github.io/Selenium_pytest/?bugs=dob) | Add a patient with DOB `2099-01-01` | The patient saves with no error |

The checkboxes on the page switch bugs on and off too. `?bugs=allergy,dob` turns on both.

Video walkthrough (2–3 min): coming soon

## What's here

- `docs/` — static app (HTML/CSS/JS): login, intake form, in-memory patient list, bug toggles
- `tests/pages/` — Page Objects: `LoginPage`, `IntakePage`, `PatientListPage`
- `tests/` — 5 Selenium tests, browser setup and screenshot-on-failure in `conftest.py`
- `tests/test_intake_playwright.py` — the allergy and DOB tests ported to Playwright, kept side by side with the Selenium versions

## Bug → test → why it matters

| Bug | Test that catches it | Why it matters clinically |
|---|---|---|
| Allergies silently dropped on save | `test_allergies_preserved_after_save` | An empty allergy field reads as "no known allergies." A clinician could prescribe a drug the patient reacts to. Nothing on screen signals the loss, and the basic "save works" test still passes. |
| Future date of birth accepted | `test_future_dob_is_rejected` | Date of birth drives age-based dosing, screening, and patient matching. A bad DOB can attach a record to the wrong patient or create a duplicate. |

## Run locally

Requires Python 3.11+ and Chrome or Chromium.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium   # Playwright's own browser

# terminal 1: serve the app
python -m http.server 8001 --directory docs

# terminal 2: run the tests
pytest -v                    # clean app: 7 pass
pytest -v --bugs=allergy     # both allergy tests fail (Selenium + Playwright)
pytest -v --bugs=dob         # both DOB tests fail (Selenium + Playwright)
```

Options:
- `BASE_URL=...` runs against any deployed copy (default `http://localhost:8001`)
- `CHROME_BIN=/usr/bin/chromium` if Chrome isn't found automatically (e.g. Debian)
- `--headed` shows the browser (needs a desktop)
- `--tracing=retain-on-failure` saves a trace of each failed Playwright test in `test-results/`; open it at https://trace.playwright.dev

Failed tests save a screenshot to `screenshots/<test_name>.png`.

## Design choices

- `data-test-id` on every element tests touch, so tests don't break when styling or layout changes
- Explicit waits (`WebDriverWait`), never fixed sleeps, and every wait has a readable failure message
- Page Objects hold locators and waits; tests read as clinical workflow steps
- Bugs are injected at run time, so the same tests prove both "works" and "catches the break"

## Next steps

- More bug types: impossible dates (`2026-02-31`), lost medication field, duplicate patients
- API-level tests once there's a backend
- Accessibility checks (labels, keyboard-only flow) with axe-core
- Cross-browser runs via Selenium Grid
- Lint in CI (flake8) to catch redefined test functions

## Selenium vs Playwright (same two tests)

`tests/test_intake.py` (Selenium) and `tests/test_intake_playwright.py` (Playwright) check the same
two things: allergies survive a save, and a future date of birth is rejected.

| | Selenium | Playwright |
|---|---|---|
| Waiting | Explicit `WebDriverWait` in `BasePage`, written by me | Built in: actions wait for the element, `expect` retries for up to 5 s |
| Locators | `(By.CSS_SELECTOR, '[data-test-id="..."]')` via a helper | `get_by_test_id("...")`, after setting the attribute name once |
| Same 2 tests, local app, 3 runs | 2.21–2.81 s | 0.85–0.97 s |
| When a test fails | Screenshot (`conftest.py`) | Screenshot, plus a trace: every step, the page before and after, network |
| Setup | Uses the Chrome already on the machine | Downloads its own browser (`playwright install chromium`), in CI too |

**Easier with Playwright.** No wait code. Failure messages show what was retried and a text snapshot
of the page: the DOB failure showed the saved row with a 2099 birth date. Traces replace guessing
from one screenshot.

**Harder, or worth watching**
- Installing pytest-playwright stopped the Selenium suite from starting: both defined `--headed`.
- `to_contain_text()` does not check visibility. My first port missed an error message that was set
  but hidden; the Selenium version caught it, because its visibility check lives inside a
  page-object helper. Adding `to_be_visible()` fixed the port.
- Every real failure costs the full 5 s retry window.
- Codegen, recorded with the DOB bug on, wrote an assertion that the 2099 patient was saved. Useful
  for finding locators; the assertions have to come from the requirement.

**Speed, honestly.** In one `--durations` run, the two Selenium tests spent 1.14 s in setup and
1.06 s in their steps; the two Playwright tests spent 0.45 s and 0.37 s. About half the gap is setup:
my Selenium fixture starts a new Chrome for every test, while Playwright launches one browser per run
(0.40 s once, then 0.05 s per test) and gives each test its own isolated context. The other half is
the steps themselves, even though Playwright's steps include logging in (the Selenium tests log in
during setup). Selenium sends every command to the browser as a separate request through
chromedriver, and `last_patient()` alone makes about ten. I haven't measured that separately, so it
is my best explanation, not a proven one.

**Flakiness.** Every run so far did what I expected, with no intermittent failures. That is far too
few runs to claim anything; real evidence would be many repeated runs, for example in CI.

**When I'd choose each.** Playwright for a new web UI suite: less wait code, traces, fast isolated
tests. Selenium when a team already has Selenium tests, infrastructure and experience, or needs a
browser Playwright doesn't drive, such as branded Safari (Playwright uses its own WebKit build).

## CI

Every push and pull request runs both suites headless on GitHub Actions
(`.github/workflows/ci.yml`): Selenium in Chrome, Playwright in its own Chromium. It runs as a
3-job matrix:

| Job | Bugs on | Passes only if |
|---|---|---|
| `test (clean)` | none | all 7 tests pass |
| `test (allergy)` | `allergy` | exactly the two allergy tests fail: `test_allergies_preserved_after_save` and `test_pw_allergies_preserved_after_save[chromium]` |
| `test (dob)` | `dob` | exactly the two DOB tests fail: `test_future_dob_is_rejected` and `test_pw_future_dob_is_rejected[chromium]` |

pytest writes JUnit XML, and `ci/check_results.py` compares the set of failed tests with the
expected set. Any extra failure, any missing failure, a skipped test, or zero passes turns the
job red. So a green bug job means the suite caught *that* bug, not that "something broke".

Each job uploads an artifact (`results-clean` / `-allergy` / `-dob`) with the pytest-html
report, the JUnit XML, the app server log, failure screenshots, and a Playwright trace for each
failed Playwright test (`test-results/`).

## Project notes

**What I built.** A static patient-intake app for a fictional clinic (fake data only), a
5-test Selenium + pytest suite (Page Object Model, explicit waits, `data-test-id` locators),
two injectable bugs (`?bugs=allergy,dob` / `--bugs=`), and a CI matrix that proves the suite
catches each bug on every push.

**What each test catches**

| Test | Catches |
|---|---|
| `test_valid_login` | login broken, or the intake form never appears |
| `test_invalid_login_shows_error` | bad credentials accepted, or no error shown |
| `test_saved_patient_appears_in_list` | a saved patient missing from the list |
| `test_allergies_preserved_after_save` | `allergy` bug: allergies silently dropped on save |
| `test_future_dob_is_rejected` | `dob` bug: a future date of birth accepted |

**What I learned**
- Under the allergy bug, the "patient appears in list" test still passes. Only a test that
  checks the stored value catches it, and an empty allergy field reads as "no known allergies".
- An "expected failure" has to be specific. Inverting the exit code would turn a crashed
  browser green. My dob test fails on a wait timeout, not an assertion, so the check matches by
  test name, not by exception type.
- I tested the checker itself with a deliberately wrong expectation, to prove it can say no.
- An invalid workflow file fails with no duration: nothing ran at all. Reading the file with
  line numbers found a step indented under `strategy:`.

**What's next**
- Make the bug jobs check *why* the expected test failed (the assertion text or wait message),
  not just *which* test failed.
- Write the same future-date-of-birth validation test in ObjectScript with `%UnitTest` on
  InterSystems IRIS Community Edition.
