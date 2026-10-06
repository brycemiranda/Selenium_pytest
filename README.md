# Patient Intake QA Demo

A small Selenium + pytest suite against a fictional clinic's patient-intake app, with switchable bugs to show each test catches the defect it claims to.

> Fictional clinic (Larkspur Hollow Clinic). Fake data only. No real patient information.

## What's here

- `docs/` — static app (HTML/CSS/JS): login, intake form, in-memory patient list, bug toggles
- `tests/pages/` — Page Objects: `LoginPage`, `IntakePage`, `PatientListPage`
- `tests/` — 5 tests, browser setup and screenshot-on-failure in `conftest.py`

## Try the bug toggles

Log in with `demo` / `demo`. Turn bugs on with the checkboxes, or by URL:

- `?bugs=allergy` — allergies are silently dropped on save
- `?bugs=dob` — a future date of birth is accepted
- `?bugs=allergy,dob` — both

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

# terminal 1: serve the app
python -m http.server 8001 --directory docs

# terminal 2: run the tests
pytest -v                    # clean app: 5 pass
pytest -v --bugs=allergy     # allergy test fails
pytest -v --bugs=dob         # DOB test fails
```

Options:
- `BASE_URL=...` runs against any deployed copy (default `http://localhost:8001`)
- `CHROME_BIN=/usr/bin/chromium` if Chrome isn't found automatically (e.g. Debian)
- `--headed` shows the browser (needs a desktop)

Failed tests save a screenshot to `screenshots/<test_name>.png`.

## Design choices

- `data-test-id` on every element tests touch, so tests don't break when styling or layout changes
- Explicit waits (`WebDriverWait`), never fixed sleeps, and every wait has a readable failure message
- Page Objects hold locators and waits; tests read as clinical workflow steps
- Bugs are injected at run time, so the same tests prove both "works" and "catches the break"

## Next steps

- CI on GitHub Actions: matrix of clean / `allergy` / `dob`, expecting the matching test to fail
- More bug types: impossible dates (`2026-02-31`), lost medication field, duplicate patients
- API-level tests once there's a backend
- Accessibility checks (labels, keyboard-only flow) with axe-core
- Cross-browser runs via Selenium Grid
- Lint in CI (flake8) to catch redefined test functions
