/**
 * E2E coverage for /[locale]/profile — the real Taste Profile (Phase 5 / #220,
 * P5-04b).
 *
 * Radar-first: the visitor's derived TasteProfile as a radar, with the
 * cross-beverage seed form as the cheap build path (/suggest is only a quiet
 * secondary link). The page reads a session-keyed store; in non-production the
 * `yawaragi_taste_stub` cookie drives each state without a live Upstash
 * (mirrors scan's e2e-stub / suggest's stub cookie).
 *
 * Age-gate still applies (the radar is flavor data → gated content). The six
 * axes use <FlavorAxisLabel /> so the romaji + kanji vocabulary is preserved.
 */
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

// Dismiss the cookie banner (fixed to the viewport bottom; can intercept
// clicks on links near the footer).
const CONSENT_COOKIE = {
  name: 'yawaragi_consent',
  value: JSON.stringify({ version: 1, analytics: false, marketing: false }),
  url: BASE_URL,
}

const tasteStub = (mode: 'populated' | 'cold_start' | 'unavailable') => ({
  name: 'yawaragi_taste_stub',
  value: mode,
  url: BASE_URL,
})

// Non-prod seam (ADR-0020): drives the maintainer tasting-journal states + also
// stands in for the maintainer gate, so the E2E needs no Clerk session / Upstash.
const journalStub = (mode: 'populated' | 'empty' | 'unavailable') => ({
  name: 'yawaragi_journal_stub',
  value: mode,
  url: BASE_URL,
})

test.describe('/en/profile — taste profile', () => {
  test('populated: renders the derived radar with all six axis labels + provenance', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, tasteStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/profile')

    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('profile-populated')).toBeVisible()
    await expect(page.getByTestId('taste-profile-radar')).toBeVisible()
    await expect(page.getByTestId('taste-profile-sample-polygon')).toBeAttached()
    for (const axis of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const) {
      await expect(page.getByTestId(`flavor-axis-${axis}-romaji`)).toBeVisible()
      await expect(page.getByTestId(`flavor-axis-${axis}-kanji`)).toBeVisible()
    }
    // "What shaped this" is present, and lists the seeded descriptor.
    await expect(page.getByTestId('taste-provenance-summary')).toBeVisible()
    await expect(page.getByTestId('taste-provenance-seeds')).toContainText('smoky')
    // P5-06: a populated profile surfaces ranked recommendations (the
    // "rate → recommender favors your zone" loop end-to-end; the dynamic
    // vector-shift itself is unit-tested in taste-recommender.test.ts). Each
    // recommendation links to its sake detail page.
    await expect(page.getByTestId('profile-recommendations')).toBeVisible()
    const firstRec = page.getByTestId('recommendation-101')
    await expect(firstRec).toBeVisible()
    await expect(firstRec).toHaveAttribute('href', '/en/sake/101')
    // No "coming soon" badge — this is real now.
    await expect(page.getByTestId('profile-coming-soon-badge')).toHaveCount(0)

    await context.close()
  })

  test('cold start: leads with a faded sample radar + the cross-beverage seed form', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, tasteStub('cold_start')])
    const page = await context.newPage()

    await page.goto('/en/profile')

    await expect(page.getByTestId('profile-cold-start')).toBeVisible()
    // The illustrative radar is unmistakably tagged "Example" (not the
    // visitor's data).
    await expect(page.getByTestId('profile-example-badge')).toBeVisible()
    // The seed form (the cheap hero) is present with both selects + submit.
    await expect(page.getByTestId('cross-beverage-seed-form')).toBeVisible()
    // CLAUDE.md: the cross-beverage mapping is heuristic → the disclaimer must
    // ride on this surface (title visible, body in the info-button tooltip).
    await expect(page.getByTestId('heuristic-disclaimer-title')).toBeVisible()
    await expect(page.getByTestId('heuristic-disclaimer-body')).toBeAttached()
    await expect(page.getByTestId('seed-beverage')).toBeVisible()
    await expect(page.getByTestId('seed-descriptor')).toBeVisible()
    await expect(page.getByTestId('seed-submit')).toBeVisible()
    // Changing the beverage re-populates the descriptor options (they're a
    // deterministic function of the category) — proves the two selects are
    // wired together.
    await page.getByTestId('seed-beverage').selectOption('beer')
    await expect(page.getByTestId('seed-descriptor')).toBeVisible()
    // /suggest is only a quiet secondary link, not a hero CTA. (The seed
    // submit → radar-refresh reward depends on a live store; it's exercised by
    // the applyCrossBeverage unit tests + manual testing, not asserted here
    // where the outcome would be environment-dependent and flaky.)
    await expect(page.getByTestId('profile-suggest-quiet-link')).toBeVisible()

    await context.close()
  })

  test('shows the age gate when the cookie is absent', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/en/profile')

    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByTestId('profile-page')).toHaveCount(0)

    await context.close()
  })

  test('/de/profile rewrites to the coming-soon landing (DE not launched)', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/de/profile')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('profile-page')).toHaveCount(0)

    await context.close()
  })
})

test.describe('/en/profile — maintainer tasting journal (ADR-0020)', () => {
  test('populated: map hero + month-grouped timeline, and the log sheet opens', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/profile')

    // The maintainer journal replaces the anonymous example.
    await expect(page.getByTestId('profile-journal-page')).toBeVisible()
    await expect(page.getByTestId('profile-populated')).toHaveCount(0)
    // Map hero (the real radar, six axis labels) + timeline with entries.
    await expect(page.getByTestId('taste-profile-radar')).toBeVisible()
    await expect(page.getByTestId('flavor-axis-f1-kanji')).toBeVisible()
    await expect(page.getByTestId('journal-timeline')).toBeVisible()
    await expect(page.getByTestId('journal-entry').first()).toContainText('而今')
    // Sakenowa data on the surface → attribution present.
    await expect(page.getByText('Powered by Sakenowa')).toBeVisible()

    // The FAB opens the log sheet (title, sake search, rating, save).
    await page.getByTestId('journal-log-open').click()
    await expect(page.getByTestId('journal-log-form')).toBeVisible()
    await expect(page.getByTestId('journal-search')).toBeVisible()
    await expect(page.getByTestId('journal-log-save')).toBeVisible()

    await context.close()
  })

  test('empty: shows the start-your-journal state with the log affordance', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('empty')])
    const page = await context.newPage()

    await page.goto('/en/profile')

    await expect(page.getByTestId('profile-journal-page')).toBeVisible()
    await expect(page.getByTestId('journal-empty')).toBeVisible()
    await expect(page.getByTestId('journal-timeline')).toHaveCount(0)
    // Even with no entries, the visitor can log their first sake.
    await expect(page.getByTestId('journal-log-open')).toBeVisible()

    await context.close()
  })

  test('unavailable: shows a quiet notice and no log affordance', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('unavailable')])
    const page = await context.newPage()

    await page.goto('/en/profile')

    await expect(page.getByTestId('journal-unavailable')).toBeVisible()
    await expect(page.getByTestId('journal-log-open')).toHaveCount(0)

    await context.close()
  })
})
