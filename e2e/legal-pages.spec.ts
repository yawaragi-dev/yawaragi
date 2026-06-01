import { expect, test } from '@playwright/test'

const LOCALES = ['en', 'de'] as const

test.describe('imprint page (§5 TMG)', () => {
  for (const locale of LOCALES) {
    test(`${locale}: /${locale}/imprint renders without the age-gate cookie`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
      })
      const page = await context.newPage()

      const response = await page.goto(`/${locale}/imprint`)
      expect(response?.status()).toBe(200)
      expect(page.url()).toMatch(new RegExp(`/${locale}/imprint$`))

      await expect(page.getByTestId('imprint-page')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // The §18(2) MStV responsibility statement must be present in both
      // locales — it is the legal core of the page, not optional flavour.
      await expect(page.getByText(/18\(2\) MStV/)).toBeVisible()
      // Age-gate dialog must NOT appear — /imprint is in the ungated
      // allowlist so a visitor can identify the operator before consenting.
      await expect(page.getByTestId('age-gate')).toBeHidden()

      await context.close()
    })
  }
})

test.describe('privacy page (GDPR)', () => {
  for (const locale of LOCALES) {
    test(`${locale}: /${locale}/privacy renders without the age-gate cookie`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
      })
      const page = await context.newPage()

      const response = await page.goto(`/${locale}/privacy`)
      expect(response?.status()).toBe(200)
      expect(page.url()).toMatch(new RegExp(`/${locale}/privacy$`))

      await expect(page.getByTestId('privacy-page')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByTestId('age-gate')).toBeHidden()

      await context.close()
    })
  }
})

test.describe('legal pages without JavaScript', () => {
  // §5 TMG and the GDPR privacy policy must be reachable with JS disabled —
  // a German visitor on Tor / NoScript / a screenreader-only setup must
  // still see who runs the service before any cookie / script runs. Pages
  // are server-rendered with no client-only components in the critical
  // render path.
  for (const locale of LOCALES) {
    test(`${locale}: /${locale}/imprint renders with JavaScript disabled`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
        javaScriptEnabled: false,
      })
      const page = await context.newPage()

      const response = await page.goto(`/${locale}/imprint`)
      expect(response?.status()).toBe(200)
      await expect(page.getByTestId('imprint-page')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      await context.close()
    })

    test(`${locale}: /${locale}/privacy renders with JavaScript disabled`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
        javaScriptEnabled: false,
      })
      const page = await context.newPage()

      const response = await page.goto(`/${locale}/privacy`)
      expect(response?.status()).toBe(200)
      await expect(page.getByTestId('privacy-page')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      await context.close()
    })
  }
})

test.describe('footer legal links', () => {
  for (const locale of LOCALES) {
    test(`${locale}: footer links to /imprint and /privacy in the current locale`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
      })
      const page = await context.newPage()

      // Use /imprint as a stable landing — the EN homepage shows the age
      // gate (which would obscure the footer in some viewports), and the
      // DE homepage shows coming-soon (different layout).
      await page.goto(`/${locale}/imprint`)

      const footer = page.getByTestId('site-footer')
      await expect(footer).toBeVisible()

      const imprintLink = footer.getByTestId('footer-imprint-link')
      const privacyLink = footer.getByTestId('footer-privacy-link')

      await expect(imprintLink).toBeVisible()
      await expect(privacyLink).toBeVisible()

      // Locale-prefixed URLs — next-intl's Link prepends the active locale.
      await expect(imprintLink).toHaveAttribute(
        'href',
        new RegExp(`^/${locale}/imprint`),
      )
      await expect(privacyLink).toHaveAttribute(
        'href',
        new RegExp(`^/${locale}/privacy`),
      )

      await context.close()
    })
  }
})
