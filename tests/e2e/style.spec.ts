import { expect, test } from '@playwright/test';
import { asRole, nav } from './helpers';

// The Rizurf colour scheme (Styles.md): Inter, the heading scale, navy pill buttons, teal for selected things.
test('pages use the Rizurf colour scheme', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Journal');
  const css = (sel: string, prop: string) => page.locator(sel).first().evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);

  expect(await css('body', 'font-family')).toMatch(/^"?Inter"?/);
  expect(await css('h1', 'font-size')).toBe('28px');
  expect(await css('h2', 'font-size')).toBe('16px');
  expect(await css('.day-card[aria-pressed="true"]', 'border-top-color')).toBe('rgb(3, 157, 177)'); // brand teal

  await nav(page, 'Templates');
  const button = page.getByTestId('new-template');
  expect(await button.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(10, 42, 78)'); // brand navy
  expect(await button.evaluate(e => getComputedStyle(e).borderTopLeftRadius)).toBe('9999px');
  expect(await button.evaluate(e => getComputedStyle(e).fontWeight)).toBe('650');
});
