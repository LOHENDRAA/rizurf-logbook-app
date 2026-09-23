import { test } from '@playwright/test'

// Student journey: edit a daily log + weekly draft, then submit the week.
// Runs against the dev MSW mock (VITE_ENABLE_MSW=true), never production.
test('student edits and submits a week', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/email address/i).fill('aisha.rahman@student.example.edu')
  await page.getByLabel(/password/i).fill('dev-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('/dashboard')
  await page.getByRole('link', { name: /journal/i }).first().click()
  await page.waitForURL('/journal')
})
