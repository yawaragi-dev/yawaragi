/**
 * Shared base-URL constant for Playwright tests.
 *
 * Defaults to `http://localhost:3000` (so local `pnpm test:e2e` against
 * the dev server keeps working). The `vercel-smoke.yml` workflow sets
 * `PLAYWRIGHT_BASE_URL` to the deployed URL so the same spec files run
 * against a real Vercel preview without code changes.
 *
 * Cookies added via `context.addCookies()` need an `url` field; that
 * `url`'s origin must match the page's origin, otherwise the cookie is
 * silently ignored. Tests import `BASE_URL` here instead of hardcoding
 * `http://localhost:3000`.
 */
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
