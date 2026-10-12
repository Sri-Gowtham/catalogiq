import { expect, test } from '@playwright/test'
import { watch } from './helpers'

test('wrong password shows an error and stays on the login page', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name=email]', 'demo@acmefoods.example')
  await page.fill('input[name=password]', 'not-the-password')
  await page.click('button[type=submit]')
  await expect(page.getByRole('alert')).toContainText('incorrect')
  await expect(page).toHaveURL(/\/login/)
})

test('the app redirects to login without a session', async ({ page }) => {
  await page.goto('/app/catalog')
  await expect(page).toHaveURL(/\/login/)
})

test('demo button opens the sample workspace and sign out ends the session', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'View demo' }).first().click()
  await page.waitForURL('**/app')
  await expect(page.getByText('Demo workspace').first()).toBeVisible()
  await page.getByRole('button', { name: /account menu/ }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/login/)
  expect(errors).toEqual([])
})

test('signup, onboarding with an empty catalog, then the sample feed fills the workspace', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/signup')
  await page.fill('input[name=name]', 'Erin Example')
  await page.fill('input[name=email]', `erin${Date.now()}@example.test`)
  await page.fill('input[name=company]', 'Example Foods')
  await page.fill('input[name=password]', 'Str0ngPass!')
  await page.click('button[type=submit]')
  await page.waitForURL('**/onboarding')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByText('Start empty').click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Open my workspace' }).click()
  await page.waitForURL('**/app')
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible()
  await page.getByRole('button', { name: 'Run sample feed' }).click()
  await page.waitForURL('**/app/batches/*')
  await expect(page.getByText('Completed').first()).toBeVisible({ timeout: 30_000 })
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('duplicate signup is rejected with a clear message', async ({ page }) => {
  await page.goto('/signup')
  await page.fill('input[name=name]', 'Dana Again')
  await page.fill('input[name=email]', 'demo@acmefoods.example')
  await page.fill('input[name=company]', 'Acme Again')
  await page.fill('input[name=password]', 'Str0ngPass!')
  await page.click('button[type=submit]')
  await expect(page.getByRole('alert')).toContainText('already exists')
})
