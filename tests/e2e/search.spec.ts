import { expect, test } from '@playwright/test';
import { asRole, demoAs, iso, lastWeekday, writeEntry } from './helpers';

test('searching from the top bar shows grouped, highlighted results and opens a journal day', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await page.getByTestId('top-search').fill('invoice');
  await page.getByTestId('top-search').press('Enter');
  await expect(page).toHaveURL(/#\/search\?q=invoice$/);
  await expect(page.getByTestId('search-input')).toHaveValue('invoice');
  const groups = page.getByTestId('search-group');
  await expect(groups.first()).toContainText(/^Journal · \d+/);
  await expect(groups.filter({ hasText: /^Projects · 1/ })).toHaveCount(1);
  await expect(page.locator('[data-testid="search-result"] mark').first()).toHaveText(/^invoice$/i);

  await page.getByTestId('search-input').fill('zzzz-nothing');
  await expect(page.getByTestId('search-empty')).toHaveText('Nothing found for “zzzz-nothing”.');
  await expect(page).toHaveURL(/q=zzzz-nothing$/);
  await expect(page.getByTestId('search-input')).toBeFocused(); // typing never remounted the page

  await page.getByTestId('search-input').fill('invoice');
  await groups.first().getByTestId('search-result').first().click();
  await expect(page).toHaveURL(/#\/journal\/\d{4}-\d{2}-\d{2}$/);
});

test('a supervisor searches only their own journal, even after switching from an intern', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await page.getByTestId('top-search').fill('invoice');
  await page.getByTestId('top-search').press('Enter');
  await expect(page.getByTestId('search-group')).not.toHaveCount(1);
  await asRole(page, 'Supervisor');
  await writeEntry(page, iso(lastWeekday()), 'Reviewed the invoice export.');
  await page.getByTestId('top-search').fill('invoice');
  await page.getByTestId('top-search').press('Enter');
  await expect(page.getByTestId('search-group')).toHaveCount(1);
  await expect(page.getByTestId('search-group')).toContainText(/^Journal · 1/);
});
