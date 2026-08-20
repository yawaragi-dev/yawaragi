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

  test('renders the login widget with our own copy, not Clerk defaults', async ({ page }) => {
    // Positive assertion by design. There is deliberately NO e2e test here
    // asserting the absence of a sign-up link, because such a test cannot be
    // made trustworthy: Clerk mounts asynchronously and its footer arrives
    // after the form fields, so every "expect no sign-up link" variant passed
    // even with all suppression removed — a mutation test proved it twice.
    // A test that cannot fail is worse than no test.
    //
    // What actually guards "login only":
    //   1. `clerk-localization.test.ts` — deterministic, and verified to fail
    //      when the blanked actionText/actionLink are restored.
    //   2. The Clerk instance's own sign-up mode (Restrictions → Restricted).
    //      That is the enforcement of record; the in-app `appearance` rule is
    //      cosmetic and cannot remove the anchor from the DOM.
    await page.goto('/en/sign-in')
    await expect(page.getByTestId('sign-in-page')).toBeVisible()

    // The widget mounted and took our localised submit label — which is the
    // same mechanism that blanks the sign-up invitation.
    // `exact` matters: Clerk also renders "Continue with Google", and
    // Playwright's name matching is substring-by-default.
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
    await expect(page.getByText('Email address', { exact: true })).toBeVisible()
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
