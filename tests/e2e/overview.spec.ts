import { expect, test } from '@playwright/test';
import { asRole, fixture, iso, lastWeekday, nav, writeEntry } from './helpers';

const UNIVERSITY = 'Prince Mohammad Bin Fahd University';
const start = new Date(); start.setDate(start.getDate() - 21);
const end = new Date(); end.setDate(end.getDate() + 30);

test('Overview: week and progress, what needs attention, and a link to this week', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill(UNIVERSITY);
  await page.getByTestId('upload-input').setInputFiles(fixture('pmu.pdf'));
  await page.getByTestId('detect-btn').click();
  await expect(page.getByTestId('ph-box').first()).toBeVisible();
  await page.getByTestId('period-select').selectOption('weekly');
  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText(UNIVERSITY); // saved, so switching role doesn't ask to discard it

  await asRole(page, 'Aina Rahman');
  await page.getByTestId('onb-university').selectOption({ label: UNIVERSITY });
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-end').fill(iso(end));
  await page.getByTestId('onb-position').fill('Data Intern');
  await page.getByTestId('onb-save').click();
  await writeEntry(page, iso(lastWeekday()), 'Did things.');

  await nav(page, 'Overview');
  await expect(page.getByTestId('ov-caption')).toContainText(/WEEK \d+ OF \d+/);
  await expect(page.getByTestId('ov-title')).toHaveText('Data Intern');
  await expect(page.getByTestId('ov-progress')).toBeVisible();
  await expect(page.getByTestId('ov-box').first()).toContainText(UNIVERSITY);
  // Earlier weeks ended without being submitted.
  await expect(page.getByTestId('ov-attention').first()).toContainText('overdue, not submitted');
  await expect(page.getByText('Notepad', { exact: true })).toHaveCount(0); // the Notepad is gone; the card is about Today

  await page.getByTestId('ov-attention').first().click();
  await expect(page).toHaveURL(/#\/logbook\//);

  await nav(page, 'Overview');
  await page.getByTestId('ov-open').click();
  await expect(page).toHaveURL(/#\/today$/);
});

test('Overview for a journal intern: journal week, no attention box', async ({ page }) => {
  const s = new Date(); s.setDate(s.getDate() - 21);
  await page.goto('/intern-logbook/');
  await asRole(page, 'Daniel Lim');
  await page.getByTestId('mode-journal').check();
  await page.getByTestId('onb-start').fill(iso(s));
  await page.getByTestId('onb-position').fill('QA Intern');
  await page.getByTestId('onb-save').click();
  await nav(page, 'Overview');
  await expect(page.getByTestId('ov-caption')).toHaveText('WEEK 4 OF YOUR JOURNAL');
  await expect(page.getByTestId('ov-title')).toHaveText('QA Intern');
  await expect(page.getByTestId('ov-attention')).toHaveCount(0);
  await page.getByTestId('ov-open').click();
  await expect(page).toHaveURL(/#\/today$/);
});
