// Teaches: Playwright config wiring — baseURL + webServer let tests run
// against either the local Next.js dev server (default) OR a deployed
// Vercel URL when `PLAYWRIGHT_BASE_URL` is set in the runner env.
import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// Load .env.local for the Playwright runner process. The Next.js dev server
// (the webServer subprocess) loads .env.local itself, but the test runner
// that reads process.env.DATABASE_URL at file-load time (e.g. the skip
// condition in e2e/sake-page.spec.ts) needs it here too. process.loadEnvFile
// is built into Node 22.6+ — no dotenv dep needed.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

/**
 * `webServer.env` is typed as `{ [k: string]: string }` (no `undefined`),
 * but `process.env` is `{ [k: string]: string | undefined }`. We strip
 * the undefined entries before merging in our overrides so the type and
 * runtime shapes match.
 */
function definedEnvOnly(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

const DEPLOYED_URL = process.env.PLAYWRIGHT_BASE_URL
const VERCEL_BYPASS = process.env.VERCEL_BYPASS_TOKEN
const isAgainstDeployment = Boolean(DEPLOYED_URL)

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: DEPLOYED_URL || 'http://localhost:3000',
    channel: 'chrome',
    // When running against a Vercel preview, inject the SSO-bypass header
    // on every request so the deployment protection lets us through.
    // Locally, no headers (the dev server has no auth gate).
    extraHTTPHeaders:
      isAgainstDeployment && VERCEL_BYPASS
        ? {
            'x-vercel-protection-bypass': VERCEL_BYPASS,
            'x-vercel-set-bypass-cookie': 'true',
          }
        : undefined,
    ignoreHTTPSErrors: false,
  },
  // Don't start a local dev server when we're testing a deployed URL —
  // the target is already up. `webServer` is intentionally optional in
  // Playwright config; `undefined` here means "skip it."
  webServer: isAgainstDeployment
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        // Force the vision provider seam to the deterministic E2E stub
        // (`src/lib/ai/vision/e2e-stub-provider.ts`) so the scan E2E
        // exercises the full real flow (rate-limit → vision → Sakenowa
        // lookup → matched navigation) without burning Anthropic credit
        // on every CI run. Issue #108 acceptance: "Playwright spec
        // SHOULD NOT make real Anthropic calls". When running against
        // an existing dev server (`reuseExistingServer`), this env var
        // is ignored — set `VISION_PROVIDER=e2e-stub` in `.env.local`
        // to opt in for local hand-runs that share the dev server.
        env: {
          ...definedEnvOnly(),
          VISION_PROVIDER: 'e2e-stub',
        },
      },
})
