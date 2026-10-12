import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

const scan = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()).violations.map((v) => `${v.id} x${v.nodes.length}: ${v.help}`)

test('public pages have no accessibility violations', async ({ page }) => {
  test.setTimeout(90_000)
  for (const path of ['/', '/login', '/signup', '/contact', '/forgot-password', '/reset-password']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    expect(await scan(page), path).toEqual([])
  }
})

for (const role of ['admin', 'manager', 'viewer'] as const) {
  test(`app pages have no accessibility violations as ${role}`, async ({ page }) => {
    test.setTimeout(180_000)
    await login(page, role)
    const pages = ['/app', '/app/catalog', '/app/products/161?tab=content', '/app/products/161?tab=images', '/app/products/161?tab=performance', '/app/platforms', '/app/performance', '/app/reports', '/app/settings']
    if (role !== 'viewer') pages.push('/app/batches', '/app/batches/1', '/app/review', '/app/publishing', '/app/rules', '/app/workbench')
    for (const path of pages) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      expect(await scan(page), `${role} ${path}`).toEqual([])
    }
  })
}
