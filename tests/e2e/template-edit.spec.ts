import { expect, test } from '@playwright/test';
import { asRole, fixture } from './helpers';

const UNIVERSITY = 'Prince Mohammad Bin Fahd University';

test('Edit opens the template, never the empty new-template form', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill(UNIVERSITY);
  await page.getByTestId('upload-input').setInputFiles(fixture('pmu.pdf'));
  await page.getByTestId('detect-btn').click();
  await expect(page.getByTestId('ph-box').first()).toBeVisible();
  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText(UNIVERSITY);

  // While the template loads, the upload form for a new template must never show (it did, for as long as loading took).
  await page.evaluate(() => {
    const w = window as unknown as { sawNewForm: boolean };
    w.sawNewForm = false;
    new MutationObserver(() => { if (document.querySelector('[data-testid="upload-input"]')) w.sawNewForm = true; })
      .observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('link', { name: 'Edit' }).first().click();
  await expect(page.getByTestId('university-input')).toHaveValue(UNIVERSITY);
  await expect(page.getByTestId('save-template')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { sawNewForm: boolean }).sawNewForm)).toBe(false);
});
