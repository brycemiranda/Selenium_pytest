# Patient Intake Test Plan

Requirement: Jira story **PIQ-1**, "Intake form keeps allergies and rejects invalid birth dates". The acceptance criteria were drafted with Claude, then reviewed and approved by Bryce Miranda.
Plan written by Claude Code from a `playwright-cli` exploration of the live app (2026-10-14), following the plan step of the `playwright-cli` skill (`references/test-generation.md`).

## Application Overview

Larkspur Hollow Clinic (fictional) is a single static page. A nurse signs in (`demo`/`demo`), fills in a new patient's name, date of birth (free text, `YYYY-MM-DD`), allergies and current medication, and saves. Saved patients appear in a table on the same page, held in memory only (a reload clears them and signs you out). The story matters because prescribing and dosing rely on two fields: a dropped allergy can lead to a harmful prescription, and an impossible date of birth corrupts age-based dosing. Two injected defects can be switched on with `?bugs=allergy` (allergies silently dropped on save) and `?bugs=dob` (future DOB accepted). The suite must fail on exactly the scenarios that cover each one.

## Acceptance criteria (quoted from PIQ-1)

- **AC1**: When I save a patient with allergy "Penicillin", the patient list shows "Penicillin" for that patient.
- **AC2**: A date of birth in the future is rejected with a visible error message, and the patient is not saved.
- **AC3**: Today's date is accepted as a date of birth.
- **AC4**: A date of birth not in YYYY-MM-DD format is rejected with a visible error message.

## Conventions

- Every scenario starts from the seed (`tests/seed.spec.ts`): app opened at `./` (+ `?bugs=<BUGS>`), toggle state checked, signed in as `demo`/`demo`. Login scenarios start from the same page but before sign-in.
- Locators are `getByTestId(...)` (`data-test-id`). Each saved patient is a `patient-row` with cells marked `data-field="name|dob|allergies|medication"`.
- For every error message: assert it is **visible** first, then assert its text.
- "Not saved" means: zero `patient-row`s (each test starts from an empty list).
- **Date pinning:** the app takes "today" from the browser clock in **UTC** (`toISOString()`). The boundary scenarios (2.2, 3.1) pin the browser clock to **2026-06-15T12:00:00Z** with `page.clock.setFixedTime`. At noon UTC the local and UTC dates are the same in every time zone from UTC−11 to UTC+11, so "today" = `2026-06-15` and "tomorrow" = `2026-06-16` wherever the suite runs. See *Known gaps* for the defect this avoids testing.
- **Bug isolation:** only AC1 scenarios assert the allergies cell, and only AC2 scenarios assert future-date rejection. So `BUGS=allergy` should fail exactly 1.1–1.2, and `BUGS=dob` exactly 2.1–2.2.
- Test titles start with the AC id (`AC1 …`). Login scenarios have no AC, so they start with `NO-AC (login)`.

## Test Scenarios

### 1. Allergies are saved exactly as entered

**Seed:** `tests/seed.spec.ts`

#### 1.1. ac1-penicillin-shown-for-that-patient

**Covers:** AC1 · **Expected to fail with:** `BUGS=allergy`
**File:** `tests/allergies/ac1-penicillin-shown-for-that-patient.spec.ts`

**Steps:**
  1. Save patient "Ada Testpatient", DOB 1990-04-12, allergies "Penicillin", medication "Lisinopril"
    - expect: the intake error is hidden
  2. Save a second patient "Bo Testpatient", DOB 1985-01-02, allergies "Latex", medication "Metformin"
    - expect: 2 patient rows
    - expect: Ada's row shows allergies "Penicillin" (exact)
    - expect: Bo's row shows allergies "Latex" (exact), so each allergy stays with its own patient

#### 1.2. ac1-multiple-allergies-kept-verbatim

**Covers:** AC1 ("saved exactly as entered") · **Expected to fail with:** `BUGS=allergy`
**File:** `tests/allergies/ac1-multiple-allergies-kept-verbatim.spec.ts`

**Steps:**
  1. Save patient "Cy Testpatient", DOB 1978-09-30, allergies "Penicillin, Sulfa drugs", medication ""
    - expect: Cy's row shows allergies "Penicillin, Sulfa drugs" (exact)

### 2. A future date of birth is rejected

**Seed:** `tests/seed.spec.ts`

#### 2.1. ac2-far-future-dob-rejected

**Covers:** AC2 · **Expected to fail with:** `BUGS=dob`
**File:** `tests/dob/ac2-far-future-dob-rejected.spec.ts`

**Steps:**
  1. Fill patient "Dee Future", DOB 2099-01-01, allergies "Latex", medication "Aspirin"; click Save
    - expect: the intake error is visible
    - expect: the intake error text is "Date of birth cannot be in the future."
    - expect: 0 patient rows

#### 2.2. ac2-tomorrow-rejected

**Covers:** AC2 (boundary: first future day) · **Expected to fail with:** `BUGS=dob`
**File:** `tests/dob/ac2-tomorrow-rejected.spec.ts`

**Steps:**
  1. Pin the clock to 2026-06-15T12:00:00Z
  2. Fill patient "Eli Tomorrow", DOB 2026-06-16; click Save
    - expect: the intake error is visible
    - expect: the intake error text is "Date of birth cannot be in the future."
    - expect: 0 patient rows

### 3. Today is accepted

**Seed:** `tests/seed.spec.ts`

#### 3.1. ac3-today-accepted

**Covers:** AC3 (boundary: last valid day)
**File:** `tests/dob/ac3-today-accepted.spec.ts`

**Steps:**
  1. Pin the clock to 2026-06-15T12:00:00Z
  2. Save patient "Fay Today", DOB 2026-06-15, no allergies
    - expect: the intake error is hidden
    - expect: Fay's row exists with DOB "2026-06-15"

### 4. Date of birth must be YYYY-MM-DD

**Seed:** `tests/seed.spec.ts`

#### 4.1. ac4-invalid-dob-format-rejected

**Covers:** AC4
**File:** `tests/dob/ac4-invalid-dob-format-rejected.spec.ts`

Data-driven: one test per value, in one file (a deliberate deviation from the skill's "one test per file", so the six formats stay side by side).
Values: `1990/04/12` (slashes), `12-04-1990` (DD-MM-YYYY), `1990-4-12` (no zero padding), `19900412` (no separators), `abc` (not a date), `` (empty).

**Steps (per value):**
  1. Fill patient "Gus Format", DOB `<value>`; click Save
    - expect: the intake error is visible
    - expect: the intake error text is "Date of birth must be YYYY-MM-DD."
    - expect: 0 patient rows

### 5. Login

**Seed:** `tests/seed.spec.ts` (these tests use the page fixture before sign-in)

#### 5.1. login-valid-credentials-shows-intake

**Covers:** no AC in PIQ-1 (requested in the brief)
**File:** `tests/login/login-valid-credentials-shows-intake.spec.ts`

**Steps:**
  1. Enter `demo` / `demo`, click Sign in
    - expect: the intake name field is visible
    - expect: the Sign in button is hidden
    - expect: the login error is hidden

#### 5.2. login-wrong-password-shows-error

**Covers:** no AC in PIQ-1 (requested in the brief)
**File:** `tests/login/login-wrong-password-shows-error.spec.ts`

**Steps:**
  1. Enter `demo` / `wrong-password`, click Sign in
    - expect: the login error is visible
    - expect: the login error text is "Invalid username or password."
    - expect: the intake name field is hidden (not signed in)

### 6. Found by tests: "today" is the UTC date (added after Checkpoint 2)

**Seed:** `tests/seed.spec.ts` · **File:** `tests/dob/found-utc-today.spec.ts`

A real defect (not injected), found while exploring the 2.2 / 3.1 boundary. Both tests are marked `test.fail()` and annotated with the Jira bug, so the clean run stays green and Playwright reports "expected to fail, but passed" once the bug is fixed. Written from a verified Node/Playwright reproduction rather than a `playwright-cli` session, because `timezoneId` is set per test with `test.use()` and the seed session can't change it.

#### 6.1. found-utc-today: local today accepted in UTC+14

**Covers:** AC3
  1. `timezoneId: 'Pacific/Kiritimati'`, clock pinned to 2026-06-15T12:00:00Z (local 2026-06-16 02:00)
  2. Save "Ivy Newborn" with DOB 2026-06-16
    - expect: the intake error is hidden; Ivy's row has DOB "2026-06-16"
  - `test.fail()` on the clean app and with `BUGS=allergy`. With `BUGS=dob` the future check is off, so the test passes, and it is not marked to fail there.

#### 6.2. found-utc-today: local tomorrow rejected in a New York evening

**Covers:** AC2
  1. `timezoneId: 'America/New_York'`, clock pinned to 2026-06-16T01:00:00Z (local 2026-06-15 21:00 EDT)
  2. Fill "Jo Tomorrow" with DOB 2026-06-16; click Save
    - expect: the intake error is visible, with text "Date of birth cannot be in the future."; 0 patient rows
  - `test.fail()` under every toggle (with `BUGS=dob` it fails for two reasons)

## AC → scenario coverage

| AC | Scenarios | Tests |
|---|---|---|
| AC1 | 1.1, 1.2 | 2 |
| AC2 | 2.1, 2.2, 6.2 (test.fail) | 3 |
| AC3 | 3.1, 6.1 (test.fail) | 2 |
| AC4 | 4.1 | 6 |
| *(none)* login | 5.1, 5.2 | 2 |

Every AC has at least one scenario. Scenarios with no AC: 5.1 and 5.2 (login is not in PIQ-1).

## Known gaps (seen during exploration, deliberately not tested in this run)

Each of these would **fail on the clean app**. The brief requires the clean run to pass, so they need a decision rather than a test:

1. **"Today" is the UTC date, not the clinic's local date.** *(Update after Checkpoint 2: filed as a Jira bug and covered by section 6 with `test.fail()`.)* `validate()` uses `new Date().toISOString().slice(0, 10)`. Reproduced live: with the clock pinned to 2026-10-15T02:00Z (22:00 on Oct 14 in New York), DOB `2026-10-15`, the local *tomorrow*, was **accepted**. In zones ahead of UTC it goes the other way: early in the morning, local *today* is rejected as future. That breaks AC2 or AC3 for part of every day, depending on the zone. The date pinning above keeps the suite deterministic, but it also means the suite does not catch this.
2. **Impossible calendar dates are accepted.** `2026-02-30` and `0000-00-00` were saved. `2026-13-45` was rejected only because it sorts as "in the future". AC4 only talks about *format*, so this is arguably outside the story.
3. Surrounding whitespace is trimmed (`" 1990-04-12 "` is saved as `1990-04-12`). That's reasonable, but it's not "exactly as entered", so it isn't asserted either way.
4. Not in the story and not tested: "Name is required." validation, form reset after a save, values kept after a rejected save, reload clearing the list.
