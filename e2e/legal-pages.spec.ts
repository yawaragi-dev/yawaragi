import { expect, test } from '@playwright/test'

// Localised external paths come from src/i18n/routing.ts#pathnames — kept
// duplicated here so the spec stays self-contained and a missing pathname
// entry surfaces as an obvious test failure rather than a silent route
// change.
const LEGAL_PATHS = {
  imprint: { en: '/imprint', de: '/Impressum' },
  privacy: { en: '/privacy', de: '/Datenschutz' },
} as const

const LOCALES = ['en', 'de'] as const

test.describe('imprint page (§5 TMG)', () => {
  for (const locale of LOCALES) {
    const path = LEGAL_PATHS.imprint[locale]
    test(`${locale}: /${locale}${path} renders without the age-gate cookie`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
      })
      const page = await context.newPage()

      const response = await page.goto(`/${locale}${path}`)
      expect(response?.status()).toBe(200)
      expect(page.url()).toMatch(new RegExp(`/${locale}${path}$`))

      await expect(page.getByTestId('imprint-page')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // The §18(2) MStV responsibility statement must be present in both
      // locales — it is the legal core of the page, not optional flavour.
      await expect(page.getByText(/18\(2\) MStV/)).toBeVisible()
      // Age-gate dialog must NOT appear — the legal pages are in the
      // ungated allowlist so a visitor can identify the operator before
      // consenting.
      await expect(page.getByTestId('age-gate')).toBeHidden()

      await context.close()
    })
  }
})

test.describe('privacy page (GDPR)', () => {
  for (const locale of LOCALES) {
    const path = LEGAL_PATHS.privacy[locale]
    test(`${locale}: /${locale}${path} renders without the age-gate cookie`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
      })
      const page = await context.newPage()

      const response = await page.goto(`/${locale}${path}`)
      expect(response?.status()).toBe(200)
      expect(page.url()).toMatch(new RegExp(`/${locale}${path}$`))

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
    const imprintPath = LEGAL_PATHS.imprint[locale]
    const privacyPath = LEGAL_PATHS.privacy[locale]

    test(`${locale}: /${locale}${imprintPath} renders with JavaScript disabled`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
        javaScriptEnabled: false,
      })
      const page = await context.newPage()

      const response = await page.goto(`/${locale}${imprintPath}`)
      expect(response?.status()).toBe(200)
      await expect(page.getByTestId('imprint-page')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      await context.close()
    })

    test(`${locale}: /${locale}${privacyPath} renders with JavaScript disabled`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
        javaScriptEnabled: false,
      })
      const page = await context.newPage()

      const response = await page.goto(`/${locale}${privacyPath}`)
      expect(response?.status()).toBe(200)
      await expect(page.getByTestId('privacy-page')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      await context.close()
    })
  }
})

test.describe('footer legal links', () => {
  for (const locale of LOCALES) {
    const imprintPath = LEGAL_PATHS.imprint[locale]
    const privacyPath = LEGAL_PATHS.privacy[locale]

    test(`${locale}: footer links to the localised imprint + privacy paths`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-US' : 'de-DE',
      })
      const page = await context.newPage()

      // Use the imprint page as a stable landing — the EN homepage shows
      // the age gate (which would obscure the footer in some viewports),
      // and the DE homepage shows coming-soon (different layout).
      await page.goto(`/${locale}${imprintPath}`)

      const footer = page.getByTestId('site-footer')
      await expect(footer).toBeVisible()

      const imprintLink = footer.getByTestId('footer-imprint-link')
      const privacyLink = footer.getByTestId('footer-privacy-link')

      await expect(imprintLink).toBeVisible()
      await expect(privacyLink).toBeVisible()

      // Locale-prefixed AND locale-localised URLs — next-intl's Link
      // resolves the pathnames entry, so the EN visitor sees /en/imprint
      // and the DE visitor sees /de/impressum (likewise for privacy /
      // datenschutz).
      await expect(imprintLink).toHaveAttribute(
        'href',
        new RegExp(`^/${locale}${imprintPath}`),
      )
      await expect(privacyLink).toHaveAttribute(
        'href',
        new RegExp(`^/${locale}${privacyPath}`),
      )

      await context.close()
    })
  }
})

// Locale-switch coverage. The locale switcher uses next-intl's
// router.replace({pathname, params}, {locale: next}) so the destination
// URL re-resolves through the routing.ts#pathnames manifest. A switch
// from /en/imprint must land on /de/Impressum (and vice versa), not
// /de/imprint (which next-intl redirects to the localised path but
// should never be the landing URL).
test.describe('locale switcher resolves localised legal paths', () => {
  for (const { from, to, fromPath, toPath, label } of [
    { from: 'en', to: 'de', fromPath: LEGAL_PATHS.imprint.en, toPath: LEGAL_PATHS.imprint.de, label: 'imprint' },
    { from: 'de', to: 'en', fromPath: LEGAL_PATHS.imprint.de, toPath: LEGAL_PATHS.imprint.en, label: 'imprint' },
    { from: 'en', to: 'de', fromPath: LEGAL_PATHS.privacy.en, toPath: LEGAL_PATHS.privacy.de, label: 'privacy' },
    { from: 'de', to: 'en', fromPath: LEGAL_PATHS.privacy.de, toPath: LEGAL_PATHS.privacy.en, label: 'privacy' },
  ] as const) {
    test(`${label}: /${from}${fromPath} → switch to ${to} → /${to}${toPath}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        locale: from === 'en' ? 'en-US' : 'de-DE',
      })
      const page = await context.newPage()
      await page.goto(`/${from}${fromPath}`)

      await page
        .getByTestId('locale-switcher')
        .getByRole('button', { name: to === 'en' ? 'English' : 'Deutsch' })
        .click()

      await page.waitForURL(new RegExp(`/${to}${toPath}$`))
      expect(page.url()).toMatch(new RegExp(`/${to}${toPath}$`))

      await context.close()
    })
  }
})

// English-form-in-German-locale coverage. Visiting /de/imprint (the
// internal English key under the German locale) must redirect to the
// canonical localised path /de/Impressum — next-intl handles this via
// the pathnames manifest, and the test pins the contract so a future
// routing refactor can't silently turn the redirect into a 404 (or
// into a duplicate-content 200 on the English-form URL).
//
// Lowercase German variants like /de/impressum are NOT pathnames-manifest
// keys, so without an explicit rule they fall through the locale-segment
// fallback and get rewritten to the /de homepage (a silent 200 that reads
// as "page not found" + SEO duplicate content). The proxy now permanently
// (308) redirects them to the capitalised canonical form — covered below so
// a routing refactor can't silently regress it.
test.describe('English-form legal URLs in German locale redirect to canonical', () => {
  for (const { wrong, canonical } of [
    { wrong: '/de/imprint', canonical: LEGAL_PATHS.imprint.de },
    { wrong: '/de/privacy', canonical: LEGAL_PATHS.privacy.de },
  ] as const) {
    test(`${wrong} → /de${canonical}`, async ({ browser }) => {
      const context = await browser.newContext({ locale: 'de-DE' })
      const page = await context.newPage()
      const response = await page.goto(wrong)
      expect(response?.status()).toBe(200)
      expect(page.url()).toMatch(new RegExp(`/de${canonical}$`))
      await context.close()
    })
  }

  // Lowercase German variants: a user typing /de/impressum (the way most
  // people type URLs) must land on the canonical /de/Impressum via a
  // permanent 308, not the /de homepage.
  for (const { lowercase, canonical } of [
    { lowercase: '/de/impressum', canonical: LEGAL_PATHS.imprint.de },
    { lowercase: '/de/datenschutz', canonical: LEGAL_PATHS.privacy.de },
  ] as const) {
    test(`${lowercase} → 308 → /de${canonical}`, async ({ browser }) => {
      const context = await browser.newContext({ locale: 'de-DE' })
      const page = await context.newPage()

      // Assert the permanent-redirect status on the first hop before the
      // browser follows it — a 307 or a rewrite-to-200 would fail here.
      const redirect = await page.request.get(lowercase, {
        maxRedirects: 0,
      })
      expect(redirect.status()).toBe(308)
      expect(redirect.headers()['location']).toMatch(
        new RegExp(`/de${canonical}$`),
      )

      // And the followed navigation lands on the canonical page.
      const response = await page.goto(lowercase)
      expect(response?.status()).toBe(200)
      expect(page.url()).toMatch(new RegExp(`/de${canonical}$`))

      await context.close()
    })
  }
})
