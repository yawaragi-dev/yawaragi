// Teaches: Playwright config wiring — baseURL + webServer let tests run against the real Next.js dev server
import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// Load .env.local for the Playwright runner process. The Next.js dev server
// (the webServer subprocess) loads .env.local itself, but the test runner
// that reads process.env.DATABASE_URL at file-load time (e.g. the skip
// condition in e2e/sake-page.spec.ts) needs it here too. process.loadEnvFile
// is built into Node 22.6+ — no dotenv dep needed.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000', channel: 'chrome' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
