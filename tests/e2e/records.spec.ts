import { expect, test } from '@playwright/test';
import { asRole, iso, lastWeekday, nav, writeEntry } from './helpers';

const day = iso(lastWeekday());

test('a fresh intern sees empty Projects, Learning and Skills pages', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Aina Rahman');
  await nav(page, 'Projects');
  await expect(page.getByTestId('projects-empty')).toHaveText('Projects appear when you accept one from an entry, or add one here.');
  await nav(page, 'Learning');
  await expect(page.getByTestId('learning-empty')).toHaveText('Learning points appear here when you accept them from your entries.');
  await nav(page, 'Skills');
  await expect(page.getByTestId('skills-empty')).toHaveText('Skills appear only when your journal supports them.');
  // In-app navigation: a reload would reset "Viewing as" to the supervisor.
  await page.evaluate(() => { location.hash = '#/projects/nope'; });
  await expect(page.getByTestId('project-missing')).toHaveText("That project doesn't exist.");
  await page.evaluate(() => { location.hash = '#/skills/nope'; });
  await expect(page.getByTestId('skill-missing')).toHaveText("You haven't been seen using that skill yet.");
});

test('a project with accepted items shows its counts, tabs, learning and skills; it can be renamed but not deleted while used', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Aina Rahman');
  await nav(page, 'Projects');
  await page.getByTestId('project-new').click();
  await page.getByTestId('project-name').fill('ERP gateway');
  await page.getByTestId('project-description').fill('Sign-in work');
  await page.getByTestId('project-save').click();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.getByTestId('project-new').click();
  await page.getByTestId('project-name').fill('Unused');
  await page.getByTestId('project-save').click();
  await expect(page.getByTestId('project-card')).toHaveCount(2);

  // The stand-in suggests the first project (no entry uses one yet) and one activity per sentence: accept all three.
  await writeEntry(page, day, 'Built the login page. Wrote a test.');
  await page.getByTestId('organize').click();
  for (let i = 3; i > 0; i--) {
    await expect(page.getByTestId('review-card')).toHaveCount(i);
    await page.getByTestId('review-accept').first().click();
  }
  await expect(page.getByTestId('organize-summary')).toContainText('3 accepted');

  await nav(page, 'Projects');
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await expect(page.getByTestId('project-card').first()).toContainText('ERP gateway');
  await expect(page.getByTestId('project-card').first().getByTestId('project-counts')).toHaveText('2 activities · 0 learning points · 0 skills');
  await page.getByTestId('project-card').first().click();
  await expect(page.getByTestId('project-title')).toHaveText('ERP gateway');
  await page.getByTestId('project-tab').filter({ hasText: 'Timeline' }).click();
  await expect(page.getByTestId('project-rows').getByRole('link')).toHaveCount(2);

  await page.getByTestId('project-tab').filter({ hasText: 'Overview' }).click();
  await page.getByTestId('project-delete').click();
  await page.getByTestId('ask-ok').click();
  await expect(page.locator('.toast')).toContainText('Entries still use this project. Move them first.');

  await page.getByTestId('project-rename').click();
  await page.getByTestId('project-edit-text').fill('ERP Gateway v2');
  await page.getByTestId('project-edit-save').click();
  await expect(page.getByTestId('project-title')).toHaveText('ERP Gateway v2');
});

test('supervisors have no Projects, Learning or Skills and are sent to Today', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await asRole(page, 'Supervisor');
  for (const name of ['Projects', 'Learning', 'Skills']) await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/skills'; });
  await expect(page).toHaveURL(/#\/today$/);
});

test('the demo data comes with projects, learning and skills', async ({ page }) => {
  await page.goto('/intern-logbook/');
  await page.getByTestId('load-demo').click();
  await page.getByTestId('ask-ok').click();
  await expect(page.getByTestId('template-row')).toHaveCount(2, { timeout: 20_000 });
  await asRole(page, 'Aina Rahman');
  await nav(page, 'Projects');
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await nav(page, 'Skills');
  await expect(page.getByTestId('skill-card').filter({ hasText: 'Unit testing' })).toHaveCount(1);
  await nav(page, 'Learning');
  await page.getByTestId('learning-filter').selectOption({ label: 'Invoice export' });
  await expect(page.getByTestId('learning-row').first()).toContainText('Testing an API with Postman');
});
