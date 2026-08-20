import { expect, test } from '@playwright/test'

const LOCALES = ['en', 'de'] as const

/**
 * `/[locale]/sign-in` — the maintainer login surface (#244 follow-on).
 *
 * Async RSC, so this is a Playwright spec rather than a Vitest one (see the
 * CLAUDE.md anti-pattern list). Nothing here signs in: a real Clerk session
 * needs credentials CI does not hold. What these specs pin is the part that
 * regressed silently before — the route being reachable, ungated, localised,
 * and free of any sign-up affordance.
 */
test.describe('sign-in page', () => {
  for (const locale of LOCALES) {
    test(`${locale}: reachable without accepting the age gate`, async ({ browser }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
      })
      const page = await context.newPage()

      const response = await page.goto(`/${locale}/sign-in`)
      expect(response?.status()).toBe(200)
      expect(page.url()).toMatch(new RegExp(`/${locale}/sign-in$`))

      await expect(page.getByTestId('sign-in-page')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // Ungated like the legal pages: it shows no sake, flavor, or
      // recommendation data, so JMStV §6(5) has nothing to gate — and gating
      // it would trap the maintainer behind a rewrite on their own entry point.
      await expect(page.getByTestId('age-gate')).toBeHidden()

      await context.close()
    })
  }

  test('offers no route to creating an account', async ({ page }) => {
    // ADR-0020 keeps v1 a maintainer-only private beta. The widget ships a
    // "Don't have an account? Sign up" footer by default; if a Clerk upgrade
    // ever restores it, this fails instead of quietly inviting sign-ups.
    await page.goto('/en/sign-in')
    await expect(page.getByTestId('sign-in-page')).toBeVisible()

    await expect(page.getByRole('link', { name: /sign up/i })).toHaveCount(0)
    await expect(page.locator('a[href*="sign-up"]')).toHaveCount(0)
  })

  test('German visitors get German copy, not Clerk defaults', async ({ browser }) => {
    // The reason we map Clerk's localization ourselves — an English-only
    // widget on /de would violate the i18n merge rule.
    const context = await browser.newContext({ locale: 'de-DE' })
    const page = await context.newPage()

    await page.goto('/de/sign-in')
    await expect(page.getByTestId('sign-in-page')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Anmelden')

    await context.close()
  })

  test('signed-out visitors see no sign-out control in the header', async ({ page }) => {
    await page.goto('/en/sign-in')
    await expect(page.getByTestId('site-header')).toBeVisible()
    await expect(page.getByTestId('header-sign-out')).toHaveCount(0)
  })
})
