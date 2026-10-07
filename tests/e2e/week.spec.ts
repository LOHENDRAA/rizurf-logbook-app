import { expect, test } from '@playwright/test';
import { asRole, iso, lastWeekday, openWeek, writeEntry } from './helpers';

async function demoAs(page: import('@playwright/test').Page, who: string) {
  await page.goto('/intern-logbook/');
  await page.getByTestId('load-demo').click();
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('template-row')).toHaveCount(2, { timeout: 20_000 });
  await asRole(page, who);
}

test('a draft week fills its weekly boxes from accepted activities, tagged, and an edit is tagged as yours', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await writeEntry(page, iso(lastWeekday()), 'Built the login page.');
  await page.getByTestId('organize').click();
  const activity = page.locator('[data-testid="review-card"][data-kind="activity"]');
  await activity.getByTestId('review-accept').click();
  await expect(page.getByTestId('connected-item')).toContainText('Built the login page');

  await openWeek(page);
  await expect(page.getByTestId('week-title')).toContainText('Week ');
  const typeBox = page.locator('[data-testid="field"]', { hasText: 'Type' });
  await expect(typeBox.locator('textarea')).toHaveValue(/• Built the login page/);
  await expect(typeBox.getByTestId('from-notepad')).toHaveText(/^From \d+ accepted activit(y|ies)$/);
  await typeBox.locator('textarea').fill('My own words about the week.');
  await expect(typeBox.getByTestId('box-edited')).toHaveText('Edited by you');
  await expect(page.getByTestId('history')).toContainText('Not submitted yet.');
});

test('a sent-back week shows the version that was sent, and its history', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await openWeek(page, 'Revise');
  await expect(page.getByTestId('changes-banner')).toBeVisible();
  const sent = page.getByTestId('submitted-version');
  await expect(sent).toContainText('Your submitted version · ');
  await sent.locator('summary').click();
  await expect(sent.getByTestId('preview')).toBeVisible();
  await expect(page.getByTestId('revision-note')).toHaveText('Your original submission stays as it was. Your supervisor gets this revision when you resubmit.');
  await expect(page.getByTestId('history')).toContainText('Submitted by Daniel Lim');
  await expect(page.getByTestId('history')).toContainText('Changes requested');
  await page.getByTestId('logbook-back').click();
  await expect(page).toHaveURL(/#\/logbook$/);
});

test('the supervisor sees which boxes a resubmit changed', async ({ page }) => {
  await demoAs(page, 'Daniel Lim');
  await openWeek(page, 'Revise');
  const typeBox = page.locator('[data-testid="field"]', { hasText: 'Type' });
  await typeBox.locator('textarea').fill('Revised: built and tested the export endpoint.');
  await page.getByTestId('submit-period').click();
  await page.getByTestId('confirm-submit').click();
  await expect(page.getByTestId('status-badge').first()).toHaveText('Submitted');

  await asRole(page, 'Supervisor');
  await page.getByRole('link', { name: /^Review(\s|$)/ }).click();
  await page.getByTestId('queue-row').filter({ hasText: 'Daniel Lim' }).filter({ hasText: 'Week 2 ·' }).click();
  const changes = page.getByTestId('changes');
  await expect(changes).toContainText('Changed since the last submission');
  await expect(changes.getByTestId('changed-box')).toHaveCount(1);
  await changes.getByTestId('changed-box').locator('summary').click();
  await expect(changes.getByTestId('changed-box')).toContainText('Revised: built and tested the export endpoint.');
  await expect(page.getByTestId('history')).toContainText('Resubmitted');
});
