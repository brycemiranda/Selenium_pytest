// spec: specs/patient-intake.md (2.1)
// seed: tests/seed.spec.ts
// Fails with BUGS=dob (future date of birth accepted).
import { test, expect, savePatient } from '../fixtures';

test.describe('A future date of birth is rejected', () => {
  test('AC2 far-future date of birth is rejected and not saved', async ({ loggedInPage: page }) => {
    // 1. Fill patient Dee Future with DOB 2099-01-01 and click Save
    await savePatient(page, { name: 'Dee Future', dob: '2099-01-01', allergies: 'Latex', medication: 'Aspirin' });

    const error = page.getByTestId('intake-error');
    await expect(error).toBeVisible(); // visible first: a text check alone passes on a hidden element
    await expect(error).toHaveText('Date of birth cannot be in the future.');
    await expect(page.getByTestId('patient-row')).toHaveCount(0);
  });
});
