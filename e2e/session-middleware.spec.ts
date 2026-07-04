/**
 * E2E coverage for the middleware-issued `yawaragi_session` cookie.
 *
 * Post-#161 fix: the proxy (`src/proxy.ts`) is the sole writer of the
 * anonymous-session cookie. This spec asserts:
 *   - First visit to a gated locale path lands a `Set-Cookie:
 *     yawaragi_session=...` on the response.
 *   - A subsequent visit that carries the same cookie does NOT re-issue
 *     — the middleware verifies the signature and passes through.
 *
 * We do not assert on cookie attributes here (HttpOnly / SameSite /
 * Secure) — the middleware unit tests cover those via
 * `ensureAnonymousSessionCookie`. This spec is the smoke test that
 * middleware runs at all on the gated routes.
 */
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

const SESSION_COOKIE_NAME = 'yawaragi_session'

test.describe('anonymous-session cookie — middleware issuance', () => {
  test('first visit to /en/suggest carries a Set-Cookie for yawaragi_session', async ({
    browser,
  }, testInfo) => {
    // The middleware is a no-op without SESSION_COOKIE_SECRET (see
    // `ensureAnonymousSessionCookie` — non-production fallback). Skip
    // when the env is unwired so a fresh checkout without .env.local
    // doesn't fail the E2E suite. CI provides the env.
    testInfo.skip(
      !process.env.SESSION_COOKIE_SECRET,
      'SESSION_COOKIE_SECRET not set — middleware skips cookie issuance',
    )

    // Fresh context: no yawaragi_session cookie yet. The age-gate
    // cookie is present so the proxy doesn't rewrite to the
    // coming-soon page.
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    // Skip whatever the suggest action would do — this is a middleware
    // smoke test, not a suggest test. The `no-seed` branch renders a
    // placeholder without invoking `suggestAction`.
    const response = await page.goto('/en/suggest')
    expect(response, 'suggest page returned a response').not.toBeNull()

    // Check the browser's cookie jar for the session cookie stamped
    // by the middleware. Playwright's `context.cookies()` reads the
    // jar the browser accepted — which is exactly what a real visitor
    // would carry forward on the next request.
    const cookies = await context.cookies()
    const session = cookies.find((c) => c.name === SESSION_COOKIE_NAME)
    expect(session, 'yawaragi_session cookie was stamped').toBeDefined()
    expect(session!.value.length).toBeGreaterThan(0)
    // Signed cookie shape: `<payload>.<sig>` — one separator.
    expect(session!.value.split('.').length).toBe(2)

    await context.close()
  })

  test('second visit with the same session cookie does not re-issue it', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(
      !process.env.SESSION_COOKIE_SECRET,
      'SESSION_COOKIE_SECRET not set — middleware skips cookie issuance',
    )
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()

    // First visit stamps the cookie.
    await page.goto('/en/suggest')
    const firstCookies = await context.cookies()
    const first = firstCookies.find((c) => c.name === SESSION_COOKIE_NAME)
    expect(first).toBeDefined()

    // Second visit to a gated page.
    await page.goto('/en/scan')
    const secondCookies = await context.cookies()
    const second = secondCookies.find((c) => c.name === SESSION_COOKIE_NAME)
    expect(second).toBeDefined()

    // Value should be identical — the middleware sees a valid signed
    // cookie and passes through without re-issuing.
    expect(second!.value).toBe(first!.value)

    await context.close()
  })
})
