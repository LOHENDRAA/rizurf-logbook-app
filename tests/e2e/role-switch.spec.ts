import { expect, test } from '@playwright/test';
import { asRole, fixture, iso, nav } from './helpers';

const UNIVERSITY = 'Prince Mohammad Bin Fahd University';
const AINA_NOTE = "Aina's note for today";
const DANIEL_NOTE = "Daniel's note for today";
const start = new Date(); start.setDate(start.getDate() - 21);
const end = new Date(); end.setDate(end.getDate() + 30);

test("switching students directly on Today does not leak the previous student's entry", async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');

  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill(UNIVERSITY);
  await page.getByTestId('upload-input').setInputFiles(fixture('pmu.pdf'));
  await page.getByTestId('detect-btn').click();
  await expect(page.getByTestId('ph-box').first()).toBeVisible();
  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText(UNIVERSITY);

  await asRole(page, 'Aina Rahman');
  await page.getByTestId('onb-university').selectOption({ label: UNIVERSITY });
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-end').fill(iso(end));
  await page.getByTestId('onb-save').click();
  await expect(page.getByTestId('entry-text')).toBeVisible();
  await page.getByTestId('entry-text').fill(AINA_NOTE);
  await expect(page.getByTestId('entry-status')).toContainText('Saved');

  await asRole(page, 'Daniel Lim');
  await page.getByTestId('onb-university').selectOption({ label: UNIVERSITY });
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-end').fill(iso(end));
  await page.getByTestId('onb-save').click();
  await expect(page.getByTestId('entry-text')).toBeVisible();
  await expect(page.getByTestId('entry-text')).not.toHaveValue(AINA_NOTE);
  await expect(page.getByTestId('entry-text')).toHaveValue('');

  // Switch to Daniel after Aina's Today (switching opens the Overview; Today must not show Aina's entry).
  await asRole(page, 'Aina Rahman');
  await nav(page, 'Today');
  await expect(page.getByTestId('entry-text')).toHaveValue(AINA_NOTE);
  await asRole(page, 'Daniel Lim');
  await nav(page, 'Today');
  await expect(page.getByTestId('entry-text')).not.toHaveValue(AINA_NOTE);
  await expect(page.getByTestId('entry-text')).toHaveValue('');

  await page.getByTestId('entry-text').fill(DANIEL_NOTE);
  await expect(page.getByTestId('entry-status')).toContainText('Saved');

  await asRole(page, 'Aina Rahman');
  await nav(page, 'Today');
  await expect(page.getByTestId('entry-text')).toHaveValue(AINA_NOTE);
});
