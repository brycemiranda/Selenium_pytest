// spec: specs/patient-intake.md (1.1)
// seed: tests/seed.spec.ts
// Fails with BUGS=allergy (allergies silently dropped on save).
import { test, expect, savePatient, patientRow } from '../fixtures';

test.describe('Allergies are saved exactly as entered', () => {
  test('AC1 Penicillin is shown for that patient', async ({ loggedInPage: page }) => {
    // 1. Save patient Ada Testpatient with allergy "Penicillin"
    await savePatient(page, { name: 'Ada Testpatient', dob: '1990-04-12', allergies: 'Penicillin', medication: 'Lisinopril' });
    await expect(page.getByTestId('intake-error')).toBeHidden();

    // 2. Save a second patient with a different allergy
    await savePatient(page, { name: 'Bo Testpatient', dob: '1985-01-02', allergies: 'Latex', medication: 'Metformin' });
    await expect(page.getByTestId('patient-row')).toHaveCount(2);
    await expect(patientRow(page, 'Ada Testpatient').locator('[data-field="allergies"]')).toHaveText('Penicillin');
    await expect(patientRow(page, 'Bo Testpatient').locator('[data-field="allergies"]')).toHaveText('Latex');
  });
});
