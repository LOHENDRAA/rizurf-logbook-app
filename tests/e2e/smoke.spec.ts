import { expect, test } from '@playwright/test';
import { asRole } from './helpers';

test('switches roles and lands on each home page', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await expect(page.getByRole('link', { name: 'Templates' })).toBeVisible();
  await asRole(page, 'Aina Rahman');
  await expect(page).toHaveURL(/#\/student\/onboarding/);
  await expect(page.getByRole('link', { name: 'Today', exact: true })).toBeVisible();
  await asRole(page, 'Supervisor');
  await expect(page).toHaveURL(/#\/supervisor\/templates/);
});

test('Load demo data and Reset demo data work through the in-page dialog', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await page.getByTestId('load-demo').click();
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('template-row')).toHaveCount(2, { timeout: 20_000 });
  await page.getByTestId('reset-demo').click();
  await page.getByTestId('ask-ok').click();
  await expect(page.getByText('No templates yet')).toBeVisible();
});
