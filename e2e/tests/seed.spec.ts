import { test, expect } from './fixtures';

// Seed for plan / generate / heal: the `loggedInPage` fixture opens the app
// (with ?bugs=... from BUGS, if set) and logs in as demo/demo.
// Every scenario starts from this state.
test('seed', async ({ loggedInPage: page }) => {
  await expect(page.getByTestId('intake-name')).toBeVisible();
});
