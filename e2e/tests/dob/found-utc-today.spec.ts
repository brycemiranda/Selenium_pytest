// spec: specs/patient-intake.md (6.1, 6.2)
// seed: tests/seed.spec.ts
// Real defect found by the tests (not injected): docs/app.js computes "today" with
// new Date().toISOString(), i.e. the UTC date, not the user's local date.
// Both tests are marked test.fail(): they fail today because of the bug, which keeps the clean run
// green. Once the bug is fixed they pass, and Playwright reports "expected to fail, but passed"
// so the marker gets removed.
import { test, expect, savePatient, patientRow, activeBugs } from '../fixtures';

const ISSUE = 'PIQ-4'; // Jira bug for this defect
const issue = { type: 'issue', description: `https://brycegdsc.atlassian.net/browse/${ISSUE}` };

test.describe('Found by tests: "today" is the UTC date', () => {
  test.describe('UTC+14', () => {
    test.use({ timezoneId: 'Pacific/Kiritimati' });

    test('AC3 local today is accepted in UTC+14 (Pacific/Kiritimati)', { annotation: issue }, async ({ loggedInPage: page }) => {
      // With ?bugs=dob the future check is off, so local today is accepted and this passes for that reason.
      test.fail(!activeBugs.includes('dob'), `${ISSUE}: local today is rejected as "in the future" while the UTC date is still yesterday`);

      // 1. Pin the clock to 2026-06-15 12:00 UTC = 2026-06-16 02:00 local
      await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));

      // 2. Save a newborn with DOB = local today
      await savePatient(page, { name: 'Ivy Newborn', dob: '2026-06-16', allergies: '', medication: '' });

      await expect(page.getByTestId('intake-error')).toBeHidden();
      await expect(patientRow(page, 'Ivy Newborn').locator('[data-field="dob"]')).toHaveText('2026-06-16');
    });
  });

  test.describe('US evening', () => {
    test.use({ timezoneId: 'America/New_York' });

    test('AC2 local tomorrow is rejected at 21:00 in New York', { annotation: issue }, async ({ loggedInPage: page }) => {
      test.fail(true, `${ISSUE}: after 20:00 EDT (19:00 EST) the UTC date is already tomorrow, so tomorrow is accepted`);

      // 1. Pin the clock to 2026-06-16 01:00 UTC = 2026-06-15 21:00 EDT
      await page.clock.setFixedTime(new Date('2026-06-16T01:00:00Z'));

      // 2. Fill a patient with DOB = local tomorrow and click Save
      await savePatient(page, { name: 'Jo Tomorrow', dob: '2026-06-16', allergies: '', medication: '' });

      const error = page.getByTestId('intake-error');
      await expect(error).toBeVisible();
      await expect(error).toHaveText('Date of birth cannot be in the future.');
      await expect(page.getByTestId('patient-row')).toHaveCount(0);
    });
  });
});
