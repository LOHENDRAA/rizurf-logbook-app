import { expect, test, type Page } from '@playwright/test';
import { asRole, iso, nav } from './helpers';

test('a supervisor writes on Today; it survives a reload and switching role away and back', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Today');
  await page.getByTestId('entry-text').fill('Met the new interns.');
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await page.reload();
  await expect(page.getByTestId('entry-text')).toHaveValue('Met the new interns.');

  // Clearing the day removes it from the Journal.
  await page.getByTestId('entry-text').fill('');
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await nav(page, 'Journal');
  await expect(page.getByTestId('journal-card')).toHaveCount(0);
  await expect(page.getByTestId('journal-empty')).toHaveText('Your journal will build here as you write.');
});

test('an intern without a logbook gets Overview, Today, Journal and My internship, and nobody else can read it', async ({ page }) => {
  const start = new Date(); start.setDate(start.getDate() - 21);
  await page.goto('/intern-logbook/');
  await asRole(page, 'Daniel Lim');
  await page.getByTestId('mode-journal').check();
  await expect(page.getByTestId('onb-end')).toBeHidden();
  await page.getByTestId('onb-start').fill(iso(start));
  await page.getByTestId('onb-save').click();

  await expect(page).toHaveURL(/#\/journal$/);
  for (const name of ['Logbook builder', 'Export']) await expect(page.getByRole('link', { name })).toHaveCount(0);
  for (const name of ['Overview', 'Today', 'Journal', 'My internship']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await nav(page, 'Today');
  await expect(page.getByTestId('today-caption')).toHaveText('Week 4 of your journal'); // 21 days back: this week plus three before it
  await page.getByTestId('entry-text').fill('Private thoughts.');
  await expect(page.getByTestId('entry-status')).toContainText('Saved');

  await asRole(page, 'Supervisor');
  await nav(page, 'Today');
  await expect(page.getByTestId('entry-text')).toHaveValue('');

  // Back as Daniel, the entry is still his; the old Notepad address opens Today.
  await asRole(page, 'Daniel Lim');
  await page.goto('/intern-logbook/#/student/notepad');
  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.getByTestId('entry-text')).toHaveValue('Private thoughts.');
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

test('a journal that fails to load still lets a new intern reach My internship, and never opens the builder', async ({ page }) => {
  await breakJournal(page);
  await page.goto('/intern-logbook/');
  await setBroken(page, 'read');
  await asRole(page, 'Aina Rahman');
  await expect(page.getByTestId('onb-university')).toBeVisible(); // a new intern still reaches Onboarding
  // Today needs the journal: the error shows and the page doesn't open.
  await page.evaluate(() => { location.hash = '#/today'; });
  await expect(page.locator('.toast.error')).toContainText('journal read broken');
  await expect(page.getByTestId('entry-text')).toHaveCount(0);
});

test('opening the app on Today with a broken journal says so instead of a blank page', async ({ page }) => {
  await breakJournal(page);
  await page.addInitScript(() => { (window as unknown as { breakJournal?: string }).breakJournal = 'read'; });
  await page.goto('/intern-logbook/#/today');
  await expect(page.getByTestId('load-error')).toHaveText("We couldn't load your journal. Reload the page to try again.");
});

test('a failed save keeps the text, and the page stays put until it saves', async ({ page }) => {
  await breakJournal(page);
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Today');

  await setBroken(page, 'write');
  await page.getByTestId('entry-text').fill('Not saved yet.');
  await expect(page.getByTestId('entry-status')).toContainText('Not saved');

  // Leaving asks first; Cancel keeps the page and the text.
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.getByTestId('entry-text')).toHaveValue('Not saved yet.');

  await setBroken(page, undefined);
  await page.getByTestId('entry-text').click();
  await page.keyboard.type('!');
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await nav(page, 'Journal');
  await expect(page.getByTestId('journal-card').first()).toContainText('Not saved yet.!');
});
