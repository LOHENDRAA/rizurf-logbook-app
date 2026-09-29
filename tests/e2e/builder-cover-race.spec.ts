import { expect, test } from '@playwright/test';
import { asRole, fixture, iso, nav } from './helpers';

const UNIVERSITY = "Taylor's University";
const COVER_NAME = 'Aina Rahman (typed just before switching)';
const start = new Date(); start.setDate(start.getDate() - 21);
const end = new Date(); end.setDate(end.getDate() + 30);

test('switching the builder period right after a cover edit does not drop it', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');

  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill(UNIVERSITY);
  await page.getByTestId('upload-input').setInputFiles(fixture('taylors.pdf'));
  await page.getByTestId('detect-btn').click();
  await expect(page.getByTestId('ph-box').first()).toBeVisible();
  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText(UNIVERSITY);

  await asRole(page, 'Aina Rahman');
  await page.getByTestId('onb-university').selectOption({ label: UNIVERSITY });
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-end').fill(iso(end));
  await page.getByTestId('onb-save').click();

  await nav(page, 'Logbook builder');
  await expect(page.getByTestId('builder-period')).toBeVisible();

  const options = await page.getByTestId('builder-period').locator('option').all();
  expect(options.length).toBeGreaterThan(1);
  const firstKey = await options[0].getAttribute('value');
  const secondKey = await options[1].getAttribute('value');

  const nameField = page.locator('[data-testid="field"][data-label="Name"] input, [data-testid="field"][data-label="Name"] textarea');
  await expect(nameField).toBeVisible();
  await nameField.fill(COVER_NAME);
  // Switch periods immediately (well under the 500ms cover-save debounce) — the reproduction path.
  // The cover field is shared across periods, so the new instance shows whatever coverValues
  // the store held at mount time: stale (dropping the edit) unless the switch waited for the save.
  await page.getByTestId('builder-period').selectOption(secondKey!);

  await expect(nameField).toHaveValue(COVER_NAME);
});
