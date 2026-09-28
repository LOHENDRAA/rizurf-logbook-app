import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { asRole, fixture, iso, lastWeekday, pdfWords } from './helpers';

test.describe.configure({ mode: 'serial' });

const UNIVERSITY = 'Prince Mohammad Bin Fahd University';
const NOTE = 'Configured the ERP gateway sandbox & wrote <notes>';
const noteDay = lastWeekday();
const start = new Date(); start.setDate(start.getDate() - 21);
const end = new Date(); end.setDate(end.getDate() + 30);
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('/intern-logbook/');
});
test.afterAll(async () => { await page.close(); });

test('supervisor prepares the PMU template with a signature spot', async () => {
  await asRole(page, 'Supervisor');
  await page.getByTestId('new-template').click();
  await page.getByTestId('university-input').fill(UNIVERSITY);
  await page.getByTestId('upload-input').setInputFiles(fixture('pmu.pdf'));
  await page.getByTestId('detect-btn').click();
  await expect(page.getByTestId('ph-box').first()).toBeVisible();
  await page.getByTestId('mode-add-btn').click();
  const pg = (await page.getByTestId('pdf-page').first().boundingBox())!;
  await page.mouse.move(pg.x + 40, pg.y + 40);
  await page.mouse.down();
  await page.mouse.move(pg.x + 220, pg.y + 64, { steps: 5 });
  await page.mouse.up();
  await page.getByTestId('insp-binding').selectOption('signature');
  await page.getByTestId('insp-label').fill('Supervisor signature');
  await page.getByTestId('period-select').selectOption('weekly');
  await page.getByTestId('save-template').click();
  await expect(page.getByTestId('template-row')).toContainText(UNIVERSITY);
});

test('student onboards and the notepad autosaves across a reload', async () => {
  await asRole(page, 'Aina Rahman');
  await page.getByTestId('onb-university').selectOption({ label: UNIVERSITY });
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-end').fill(iso(end));
  await page.getByTestId('onb-save').click();

  await page.locator(`[data-testid="note-date"][data-date="${iso(noteDay)}"]`).click();
  await page.getByTestId('note-text').fill(NOTE);
  await expect(page.getByTestId('note-status')).toContainText('Saved');

  await page.reload();
  await page.locator(`[data-testid="note-date"][data-date="${iso(noteDay)}"]`).click();
  await expect(page.getByTestId('note-text')).toHaveValue(NOTE);
  // Future days can't be picked.
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  await expect(page.locator(`[data-testid="note-date"][data-date="${iso(tomorrow)}"]`)).toBeDisabled();
});

async function fieldValues() {
  return page.locator('[data-testid="field"] textarea').evaluateAll(els => els.map(e => (e as HTMLTextAreaElement).value));
}

test('student builds the period from the notepad with a live preview and submits it', async () => {
  await page.getByRole('link', { name: 'Logbook builder' }).click();
  await expect(page.getByTestId('field').first()).toBeVisible();
  expect(await fieldValues()).toContain(NOTE);
  await expect(page.getByTestId('from-notepad').first()).toBeVisible();
  await expect(page.getByTestId('preview')).toContainText('Configured the ERP gateway');

  // Typing into a period answer updates the preview immediately.
  const answer = page.locator('fieldset', { hasText: 'Period answers' }).locator('textarea').first();
  await answer.fill('I learned how the gateway routes requests.');
  await expect(page.getByTestId('preview')).toContainText('I learned how the gateway');

  await page.getByTestId('submit-period').click();
  await expect(page.getByTestId('status-badge').first()).toHaveText('Submitted');
  await expect(answer).toBeDisabled();
});

test('supervisor requests changes, student fixes and resubmits, supervisor approves', async () => {
  await asRole(page, 'Supervisor');
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByTestId('queue-row').first().click();
  await expect(page.getByTestId('preview')).toContainText('Configured the ERP gateway');
  await page.getByTestId('changes-comment').fill('Please describe the sandbox setup in more detail.');
  await page.getByTestId('changes-btn').click();
  await expect(page.getByTestId('history')).toContainText('Changes requested');

  await asRole(page, 'Aina Rahman');
  await page.getByRole('link', { name: 'Logbook builder' }).click();
  await expect(page.getByTestId('changes-banner')).toContainText('more detail');
  const values = await page.locator('[data-testid="field"] textarea').evaluateAll(els => els.map(e => (e as HTMLTextAreaElement).value));
  const i = values.indexOf(NOTE);
  await page.locator('[data-testid="field"] textarea').nth(i).fill(`${NOTE} Set up Docker and seeded test data.`);
  await page.getByTestId('submit-period').click();
  await expect(page.getByTestId('status-badge').first()).toHaveText('Submitted');

  await asRole(page, 'Supervisor');
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByTestId('queue-row').first().click();
  await page.getByTestId('approve-name').fill('Nur Aziz');
  await page.getByTestId('approve-btn').click();
  await expect(page.getByTestId('history')).toContainText('Approved');
  await expect(page.getByTestId('status-badge').first()).toHaveText('Approved');
});
