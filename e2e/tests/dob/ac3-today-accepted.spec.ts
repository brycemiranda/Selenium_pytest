// spec: specs/patient-intake.md (3.1)
// seed: tests/seed.spec.ts
import { test, expect, savePatient, patientRow } from '../fixtures';

test.describe('Today is accepted', () => {
  test('AC3 today is accepted as a date of birth', async ({ loggedInPage: page }) => {
    // 1. Pin the clock to 2026-06-15 12:00 UTC (same calendar date in UTC-11..UTC+11)
    await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));

    // 2. Save patient Fay Today with DOB 2026-06-15
    await savePatient(page, { name: 'Fay Today', dob: '2026-06-15', allergies: '', medication: '' });

    await expect(page.getByTestId('intake-error')).toBeHidden();
    await expect(patientRow(page, 'Fay Today').locator('[data-field="dob"]')).toHaveText('2026-06-15');
  });
});
