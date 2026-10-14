// spec: specs/patient-intake.md (2.2)
// seed: tests/seed.spec.ts
// Fails with BUGS=dob (future date of birth accepted).
import { test, expect, savePatient } from '../fixtures';

test.describe('A future date of birth is rejected', () => {
  test('AC2 tomorrow is rejected and not saved', async ({ loggedInPage: page }) => {
    // 1. Pin the clock to 2026-06-15 12:00 UTC (same calendar date in UTC-11..UTC+11)
    await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));

    // 2. Fill patient Eli Tomorrow with DOB 2026-06-16 and click Save
    await savePatient(page, { name: 'Eli Tomorrow', dob: '2026-06-16', allergies: '', medication: '' });

    const error = page.getByTestId('intake-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveText('Date of birth cannot be in the future.');
    await expect(page.getByTestId('patient-row')).toHaveCount(0);
  });
});
