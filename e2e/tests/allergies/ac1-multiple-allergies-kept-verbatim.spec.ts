// spec: specs/patient-intake.md (1.2)
// seed: tests/seed.spec.ts
// Fails with BUGS=allergy (allergies silently dropped on save).
import { test, expect, savePatient, patientRow } from '../fixtures';

test.describe('Allergies are saved exactly as entered', () => {
  test('AC1 multiple allergies are kept verbatim', async ({ loggedInPage: page }) => {
    // 1. Save patient Cy Testpatient with allergies "Penicillin, Sulfa drugs"
    await savePatient(page, { name: 'Cy Testpatient', dob: '1978-09-30', allergies: 'Penicillin, Sulfa drugs', medication: '' });
    await expect(patientRow(page, 'Cy Testpatient').locator('[data-field="allergies"]')).toHaveText('Penicillin, Sulfa drugs');
  });
});
