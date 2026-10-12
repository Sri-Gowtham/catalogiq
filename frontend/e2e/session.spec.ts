import { expect, test } from '@playwright/test'
import { login, watch } from './helpers'

test('the session is an httpOnly cookie: scripts cannot read it and no token is stored', async ({ page }) => {
  const errors = watch(page)
  await login(page, 'manager')
  expect(await page.evaluate(() => document.cookie)).not.toContain('catalogiq_session')
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toMatch(/token|eyJ/i)
  const cookies = await page.context().cookies()
  const session = cookies.find((c) => c.name === 'catalogiq_session')
  expect(session?.httpOnly).toBe(true)
  expect(session?.sameSite).toBe('Lax')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\/app$/)
  expect(errors).toEqual([])
})

test('signed-out visitors cause no failed requests on public pages', async ({ page }) => {
  const errors = watch(page)
  for (const path of ['/', '/login', '/signup', '/forgot-password', '/contact']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
  }
  expect(errors).toEqual([])
})

test('sign out ends the session on the server too', async ({ page }) => {
  await login(page, 'viewer')
  await page.getByRole('button', { name: /account menu/ }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
  const res = await page.context().request.get('http://127.0.0.1:5173/api/overview')
  expect(res.status()).toBe(401)
})

test('password field can be shown and hidden', async ({ page }) => {
  await page.goto('/login')
  const field = page.locator('input[name=password]')
  await expect(field).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(field).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(field).toHaveAttribute('type', 'password')
})

test('forgot password: request a link, choose a new password, sign in with it', async ({ page }) => {
  const email = `reset${Date.now()}@example.test`
  await page.goto('/signup')
  await page.fill('input[name=name]', 'Rita Reset')
  await page.fill('input[name=email]', email)
  await page.fill('input[name=company]', 'Reset Foods')
  await page.fill('input[name=password]', 'OldPass#12345')
  await page.click('button[type=submit]')
  await page.waitForURL('**/onboarding')
  await page.context().clearCookies()

  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await page.fill('input[name=email]', email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText('reset link has been sent')
  await page.getByRole('link', { name: 'open the reset link' }).click()
  await page.fill('input[name=password]', 'short')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page).toHaveURL(/reset-password/)
  await page.fill('input[name=password]', 'NewPass#67890')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('status')).toContainText('password was changed')

  await page.goto('/login')
  await page.fill('input[name=email]', email)
  await page.fill('input[name=password]', 'OldPass#12345')
  await page.click('button[type=submit]')
  await expect(page.getByRole('alert')).toContainText('incorrect')
  await page.fill('input[name=password]', 'NewPass#67890')
  await page.click('button[type=submit]')
  await page.waitForURL('**/onboarding')
})

test('a reset page without a token explains what is missing', async ({ page }) => {
  await page.goto('/reset-password')
  await expect(page.getByRole('alert')).toContainText('reset email')
  await expect(page.getByRole('button', { name: 'Change password' })).toBeDisabled()
})

test('contact form sends the request', async ({ page }) => {
  await page.goto('/contact')
  await page.fill('input[name=name]', 'Priya Buyer')
  await page.fill('input[name=email]', 'priya@retail.example')
  await page.getByRole('button', { name: 'Request a demo' }).click()
  await expect(page.getByRole('status')).toContainText('request is saved')
})
