import { expect, test } from '@playwright/test'
import { login, watch } from './helpers'

const STAFF_PAGES = ['/app/batches', '/app/review', '/app/publishing', '/app/rules', '/app/workbench']
const OPEN_PAGES = ['/app', '/app/catalog', '/app/products/161?tab=content', '/app/platforms', '/app/performance', '/app/reports', '/app/settings']
const RESTRICTED = 'This page is for managers and admins'

test('viewer: six menu items, restricted pages, no action buttons', async ({ page }) => {
  const errors = watch(page)
  await login(page, 'viewer')
  expect(await page.locator('nav[aria-label=Main] a').allInnerTexts()).toEqual(['Overview', 'Products', 'Platforms', 'Performance', 'Reports', 'Settings'])
  for (const path of STAFF_PAGES) {
    await page.goto(path)
    await expect(page.getByText(RESTRICTED)).toBeVisible()
  }
  for (const path of OPEN_PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(RESTRICTED)).toHaveCount(0)
  }
  await page.goto('/app/products/161?tab=content')
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Publish to/ })).toHaveCount(0)
  await page.goto('/app/settings')
  await expect(page.getByRole('button', { name: 'Invite' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Audit log' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('manager: all pages, can edit and review, cannot change rules, platforms or team', async ({ page }) => {
  const errors = watch(page)
  await login(page, 'manager')
  for (const path of [...STAFF_PAGES, ...OPEN_PAGES]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(RESTRICTED)).toHaveCount(0)
  }
  await page.goto('/app/products/161?tab=content')
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
  await page.goto('/app/rules')
  await expect(page.getByRole('button', { name: 'Add rule' })).toHaveCount(0)
  await page.goto('/app/platforms')
  await expect(page.getByRole('button', { name: /Disconnect/ })).toHaveCount(0)
  await page.goto('/app/settings')
  await expect(page.getByRole('button', { name: 'Invite' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('admin: controls are present, and the View-as switch changes the experience', async ({ page }) => {
  await login(page, 'admin')
  await page.goto('/app/rules')
  await expect(page.getByRole('button', { name: 'Add rule' })).toBeVisible()
  await page.goto('/app/settings')
  await expect(page.getByRole('button', { name: 'Invite' })).toBeVisible()
  await page.getByRole('radio', { name: 'viewer' }).click()
  await expect(page.getByText('Read-only')).toBeVisible()
  await expect(page.locator('nav[aria-label=Main] a')).toHaveCount(6)
})

test('the API refuses what the menu hides, even when called directly', async ({ page }) => {
  await login(page, 'viewer')
  for (const url of ['/api/batches', '/api/review', '/api/publishing', '/api/rules', '/api/workbench', '/api/audit-log']) {
    const res = await page.context().request.get(`http://127.0.0.1:5173${url}`)
    expect(res.status(), url).toBe(403)
  }
})
