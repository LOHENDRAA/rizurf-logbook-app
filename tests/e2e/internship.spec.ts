import { expect, test } from '@playwright/test';
import { asRole, fixture, iso, lastWeekday, nav, openWeek, writeEntry } from './helpers';

const UNIVERSITY = 'Prince Mohammad Bin Fahd University';
const start = new Date(); start.setDate(start.getDate() - 21);
const end = new Date(); end.setDate(end.getDate() + 30);

test('My internship shows cards, saves Position, and switches Logbook ↔ Journal without losing notes', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill(UNIVERSITY);
  await page.getByTestId('upload-input').setInputFiles(fixture('pmu.pdf'));
  await page.getByTestId('detect-btn').click();
  await expect(page.getByTestId('ph-box').first()).toBeVisible();
  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText(UNIVERSITY); // saved, so switching role doesn't ask to discard it

  await asRole(page, 'Aina Rahman');
  await expect(page.getByTestId('mode-logbook')).toBeChecked(); // a new intern starts on Logbook
  await page.getByTestId('onb-university').selectOption({ label: UNIVERSITY });
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-end').fill(iso(end));
  await page.getByTestId('onb-position').fill('Data Intern');
  await page.getByTestId('onb-save').click();
  await writeEntry(page, iso(lastWeekday()), 'Kept across switches.');

  await nav(page, 'My internship');
  await expect(page.getByTestId('info-card').first()).toContainText('Data Intern');
  await expect(page.getByTestId('info-card').first()).toContainText(UNIVERSITY);

  await page.getByTestId('mode-journal').check();
  await expect(page.getByTestId('onb-start')).toHaveValue(iso(start)); // pre-filled from the internship
  await page.getByTestId('onb-save').click();
  await expect(page).toHaveURL(/#\/journal$/);
  for (const name of ['Logbook', 'Export']) await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  for (const name of ['Today', 'Journal']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible();

  await nav(page, 'My internship');
  await page.getByTestId('mode-logbook').check(); // already set up: switches straight away
  await expect(page).toHaveURL(/#\/student\/overview$/);
  await page.goto(`/intern-logbook/#/journal/${iso(lastWeekday())}`);
  await expect(page.getByTestId('entry-text')).toHaveValue('Kept across switches.');
  // The logbook fills its day boxes from the same entries.
  await openWeek(page);
  expect(await page.locator('[data-testid="field"] textarea').evaluateAll(els => els.map(e => (e as HTMLTextAreaElement).value))).toContain('Kept across switches.');

  // After a reload the journal is already set up, so switching back to it is immediate (no setup form again).
  await page.reload();
  await nav(page, 'My internship');
  await page.getByTestId('mode-journal').click(); // switches and leaves the page at once, so not check(): the radio is gone before it can be confirmed
  await expect(page).toHaveURL(/#\/student\/overview$/);
  await expect(page.getByRole('link', { name: 'Journal', exact: true })).toBeVisible();
});
