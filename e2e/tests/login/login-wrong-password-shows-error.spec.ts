// spec: specs/patient-intake.md (5.2)
// seed: tests/seed.spec.ts (starts before sign-in)
import { test, expect, logIn } from '../fixtures';

test.describe('Login', () => {
  test('NO-AC (login) wrong password shows a visible error', async ({ page }) => {
    // 1. Enter demo / wrong-password and click Sign in
    await logIn(page, 'demo', 'wrong-password');

    const error = page.getByTestId('login-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveText('Invalid username or password.');
    await expect(page.getByTestId('intake-name')).toBeHidden();
  });
});
