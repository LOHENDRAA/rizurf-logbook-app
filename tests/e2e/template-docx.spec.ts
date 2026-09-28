import { expect, test } from '@playwright/test';
import { asRole, fixture } from './helpers';

test('supervisor edits a Word template: highlights, binding change, manual cell, repeating start', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill("Taylor's University");
  await page.getByTestId('upload-input').setInputFiles(fixture('taylors.docx'));
  await page.getByTestId('detect-btn').click();

  await expect(page.locator('.docx-host [data-testid="ph-box"]').first()).toBeVisible();
  const items = page.getByTestId('ph-item');
  const before = await items.count();

  await items.first().click();
  await page.getByTestId('insp-binding').selectOption('free');
  await expect(items.first()).toContainText('Free text');

  await page.getByTestId('mode-add-btn').click();
  await page.locator('.docx-host td').last().click();
  await expect(items).toHaveCount(before + 1);

  await page.getByTestId('mode-unit-btn').click();
  await page.locator('.docx-host table').first().click();
  await expect(page.locator('.unit-line')).toBeVisible();

  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText("Taylor's University");
});
