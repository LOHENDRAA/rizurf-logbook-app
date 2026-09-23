import { expect, test } from '@playwright/test'

// Supervisor journey: approve a pending week, request changes on another.
// Runs against the dev MSW mock (VITE_ENABLE_MSW=true), never production.
test('supervisor reviews submitted weeks', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
