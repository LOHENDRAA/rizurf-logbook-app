import { expect, test } from '@playwright/test';
import { demoAs, nav } from './helpers';


test('the Logbook lists every week with its sources, status and next step', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await nav(page, 'Logbook');
  const rows = page.getByTestId('week-row');
  await expect(rows.first()).toBeVisible();
  // Newest first: the internship runs ~12 weeks, so the top rows haven't started yet.
  await expect(rows.first().getByTestId('week-upcoming')).toContainText('Starts ');
  await expect(rows.first().getByTestId('week-open')).toHaveCount(0);
  const week1 = rows.filter({ hasText: /^Week 1\s/ });
  await expect(week1.getByTestId('week-sources')).toHaveText(/^5 days · \d+ activit(y|ies) · \d+ learning$/);
  await expect(week1.getByTestId('status-badge')).toHaveText('Approved');
  await expect(week1.getByTestId('week-open')).toHaveText('View');
  await expect(rows.filter({ hasText: /^Week 2\s/ }).getByTestId('week-open')).toHaveText('Revise');
  await rows.filter({ hasText: /^Week 2\s/ }).getByTestId('week-open').click();
  await expect(page).toHaveURL(/#\/logbook\/w:/);
});

test('old builder addresses and unknown weeks still land somewhere sensible', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await page.evaluate(() => { location.hash = '#/student/builder'; });
  await expect(page).toHaveURL(/#\/logbook$/);
  await page.evaluate(() => { location.hash = '#/logbook/w:1999-01-04'; });
  await expect(page.getByTestId('field').first()).toBeVisible(); // the builder falls back to the current week
});
