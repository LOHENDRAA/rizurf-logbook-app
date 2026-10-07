import { expect, test } from '@playwright/test';
import { asRole, iso, nav, writeEntry } from './helpers';

const today = iso(new Date());
const past = (() => { const d = new Date(); d.setDate(d.getDate() - 9); return iso(d); })();
const future = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return iso(d); })();

test('a supervisor writes today, finds it in the Journal, and catches up on a missed day', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Today');
  await expect(page.getByTestId('today-date')).toBeVisible();
  await page.getByTestId('prompt-toggle').click();
  await page.getByTestId('prompt').first().click();
  await expect(page.getByTestId('entry-text')).toHaveValue(/^What did you work on\? $/);
  await page.getByTestId('entry-text').fill('Reviewed the SUPPLIER sheets.');
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await expect(page.getByTestId('week-count')).toContainText('Written on 1 of');

  // Picking a date doesn't leave the page by itself (typing one digit at a time makes passing dates like year 0002).
  await nav(page, 'Journal');
  await page.getByTestId('journal-date').fill('0002-10-07');
  await expect(page).toHaveURL(/#\/journal$/);
  await writeEntry(page, past, 'Planned the sprint.');
  await nav(page, 'Journal');
  await expect(page.getByTestId('journal-card')).toHaveCount(2);
  await expect(page.getByTestId('journal-card').first()).toHaveAttribute('data-date', today); // newest first
  await page.getByTestId('journal-search').fill('supplier');
  await expect(page.getByTestId('journal-card')).toHaveCount(1);
  await page.getByTestId('journal-search').fill('nothing like this');
  await expect(page.getByTestId('journal-empty')).toContainText('Nothing matches');

  // Open, edit and come back.
  await page.getByTestId('journal-search').fill('');
  await page.getByTestId('journal-card').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`#/journal/${past}$`));
  await page.getByTestId('entry-text').fill('Planned the sprint and the demo.');
  await page.getByTestId('entry-back').click(); // leaving straight away still saves
  await expect(page.getByTestId('journal-card').nth(1)).toContainText('Planned the sprint and the demo.');

  // A future or made-up day is refused, and nothing is saved.
  for (const bad of [future, '2026-13-40']) {
    await page.goto(`/intern-logbook/#/journal/${bad}`);
    await expect(page.getByTestId('entry-error')).toHaveText("You can't write for a day that hasn't happened yet.");
    await expect(page.getByTestId('entry-text')).toHaveCount(0);
  }
});

test("entries are per person: Aina never sees the supervisor's", async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Today');
  await page.getByTestId('entry-text').fill('Supervisor only.');
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await asRole(page, 'Aina Rahman');
  await page.goto('/intern-logbook/#/today');
  await expect(page.getByTestId('entry-text')).toHaveValue('');
});
