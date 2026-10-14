import { defineConfig, devices } from '@playwright/test';

// The app lives under a subpath (/Selenium_pytest/). Keep the trailing slash so that
// relative navigation like page.goto('./') stays inside the subpath instead of
// resolving to the domain root.
const rawBaseURL = process.env.BASE_URL || 'https://brycemiranda.github.io/Selenium_pytest/';
const baseURL = rawBaseURL.endsWith('/') ? rawBaseURL : `${rawBaseURL}/`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // a retry would hide flakiness; the run record counts raw passes and failures
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    testIdAttribute: 'data-test-id',
    trace: 'on', // passing traces are part of the demo evidence, not only failing ones
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
