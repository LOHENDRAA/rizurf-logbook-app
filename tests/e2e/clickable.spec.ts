import { expect, test } from '@playwright/test';
import { demoAs, nav } from './helpers';

test('Overview counts, workday squares and placement boxes all open their pages', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  const go = async (i: number, url: RegExp) => {
    await nav(page, 'Overview');
    await page.getByTestId('ov-count').nth(i).click();
    await expect(page).toHaveURL(url);
  };
  await go(0, /#\/journal$/);
  await go(1, /#\/logbook$/);
  await go(2, /#\/projects$/);
  await go(3, /#\/skills$/);
  await nav(page, 'Overview');
  await page.getByTestId('ov-day').first().click();
  await expect(page).toHaveURL(/#\/journal\/\d{4}-\d{2}-\d{2}$/);
  await nav(page, 'Overview');
  await page.getByTestId('ov-box').first().click();
  await expect(page).toHaveURL(/#\/student\/onboarding$/);
});

test('whole cards and rows open their page, not just their link text', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await nav(page, 'Today');
  await page.getByTestId('week-count').click({ force: true }); // the card's own link covers it, so a real click lands there
  await expect(page).toHaveURL(/#\/journal$/);
  await nav(page, 'Today');
  await page.getByTestId('today-logbook').locator('h2').click({ force: true }); // the card's link covers it
  await expect(page).toHaveURL(/#\/logbook\/w:/);

  await nav(page, 'Logbook');
  await page.getByTestId('week-row').filter({ hasText: /^Week 1\s/ }).getByTestId('week-sources').click({ force: true }); // the card's link covers it
  await expect(page).toHaveURL(/#\/logbook\/w:/);

  await nav(page, 'Learning');
  await page.getByTestId('learning-row').first().locator('.muted').click({ force: true }); // the card's link covers it
  await expect(page).toHaveURL(/#\/journal\/\d{4}-\d{2}-\d{2}$/);

  await nav(page, 'Reflection');
  await page.getByTestId('rf-prev').click();
  await page.getByTestId('rf-summary').getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/projects\/.+/);
  await nav(page, 'Reflection');
  await page.getByTestId('rf-prev').click();
  await page.getByTestId('rf-summary').getByRole('link').last().click();
  await expect(page).toHaveURL(/#\/learning$/);
});
