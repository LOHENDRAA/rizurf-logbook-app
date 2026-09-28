import { expect, test } from '@playwright/test';
import { asRole } from './helpers';

test('switches roles and lands on each home page', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await expect(page.getByRole('link', { name: 'Templates' })).toBeVisible();
  await asRole(page, 'Aina Rahman');
  await expect(page).toHaveURL(/#\/student\/onboarding/);
  await expect(page.getByRole('link', { name: 'Notepad' })).toBeVisible();
  await asRole(page, 'Supervisor');
  await expect(page).toHaveURL(/#\/supervisor\/templates/);
});
