import { expect, test } from '@playwright/test';
import { asRole, fixture } from './helpers';

test('supervisor uploads a PDF template, adjusts it and saves it', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill('Prince Mohammad Bin Fahd University');
  await page.getByTestId('upload-input').setInputFiles(fixture('pmu.pdf'));
  await page.getByTestId('detect-btn').click();

  const boxes = page.getByTestId('ph-box');
  await expect(boxes.first()).toBeVisible();
  const before = await boxes.count();
  expect(before).toBeGreaterThan(10);

  // Drag the first box 20px right and 10px down.
  const b0 = (await boxes.first().boundingBox())!;
  await page.mouse.move(b0.x + 4, b0.y + 4);
  await page.mouse.down();
  await page.mouse.move(b0.x + 24, b0.y + 14, { steps: 5 });
  await page.mouse.up();
  const b1 = (await boxes.first().boundingBox())!;
  expect(Math.round(b1.x - b0.x)).toBe(20);
  expect(Math.round(b1.y - b0.y)).toBe(10);

  // Draw a new placeholder and make it the supervisor signature.
  await page.getByTestId('mode-add-btn').click();
  const pg = (await page.getByTestId('pdf-page').first().boundingBox())!;
  await page.mouse.move(pg.x + 40, pg.y + 40);
  await page.mouse.down();
  await page.mouse.move(pg.x + 200, pg.y + 64, { steps: 5 });
  await page.mouse.up();
  await expect(boxes).toHaveCount(before + 1);
  await page.getByTestId('insp-binding').selectOption('signature');
  await page.getByTestId('insp-label').fill('Supervisor signature');

  await page.getByTestId('period-select').selectOption('weekly');
  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText('Prince Mohammad Bin Fahd University');

  // Reopen: the edits were saved.
  await page.getByTestId('template-row').getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByTestId('ph-item').filter({ hasText: 'Supervisor signature' })).toHaveCount(1);
});
