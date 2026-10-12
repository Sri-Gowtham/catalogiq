import { expect, type Page } from '@playwright/test'

export const PASSWORD = 'Demo@12345'
export const USERS = { admin: 'demo@acmefoods.example', manager: 'manager@acmefoods.example', viewer: 'viewer@acmefoods.example' } as const

export async function login(page: Page, role: keyof typeof USERS) {
  await page.goto('/login')
  await page.fill('input[name=email]', USERS[role])
  await page.fill('input[name=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL('**/app')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/** Collects console errors and page errors so a test can assert the page behaved. */
export function watch(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return errors
}
