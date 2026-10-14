import { test as baseTest, expect, type Page } from '@playwright/test';
export { expect } from '@playwright/test';

const KNOWN_BUGS = ['allergy', 'dob'];

// BUGS=allergy | dob | allergy,dob turns on the app's injected defects via ?bugs=...
// This is the only place that reads it.
export const activeBugs: string[] = (process.env.BUGS || '')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

for (const bug of activeBugs) {
  if (!KNOWN_BUGS.includes(bug)) {
    throw new Error(`Unknown BUGS value "${bug}". Expected one of: ${KNOWN_BUGS.join(', ')}`);
  }
}

// Relative path ('./'), so it resolves against baseURL's subpath. '/' would go to the domain root.
export const appPath = activeBugs.length ? `./?bugs=${activeBugs.join(',')}` : './';

async function openApp(page: Page) {
  await page.goto(appPath);
  // Guard: prove the toggle really took effect, so a run labelled "dob" can't silently test the clean app.
  for (const bug of KNOWN_BUGS) {
    const box = page.getByTestId(`bug-${bug}`);
    if (activeBugs.includes(bug)) await expect(box).toBeChecked();
    else await expect(box).not.toBeChecked();
  }
}

export async function logIn(page: Page, username = 'demo', password = 'demo') {
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

export type Patient = { name: string; dob: string; allergies: string; medication: string };

export async function savePatient(page: Page, p: Patient) {
  await page.getByTestId('intake-name').fill(p.name);
  await page.getByTestId('intake-dob').fill(p.dob);
  await page.getByTestId('intake-allergies').fill(p.allergies);
  await page.getByTestId('intake-medication').fill(p.medication);
  await page.getByTestId('intake-save').click();
}

// The app renders each saved patient as a row with data-test-id="patient-row"
// and one cell per field marked data-field="name|dob|allergies|medication".
export function patientRow(page: Page, name: string) {
  return page.getByTestId('patient-row').filter({
    has: page.locator('[data-field="name"]', { hasText: new RegExp(`^${escapeRegExp(name)}$`) }),
  });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type Fixtures = {
  /** Fresh app page, not logged in. */
  page: Page;
  /** Fresh app page, logged in as demo/demo. */
  loggedInPage: Page;
};

export const test = baseTest.extend<Fixtures>({
  page: async ({ page }, use) => {
    await openApp(page);
    await use(page);
  },
  loggedInPage: async ({ page }, use) => {
    await logIn(page);
    await expect(page.getByTestId('intake-save')).toBeVisible();
    await use(page);
  },
});
