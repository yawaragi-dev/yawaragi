/**
 * E2E coverage for /[locale]/collection — §11 Collection, the Journal tab.
 *
 * §11 is three tabs (Journal · Cellar · Wishlist) and only Journal ships:
 * Cellar and Wishlist have no tables behind them and ADR-0011 blocks the
 * migration while Production and Preview share one Supabase project, so the
 * segmented control is not rendered at all rather than offering two options
 * that lead nowhere (#162).
 *
 * The journal is maintainer-only until the local-first rewrite (ADR-0020), so
 * everyone else gets `<TabPlaceholder />`. The `yawaragi_journal_stub` cookie
 * drives the states AND stands in for the maintainer check, so these specs
 * need no Clerk session and no Upstash.
 */
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

// Dismiss the cookie banner (fixed to the viewport bottom; can intercept
// clicks on anything near it).
const CONSENT_COOKIE = {
  name: 'yawaragi_consent',
  value: JSON.stringify({ version: 1, analytics: false, marketing: false }),
  url: BASE_URL,
}

const journalStub = (mode: 'populated' | 'empty' | 'unavailable') => ({
  name: 'yawaragi_journal_stub',
  value: mode,
  url: BASE_URL,
})

test.describe('/en/collection — §11 Journal (ADR-0020, maintainer-only)', () => {
  test('lists the tastings newest first, each a door to its bottle page', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/collection')

    await expect(page.getByTestId('collection-page')).toBeVisible()
    await expect(page.getByTestId('journal-list')).toBeVisible()
    await expect(page.getByTestId('journal-entry').first()).toContainText('而今')
    // Newest first, which is what makes the list readable without a date
    // filter — the stub's two entries are a month apart.
    const entries = page.getByTestId('journal-entry')
    await expect(entries.first()).toContainText('而今')
    await expect(entries.last()).toContainText('田酒')

    // §11's radar is gone from here, and that is the port's point: the Palate
    // IS the derived six-axis view, and drawing it above the journal too meant
    // a maintainer saw a radar here and never reached §12 at all.
    await expect(page.getByTestId('taste-profile-radar')).toHaveCount(0)

    // Each row is a door. The bottle page is where the rest of what we know
    // about a sake lives, and the journal is the one surface that knows the
    // visitor has met it.
    await expect(page.getByTestId('journal-entry-link-1')).toHaveAttribute(
      'href',
      '/en/sake/1',
    )

    // §11's "Full notes" chip on a row with detailed notes, and only there. It
    // opens §10's sheet for that tasting.
    await expect(page.getByTestId('journal-full-notes-s1')).toBeVisible()
    await expect(page.getByTestId('journal-full-notes-s2')).toHaveCount(0)
    await page.getByTestId('journal-full-notes-s1').click()
    await expect(page.getByTestId('detailed-notes-progress')).toHaveText('2 of 5 parts filled')
    await page.keyboard.press('Escape')

    // ADR-0014: Sakenowa brand names on the surface → attribution present.
    await expect(page.getByText('Powered by Sakenowa')).toBeVisible()

    // No floating "Log a sake" button any more: a tasting is rated where the
    // bottle is — the scan result or the bottle page — and rule 11 keeps the
    // bottom edge for the tab bar.
    await expect(page.getByTestId('journal-log-open')).toHaveCount(0)

    await context.close()
  })

  test('empty: says the journal starts with one star, and where to find one', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('empty')])
    const page = await context.newPage()

    await page.goto('/en/collection')

    await expect(page.getByTestId('collection-page')).toBeVisible()
    await expect(page.getByTestId('journal-empty')).toBeVisible()
    await expect(page.getByTestId('journal-list')).toHaveCount(0)
    // §11: "Your journal starts with one star" + "Scan a label". The star is
    // on the scan result and the bottle page, so the empty state points at
    // both ways to reach a bottle.
    await expect(page.getByTestId('journal-empty')).toContainText('Your journal starts with one star')
    await expect(page.getByTestId('journal-empty-scan')).toHaveAttribute('href', '/en/scan')
    await expect(page.getByTestId('journal-empty-type-it')).toHaveAttribute('href', '/en/search')

    await context.close()
  })

  test('unavailable: shows a quiet notice', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('unavailable')])
    const page = await context.newPage()

    await page.goto('/en/collection')

    await expect(page.getByTestId('journal-unavailable')).toBeVisible()
    await expect(page.getByTestId('journal-empty-scan')).toHaveCount(0)

    await context.close()
  })
})

test.describe('/en/collection — which segment opens (design v1.5, #369)', () => {
  test('opens on the segment the visitor was last on; a link that names one wins', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/collection?tab=cellar')
    await expect(page.getByTestId('collection-segment-cellar')).toHaveAttribute('aria-current', 'page')
    // Remembered in a session cookie, written once the page has hydrated.
    await expect
      .poll(async () => (await context.cookies()).find((c) => c.name === 'yawaragi_collection_tab')?.value)
      .toBe('cellar')

    // The tab bar's plain /collection now opens the Cellar...
    await page.goto('/en/collection')
    await expect(page.getByTestId('collection-segment-cellar')).toHaveAttribute('aria-current', 'page')
    // ...and a tap on Journal names it, so it wins and is remembered.
    await page.getByTestId('collection-segment-journal').click()
    await expect(page).toHaveURL(/\/en\/collection\?tab=journal$/)
    await expect(page.getByTestId('collection-segment-journal')).toHaveAttribute('aria-current', 'page')

    await context.close()
  })
})

test.describe('/en/collection?tab=cellar — §11 Cellar (ADR-0024)', () => {
  test('lists the bottles, the ones to finish first, each with its two actions', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/collection')
    // Journal is the default segment; Cellar is a link away, and a URL.
    await expect(page.getByTestId('collection-segment-journal')).toHaveAttribute('aria-current', 'page')
    await page.getByTestId('collection-segment-cellar').click()
    await expect(page).toHaveURL(/\/en\/collection\?tab=cellar$/)
    await expect(page.getByTestId('collection-segment-cellar')).toHaveAttribute('aria-current', 'page')
    // No Wishlist: it is not built, and an option to nowhere is #162's dead end.
    await expect(page.getByTestId('collection-segment-wishlist')).toHaveCount(0)

    // Bottles, not rows: 1 + 2 + 1.
    await expect(page.getByTestId('cellar-summary')).toHaveText('4 bottles · 2 open')

    // §11: "drink soon" sorts first and says so; sealed bottles last.
    const rows = page.getByTestId('cellar-row')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('而今')
    await expect(rows.nth(0).getByTestId('cellar-state')).toHaveText(
      'Open 12 days — best finished this week',
    )
    await expect(rows.nth(1).getByTestId('cellar-state')).toHaveText('Open 2 days · fridge')
    await expect(rows.nth(2)).toContainText('× 2')
    await expect(rows.nth(2).getByTestId('cellar-state')).toHaveText(
      'Unopened · keeps for months, cool and dark',
    )

    // Open: Pour & rate (to the bottle page with the panel open) · Finished.
    // Sealed: Open a bottle · Remove — one bottle at a time, so on a row of
    // two it says so.
    await expect(page.getByTestId('cellar-pour-1')).toHaveAttribute('href', '/en/sake/1?rate=1')
    await expect(page.getByTestId('cellar-finish-1')).toBeVisible()
    await expect(page.getByTestId('cellar-open-3')).toBeVisible()
    await expect(page.getByTestId('cellar-remove-3')).toHaveText('Remove one')

    await expect(page.getByText('Powered by Sakenowa')).toBeVisible()
    await context.close()
  })

  test('an empty cellar says what it is for', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('empty')])
    const page = await context.newPage()

    await page.goto('/en/collection?tab=cellar')
    await expect(page.getByTestId('cellar-empty')).toContainText('Nothing in the cellar')
    await expect(page.getByTestId('cellar-empty')).toContainText('Add to cellar')

    await context.close()
  })
})

test.describe('/en/collection — everyone else', () => {
  test('still says what will be here, rather than showing an empty journal', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/collection')

    // ADR-0020 keeps the journal maintainer-only, so a visitor has nothing of
    // their own to list. #162's rule holds: navigable and honest about what it
    // is, rather than an empty state implying they could fill it.
    await expect(page.getByTestId('tab-placeholder')).toBeVisible()
    await expect(page.getByTestId('journal-list')).toHaveCount(0)

    await context.close()
  })

  test('shows the age gate when the cookie is absent — the list names sakes', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/collection')

    // The proxy's deny-by-default list is what enforces this, and it matters
    // more here than on a placeholder: the list names sakes and shows ratings.
    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByTestId('collection-page')).toHaveCount(0)

    await context.close()
  })
})
