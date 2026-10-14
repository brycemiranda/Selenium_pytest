// spec: specs/patient-intake.md (4.1)
// seed: tests/seed.spec.ts
// Data-driven: one test per value (deliberate deviation from one-test-per-file, see the plan).
import { test, expect, savePatient } from '../fixtures';

const invalidDobs: [string, string][] = [
  ['1990/04/12', 'slashes'],
  ['12-04-1990', 'DD-MM-YYYY'],
  ['1990-4-12', 'no zero padding'],
  ['19900412', 'no separators'],
  ['abc', 'not a date'],
  ['', 'empty'],
];

test.describe('Date of birth must be YYYY-MM-DD', () => {
  for (const [dob, why] of invalidDobs) {
    test(`AC4 "${dob}" (${why}) is rejected with a visible error`, async ({ loggedInPage: page }) => {
      // 1. Fill patient Gus Format with the invalid DOB and click Save
      await savePatient(page, { name: 'Gus Format', dob, allergies: '', medication: '' });

      const error = page.getByTestId('intake-error');
      await expect(error).toBeVisible();
      await expect(error).toHaveText('Date of birth must be YYYY-MM-DD.');
      await expect(page.getByTestId('patient-row')).toHaveCount(0);
    });
  }
});
