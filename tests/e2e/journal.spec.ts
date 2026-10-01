import { expect, test, type Page } from '@playwright/test';
import { asRole, iso, nav } from './helpers';

const today = iso(new Date());
const day = (page: Page, d: string) => page.locator(`[data-testid="day-card"][data-date="${d}"]`);

test('a supervisor keeps a private journal that survives a reload', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Journal');
  await expect(day(page, today)).toHaveAttribute('aria-pressed', 'true');
  await expect(day(page, today)).not.toContainText('Logged');

  await page.getByTestId('journal-text').fill('Met the new interns.');
  await expect(page.getByTestId('journal-status')).toContainText('Saved');
  await expect(day(page, today)).toContainText('Logged');

  await page.reload();
  await expect(page.getByTestId('journal-text')).toHaveValue('Met the new interns.');

  // Last week is there to go back to; a day written there stays.
  const lastSunday = new Date(); lastSunday.setDate(lastSunday.getDate() - ((lastSunday.getDay() + 6) % 7) - 1);
  await page.getByTestId('week-select').selectOption({ index: 1 });
  await expect(page.getByTestId('week-select').locator('option').nth(1)).toHaveText(/^Last week · /);
  await expect(day(page, iso(lastSunday))).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('journal-text').fill('Looked back at last week.');
  await expect(page.getByTestId('journal-status')).toContainText('Saved');
  await page.reload();
  await page.getByTestId('week-select').selectOption({ index: 1 });
  await expect(day(page, iso(lastSunday))).toContainText('Logged');
  await page.getByTestId('week-select').selectOption({ index: 0 });

  // Clearing the day removes it.
  await page.getByTestId('journal-text').fill('');
  await expect(page.getByTestId('journal-status')).toContainText('Saved');
  await page.reload();
  await expect(day(page, today)).not.toContainText('Logged');
});

test('an intern without a logbook gets only the journal, and nobody else can read it', async ({ page }) => {
  const start = new Date(); start.setDate(start.getDate() - 21);
  await page.goto('/intern-logbook/');
  await asRole(page, 'Daniel Lim');
  await page.getByTestId('mode-journal').check();
  await expect(page.getByTestId('onb-end')).toBeHidden();
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-save').click();

  await expect(page).toHaveURL(/#\/journal$/);
  await expect(page.getByTestId('week-select').locator('option')).toHaveCount(4); // 21 days back: this week plus three before it
  for (const name of ['Notepad', 'Logbook builder', 'Export']) await expect(page.getByRole('link', { name })).toHaveCount(0);
  for (const name of ['Overview', 'Journal', 'My internship']) await expect(page.getByRole('link', { name })).toBeVisible();

  await page.getByTestId('journal-text').fill('Private thoughts.');
  await expect(page.getByTestId('journal-status')).toContainText('Saved');

  await asRole(page, 'Supervisor');
  await nav(page, 'Journal');
  await expect(page.getByTestId('journal-text')).toHaveValue('');
  await expect(day(page, today)).not.toContainText('Logged');

  // Back as Daniel, the journal is still his; going to the Notepad lands on his Overview.
  await asRole(page, 'Daniel Lim');
  await page.goto('/intern-logbook/#/student/notepad');
  await expect(page).toHaveURL(/#\/student\/overview$/);
  await nav(page, 'Journal');
  await expect(page.getByTestId('journal-text')).toHaveValue('Private thoughts.');
});

/** Breaks the journal's IndexedDB store, as a server outage would: 'read' fails loading it, 'write' fails saving. */
async function breakJournal(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { breakJournal?: 'read' | 'write' };
    const index = IDBObjectStore.prototype.index;
    IDBObjectStore.prototype.index = function (this: IDBObjectStore, name: string) {
      if (w.breakJournal === 'read' && name === 'byOwner') throw new DOMException('journal read broken');
      return index.call(this, name);
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (w.breakJournal === 'write' && this.name === 'journal') throw new DOMException('journal write broken');
      return put.apply(this, args);
    };
  });
}
const setBroken = (page: Page, how: 'read' | 'write' | undefined) => page.evaluate(h => { (window as unknown as { breakJournal?: string }).breakJournal = h; }, how);

test('a journal that fails to load does not lock an intern out of the logbook', async ({ page }) => {
  await breakJournal(page);
  await page.goto('/intern-logbook/');
  await setBroken(page, 'read');
  await asRole(page, 'Aina Rahman');
  await page.goto('/intern-logbook/#/student/notepad');
  await expect(page.getByTestId('onb-university')).toBeVisible(); // a new intern still reaches Onboarding
});

test('a failed save keeps the text: the day, the week and the page stay put until it saves', async ({ page }) => {
  const start = new Date(); start.setDate(start.getDate() - 21);
  await breakJournal(page);
  await page.goto('/intern-logbook/');
  await asRole(page, 'Daniel Lim');
  await page.getByTestId('mode-journal').check();
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-save').click();
  await expect(page).toHaveURL(/#\/journal$/);

  await setBroken(page, 'write');
  await page.getByTestId('journal-text').fill('Not saved yet.');
  await expect(page.getByTestId('journal-status')).toContainText('Not saved');

  await page.getByTestId('week-select').selectOption({ index: 0 });
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  await expect(page.getByTestId('week-select')).toHaveValue(iso(monday)); // still on this week
  await expect(page.getByTestId('journal-text')).toHaveValue('Not saved yet.');
  await expect(day(page, today)).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => { location.hash = '#/student/onboarding'; });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/#\/journal$/);
  await expect(page.getByTestId('journal-text')).toHaveValue('Not saved yet.');

  await setBroken(page, undefined);
  await page.getByTestId('journal-text').click();
  await page.keyboard.type('!');
  await expect(page.getByTestId('journal-status')).toContainText('Saved');
  await expect(day(page, today)).toContainText('Logged');
});
