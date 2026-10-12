import { defineConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const backend = path.resolve(import.meta.dirname, '../backend')
const python = process.platform === 'win32' ? path.join(backend, '.venv/Scripts/python.exe') : path.join(backend, '.venv/bin/python')
const db = path.resolve(import.meta.dirname, 'e2e/.tmp/e2e.db')

// Fresh database per run. Workers load this file again, so only the main process may clear it.
if (process.env.TEST_WORKER_INDEX === undefined) {
  fs.rmSync(path.dirname(db), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(db), { recursive: true })
}

// Uses the installed Chrome. Every run starts from a fresh database, so tests may change data freely.
// Stop any dev server on port 5173 first; the test server uses an API on port 8010.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: [
    {
      command: `"${python}" -m uvicorn main:app --port 8010`,
      cwd: backend,
      url: 'http://127.0.0.1:8010/api/health',
      env: { CATALOGIQ_DB: db, CATALOGIQ_JWT_SECRET: 'e2e-secret-not-for-production', CATALOGIQ_DEV_RESET_LINKS: '1' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      env: { E2E_API: 'http://127.0.0.1:8010' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
