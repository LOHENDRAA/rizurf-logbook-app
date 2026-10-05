import { expect, test, type Page } from '@playwright/test';

// The gateway owns the theme (MICROAPP_DARK_MODE.md): its button writes `rizurf-theme` and sets <html data-theme>; the app only reads them.
const bg = (page: Page, sel: string) => page.locator(sel).first().evaluate(e => getComputedStyle(e).backgroundColor);

async function open(page: Page, choice: string) {
  await page.route(/gateway-button\.js/, r => r.abort()); // the live gateway isn't part of the test
  await page.addInitScript(c => localStorage.setItem('rizurf-theme', c), choice);
  await page.goto('/intern-logbook/');
  await page.locator('.sidebar').waitFor();
}

test("the gateway's saved Dark choice applies before the first paint, in the gateway's colours", async ({ page }) => {
  await open(page, 'dark');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await bg(page, 'body')).toBe('rgb(30, 30, 30)'); // #1e1e1e
  expect(await bg(page, '.sidebar')).toBe('rgb(37, 37, 38)'); // #252526
  await expect(page.getByRole('button', { name: /dark mode|light mode/i })).toHaveCount(0); // no toggle of our own
});

test('"System" follows the computer\'s setting', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, 'system');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
});

test('the page turns light when the gateway button switches it', async ({ page }) => {
  await open(page, 'dark');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  expect(await bg(page, '.sidebar')).toBe('rgb(255, 255, 255)');
});
