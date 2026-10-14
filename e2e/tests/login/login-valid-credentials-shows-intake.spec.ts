// spec: specs/patient-intake.md (5.1)
// seed: tests/seed.spec.ts (starts before sign-in)
import { test, expect, logIn } from '../fixtures';

test.describe('Login', () => {
  test('NO-AC (login) valid credentials show the intake form', async ({ page }) => {
    // 1. Enter demo / demo and click Sign in
    await logIn(page, 'demo', 'demo');

    await expect(page.getByTestId('intake-name')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeHidden();
    await expect(page.getByTestId('login-error')).toBeHidden();
  });
});
