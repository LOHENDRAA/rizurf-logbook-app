import { expect, test } from '@playwright/test';
import { asRole, iso, lastWeekday, nav, writeEntry } from './helpers';

const day = iso(lastWeekday());

test('an intern organizes an entry, reviews the suggestions and sees what it is connected to', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Aina Rahman');
  await writeEntry(page, day, 'Built the login page. Fixed the redirect bug. Wrote a test.');

  await page.getByTestId('organize').click();
  const panel = page.getByTestId('review-panel');
  await expect(panel.getByTestId('review-demo')).toHaveText('Demo suggestions (no AI)');
  await expect(panel.getByTestId('review-card')).toHaveCount(3); // no projects yet, so no project card
  const cards = panel.getByTestId('review-card');
  await cards.nth(0).getByTestId('review-accept').click();
  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByTestId('review-edit').click();
  await panel.getByTestId('review-edit-text').fill('Fixed the login redirect bug');
  await panel.getByTestId('review-save').click();
  await expect(cards).toHaveCount(1);
  await cards.nth(0).getByTestId('review-reject').click();
  await expect(panel.getByTestId('review-card')).toHaveCount(0);
  await expect(page.getByTestId('organize-summary')).toContainText('2 accepted · 0 waiting');

  // Organizing again keeps the accepted ones and doesn't bring back the rejected or edited-away wording.
  await page.getByTestId('organize').click();
  await expect(page.getByTestId('organize')).toHaveText('✦ Organize');
  await expect(panel.getByTestId('review-card')).toHaveCount(0);

  await expect(page.getByTestId('connected-item')).toHaveText(['Activity Built the login page', 'Activity Fixed the login redirect bug']);
});

test('accepting an edited project name creates the project and connects the entry', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Aina Rahman');
  await nav(page, 'Projects');
  await page.getByTestId('project-new').click();
  await page.getByTestId('project-name').fill('ERP gateway');
  await page.getByTestId('project-save').click();

  await writeEntry(page, day, 'Built the mobile login screen.');
  await page.getByTestId('organize').click();
  const project = page.locator('[data-testid="review-card"][data-kind="project"]');
  await expect(project.getByTestId('review-text')).toHaveText('ERP gateway');
  await project.getByTestId('review-edit').click();
  await page.getByTestId('review-edit-text').fill('Mobile app');
  await page.getByTestId('review-save').click();
  await expect(page.getByTestId('connected-project')).toHaveText('Mobile app');
  await page.getByTestId('connected-project').click();
  await expect(page.getByTestId('project-title')).toHaveText('Mobile app');
});

test('clearing an entry with accepted items asks first', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Aina Rahman');
  await writeEntry(page, day, 'Built the login page.');
  await page.getByTestId('organize').click();
  await page.getByTestId('review-accept').first().click();
  await expect(page.getByTestId('connected-item')).toHaveCount(1);

  await page.getByTestId('entry-text').fill('');
  await expect(page.getByRole('dialog')).toContainText('This entry has accepted items.');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('entry-text')).toHaveValue('Built the login page.');

  await page.getByTestId('entry-text').fill('');
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await expect(page.getByTestId('connected-item')).toHaveCount(0);
});

test('supervisors have no Organize button', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  await nav(page, 'Today');
  await page.getByTestId('entry-text').fill('Met the interns.');
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
  await expect(page.getByTestId('organize')).toHaveCount(0);
});
