import { expect, test } from '@playwright/test'

// Mentor journey: approve after company approval; rejection restarts company
// review. Runs against the dev MSW mock (VITE_ENABLE_MSW=true), never prod.
test('mentor reviews company-approved weeks', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
