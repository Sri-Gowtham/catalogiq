import { expect, test } from '@playwright/test'
import { login, watch } from './helpers'

test('catalog: header sorting, page size, and a saved view', async ({ page }) => {
  const errors = watch(page)
  await login(page, 'manager')
  await page.goto('/app/catalog')

  const quality = page.getByRole('columnheader', { name: /Quality/ })
  await quality.getByRole('button').click()
  await expect(page).toHaveURL(/sort=quality(&|$)/)
  await expect(quality).toHaveAttribute('aria-sort', 'descending')
  await quality.getByRole('button').click()
  await expect(page).toHaveURL(/sort=quality_asc/)
  await expect(quality).toHaveAttribute('aria-sort', 'ascending')

  await page.getByRole('combobox', { name: 'Rows' }).selectOption('50')
  await expect(page).toHaveURL(/page_size=50/)
  await expect(page.locator('tbody tr')).toHaveCount(50)

  page.once('dialog', (d) => d.accept('Lowest quality'))
  await page.getByRole('button', { name: 'Save this view' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'saved' })).toBeVisible()
  await page.goto('/app/catalog')
  await page.getByRole('combobox', { name: 'Saved views' }).selectOption('Lowest quality')
  await expect(page).toHaveURL(/sort=quality_asc/)
  expect(errors).toEqual([])
})

test('catalog: select products, export them, and publish the ready ones', async ({ page }) => {
  await login(page, 'manager')
  await page.goto('/app/catalog?status=ready')
  await page.getByRole('checkbox', { name: 'Select all products on this page' }).check()
  await expect(page.getByText(/\d+ selected/)).toBeVisible()

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export selected' }).click()])
  expect(download.suggestedFilename()).toBe('catalogiq-products.csv')

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Publish selected' }).click()
  await expect(page.getByRole('status').filter({ hasText: /published/ })).toBeVisible({ timeout: 30_000 })
  await page.goto('/app/catalog?status=ready')
  await expect(page.getByText('No products match')).toBeVisible()
})

test('viewer has no publish control but can still export', async ({ page }) => {
  await login(page, 'viewer')
  await page.goto('/app/catalog')
  await expect(page.getByRole('button', { name: 'Publish selected' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Export/ })).toBeVisible()
})

test('product: unsaved edits are protected, reset works, and saved edits can be published', async ({ page }) => {
  await login(page, 'manager')
  await page.goto('/app/products/161?tab=content')
  await page.getByRole('button', { name: 'Edit' }).click()
  const title = page.getByRole('textbox', { name: 'Title' })
  const original = await title.inputValue()
  await title.fill(`${original} test`)

  // leaving through a link asks first; declining keeps the edit
  let asked = ''
  page.once('dialog', async (d) => {
    asked = d.message()
    await d.dismiss()
  })
  await page.getByRole('link', { name: 'Products', exact: true }).first().click()
  expect(asked).toContain('unsaved')
  await expect(page).toHaveURL(/products\/161/)
  await expect(title).toHaveValue(`${original} test`)

  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(title).toHaveValue(original)

  await title.fill(`${original} v2`)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Unpublished changes.')).toBeVisible()
  await page.getByRole('button', { name: 'Publish changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'changes published' })).toBeVisible()
  await expect(page.getByText('Unpublished changes.')).toHaveCount(0)
})

test('product: images open in a zoom dialog that Escape closes', async ({ page }) => {
  await login(page, 'viewer')
  await page.goto('/app/products/161?tab=images')
  await page.getByRole('button', { name: 'Enlarge front image' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('product: source vs enriched labels what changed', async ({ page }) => {
  await login(page, 'viewer')
  await page.goto('/app/products/161?tab=source')
  await expect(page.getByText(/\d+ added/)).toBeVisible()
  await expect(page.getByText('Added', { exact: true }).first()).toBeVisible()
})

test('review: keyboard shortcuts move through the queue and approve', async ({ page }) => {
  await login(page, 'manager')
  await page.goto('/app/review')
  const first = await page.getByRole('heading', { name: 'Details' }).locator('xpath=ancestor::section').innerText()
  await page.keyboard.press('j')
  await expect.poll(async () => page.getByRole('heading', { name: 'Details' }).locator('xpath=ancestor::section').innerText()).not.toBe(first)
  await page.keyboard.press('a')
  await expect(page.getByRole('status').filter({ hasText: 'Approved' })).toBeVisible()
})

test('upload: a feed shows a preview first and nothing is sent until confirmed', async ({ page }) => {
  await login(page, 'manager')
  await page.goto('/app/batches')
  const csv = 'sku,name,brand,category,weight,price_usd\nT-1,Test Chips,Acme,Snacks,50g,1.20\nT-2,Test Nuts,Acme,Snacks,100g,2.40\n'
  await page.getByLabel('Supplier feed file').setInputFiles({ name: 'tiny.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.getByText('Preview: tiny.csv')).toBeVisible()
  await expect(page.getByText('Test Chips')).toBeVisible()
  await expect(page.getByText('Showing 2 of 2 rows')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Preview: tiny.csv')).toHaveCount(0)

  await page.getByLabel('Supplier feed file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(page.getByRole('alert').filter({ hasText: '.csv or .json' })).toBeVisible()
})
