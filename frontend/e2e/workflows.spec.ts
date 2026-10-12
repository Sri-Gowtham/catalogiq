import { expect, test } from '@playwright/test'
import { login, watch } from './helpers'

test('catalog filters live in the URL and survive a reload', async ({ page }) => {
  await login(page, 'manager')
  await page.goto('/app/catalog')
  await page.getByRole('combobox', { name: /^Status/ }).selectOption('flagged')
  await expect(page).toHaveURL(/status=flagged/)
  await page.reload()
  await expect(page.getByRole('combobox', { name: /^Status/ })).toHaveValue('flagged')
  await expect(page.locator('td').getByText('FLAGGED', { exact: true }).first()).toBeVisible()
})

test('product tabs work with the keyboard and the compare view shows every platform', async ({ page }) => {
  await login(page, 'manager')
  await page.goto('/app/products/161?tab=overview')
  await page.getByRole('tab', { name: 'Overview' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Platform content', selected: true })).toBeVisible()
  await page.getByRole('radio', { name: 'Compare all' }).click()
  for (const name of ['Amazon India', 'Flipkart', 'Noon', 'Blinkit', 'Brand website']) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
  }
})

test('saving content shows a confirmation toast', async ({ page }) => {
  await login(page, 'manager')
  await page.goto('/app/products/161?tab=content')
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'content saved' })).toBeVisible()
})

test('review: rejecting asks first, then confirms with a toast', async ({ page }) => {
  const errors = watch(page)
  await login(page, 'manager')
  await page.goto('/app/review')
  let asked = ''
  page.once('dialog', async (d) => {
    asked = d.message()
    await d.accept()
  })
  await page.getByRole('button', { name: 'Reject, return to supplier' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Rejected' })).toBeVisible()
  expect(asked).toContain('Reject')
  expect(errors).toEqual([])
})

test('running the sample feed creates a batch that completes', async ({ page }) => {
  await login(page, 'manager')
  await page.goto('/app/batches')
  await page.getByRole('button', { name: 'Run sample feed' }).click()
  await page.waitForURL('**/app/batches/*')
  await expect(page.getByText('Completed').first()).toBeVisible({ timeout: 30_000 })
})

test('brand rulebook checks a sentence', async ({ page }) => {
  await login(page, 'admin')
  await page.goto('/app/rules')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText(/Blocked|Passes/)).toBeVisible()
})

test('each page sets its own tab title', async ({ page }) => {
  await login(page, 'manager')
  for (const [path, title] of [['/app/catalog', 'Products'], ['/app/review', 'Review queue'], ['/app/performance', 'Performance']]) {
    await page.goto(path)
    await expect(page).toHaveTitle(new RegExp(`^${title}`))
  }
})
