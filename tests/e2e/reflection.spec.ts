import { expect, test } from '@playwright/test';
import { asRole, demoAs, nav } from './helpers';

test('an intern writes a reflection beside a summary of the week; it is kept and unsaved text asks first', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await nav(page, 'Reflection');
  await expect(page.getByTestId('rf-title')).toHaveText(/^Week of \d{1,2} \w+$/);
  await expect(page.getByTestId('rf-next')).toBeDisabled();
  await expect(page.getByTestId('rf-save')).toBeDisabled();
  await page.getByTestId('rf-text').fill('Pairing helped me learn the codebase.');
  await page.getByTestId('rf-save').click();
  await expect(page.getByTestId('rf-saved')).toHaveText('Saved');

  // Last week: the demo seeded a reflection and five journal days.
  await page.getByTestId('rf-prev').click();
  await expect(page.getByTestId('rf-text')).toHaveValue(/^Testing the export endpoint early/);
  await expect(page.getByTestId('rf-summary')).toContainText('5 journal days');
  await expect(page.getByTestId('rf-summary')).toContainText('WHAT STOOD OUT');

  // Kept: switching person reloads the journal from storage.
  await asRole(page, 'Aina Rahman');
  await asRole(page, 'Daniel Lim');
  await nav(page, 'Reflection');
  await expect(page.getByTestId('rf-text')).toHaveValue('Pairing helped me learn the codebase.');

  // Unsaved text asks before leaving; Cancel stays.
  await page.getByTestId('rf-text').fill('Half a thought');
  await nav(page, 'Journal');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/#\/reflection$/);
  await expect(page.getByTestId('rf-text')).toHaveValue('Half a thought');
  await nav(page, 'Journal');
  await page.getByTestId('ask-ok').click();
  await expect(page).toHaveURL(/#\/journal$/);
});

test('a bad week address opens this week, and supervisors have no reflection page', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await nav(page, 'Reflection');
  const thisWeek = await page.getByTestId('rf-title').textContent();
  await page.evaluate(() => { location.hash = '#/reflection/2026-02-30'; });
  await expect(page.getByTestId('rf-title')).toHaveText(thisWeek ?? '');
  await asRole(page, 'Supervisor');
  await page.evaluate(() => { location.hash = '#/reflection'; });
  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.getByRole('link', { name: /^Reflection/ })).toHaveCount(0);
});

test('switching person with an unsaved reflection asks first, and Cancel keeps the text and the person', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await nav(page, 'Reflection');
  await page.getByTestId('rf-text').fill('Half a thought');
  await asRole(page, 'Aina Rahman');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('rf-text')).toHaveValue('Half a thought');
  await expect(page.getByTestId('role-select')).toHaveValue('student-daniel');
  await asRole(page, 'Aina Rahman');
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('role-select')).toHaveValue('student-aina');
  await expect(page).not.toHaveURL(/#\/reflection/);
});

test('closing the tab with an unsaved reflection asks the browser to confirm', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await nav(page, 'Reflection');
  await page.getByTestId('rf-text').fill('Half a thought');
  const dialog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const d = await dialog;
  expect(d.type()).toBe('beforeunload');
  await d.dismiss();
});
