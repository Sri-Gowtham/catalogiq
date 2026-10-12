import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login, watch } from './helpers'

const scan = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()).violations.map((v) => `${v.id} x${v.nodes.length}: ${v.help} -> ${v.nodes.slice(0, 2).map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message ?? '')).join(' | ')}`)

const dark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'))

test('theme switch: dark and light are remembered across reloads', async ({ page }) => {
  const errors = watch(page)
  await page.emulateMedia({ colorScheme: 'light' })
  await login(page, 'manager')
  expect(await dark(page)).toBe(false)

  await page.getByRole('button', { name: /account menu/ }).click()
  await page.getByRole('radio', { name: 'Dark' }).click()
  expect(await dark(page)).toBe(true)
  await page.reload()
  expect(await dark(page)).toBe(true) // applied before first paint, from the saved choice

  await page.getByRole('button', { name: /account menu/ }).click()
  await page.getByRole('radio', { name: 'Light' }).click()
  await page.reload()
  expect(await dark(page)).toBe(false)
  expect(errors).toEqual([])
})

test('"system" follows the operating system and an explicit choice overrides it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  expect(await dark(page)).toBe(true)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => dark(page)).toBe(false) // live change while on "system"

  await page.getByRole('radio', { name: 'Dark' }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await dark(page)).toBe(true) // an explicit choice wins over the OS
})

test('the landing page can switch theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.getByRole('radio', { name: 'Dark' }).click()
  expect(await dark(page)).toBe(true)
})

test('dark mode has no accessibility violations', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => localStorage.setItem('catalogiq.theme', 'dark'))
  for (const path of ['/', '/login', '/signup']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    expect(await dark(page), path).toBe(true)
    expect(await scan(page), `dark ${path}`).toEqual([])
  }
  await login(page, 'admin')
  for (const path of ['/app', '/app/catalog', '/app/products/161?tab=content', '/app/products/161?tab=performance', '/app/review', '/app/batches/1', '/app/platforms', '/app/performance', '/app/rules', '/app/workbench', '/app/settings']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    expect(await scan(page), `dark ${path}`).toEqual([])
  }
})
