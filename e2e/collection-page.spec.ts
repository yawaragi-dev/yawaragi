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
  test('lists the tastings newest first, each a door to the page of what was tasted', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/collection')

    await expect(page.getByTestId('collection-page')).toBeVisible()
    await expect(page.getByTestId('journal-list')).toBeVisible()
    await expect(page.getByTestId('journal-entry').first()).toContainText('新十津川')
    // Newest first, which is what makes the list readable without a date
    // filter — the stub's two entries are a month apart.
    const entries = page.getByTestId('journal-entry')
    await expect(entries.first()).toContainText('新十津川')
    await expect(entries.last()).toContainText('田酒')

    // §11's radar is gone from here, and that is the port's point: the Palate
    // IS the derived six-axis view, and drawing it above the journal too meant
    // a maintainer saw a radar here and never reached §12 at all.
    await expect(page.getByTestId('taste-profile-radar')).toHaveCount(0)

    // Each row is a door. The bottle page is where the rest of what we know
    // about a sake lives, and the journal is the one surface that knows the
    // visitor has met it.
    await expect(page.getByTestId('journal-entry-link-2')).toHaveAttribute(
      'href',
      '/en/sake/2',
    )
    // v1.6 §11: a tasting logged against a bottling leads with the bottling's
    // name, the sake's kanji under it, and opens the bottling's page.
    const bottlingRow = page.getByTestId('journal-entry-bottling-link-stub-bottling')
    await expect(bottlingRow.getByTestId('journal-entry-bottling')).toHaveText('Shintotsukawa Nama 2025')
    await expect(bottlingRow).toContainText('新十津川')
    await expect(bottlingRow).toHaveAttribute('href', '/en/bottling/stub-bottling')

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

  test('detailed notes changed with no connection keep what was picked and ask before closing', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/collection')
    await page.getByTestId('journal-full-notes-s1').click()
    await expect(page.getByTestId('detailed-notes-sheet')).toBeVisible()

    // Design v1.9 S6 (written): the pick stays, the rating panel's line sits
    // under the title, Done becomes Try again.
    await context.setOffline(true)
    await page.getByTestId('detailed-notes-toggle-palate').click()
    await page.getByTestId('detailed-notes-scale-body-3').click()
    await expect(page.getByTestId('detailed-notes-not-saved')).toHaveText(
      'No connection, so this isn’t in your journal yet.',
    )
    await expect(page.getByTestId('detailed-notes-scale-body-3')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('detailed-notes-done')).toHaveCount(0)
    await page.getByTestId('detailed-notes-try-again').click()
    await expect(page.getByTestId('detailed-notes-not-saved')).toContainText('Still no connection.')

    // Closing asks first, inside the sheet; Stay keeps it open.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('detailed-notes-leave-confirm')).toContainText('Leave without saving your notes?')
    await page.getByTestId('detailed-notes-stay').click()
    await expect(page.getByTestId('detailed-notes-sheet')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('detailed-notes-leave').click()
    await expect(page.getByTestId('detailed-notes-sheet')).toHaveCount(0)
    await expect(page.getByTestId('app-error')).toHaveCount(0)

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

    // Bottles, not rows: 1 + 1 + 2 + 1, and 1 of a bottling.
    await expect(page.getByTestId('cellar-summary')).toHaveText('6 bottles · 2 open')

    // §11: "drink soon" sorts first and says so; then the other open bottle;
    // then the sealed ones, newest first.
    const rows = page.getByTestId('cellar-row')
    await expect(rows).toHaveCount(5)
    await expect(rows.nth(0)).toContainText('新十津川')
    await expect(rows.nth(0).getByTestId('cellar-state')).toHaveText(
      'Open 12 days — best finished this week',
    )
    await expect(rows.nth(1).getByTestId('cellar-state')).toHaveText('Open 2 days · fridge')

    // v1.6.1 §11: a bottling's bottle has a row of its own, beside its sake's
    // (新十津川, above), and leads with the bottling's name, the sake's kanji
    // under it. v1.6.2: the count carries the size, and a nama bottle says so.
    const bottling = rows.nth(2)
    await expect(bottling.getByTestId('cellar-row-name')).toHaveText('Shintotsukawa Nama 2025')
    await expect(bottling).toContainText('新十津川')
    await expect(bottling.getByTestId('cellar-row-count')).toHaveText('× 1 · 720 ml')
    await expect(bottling.getByTestId('cellar-state')).toHaveText('Unopened · nama, keep cold')
    await expect(page.getByTestId('cellar-open-x:stub-bottling|720|n')).toBeVisible()

    // v1.6.2 (screenshot 67): the same sake in two sizes is two rows.
    await expect(rows.nth(3)).toContainText('Denshu')
    await expect(rows.nth(3).getByTestId('cellar-row-count')).toHaveText('× 2 · 720 ml')
    await expect(rows.nth(3).getByTestId('cellar-state')).toHaveText(
      'Unopened · keeps for months, cool and dark',
    )
    await expect(rows.nth(4)).toContainText('Denshu')
    await expect(rows.nth(4).getByTestId('cellar-row-count')).toHaveText('× 1 · 1800 ml')

    // Open: Pour & rate (to the bottle page with the panel open) · Finished.
    // Sealed: Open a bottle · Remove — one bottle at a time, so on a row of
    // two it says so.
    await expect(page.getByTestId('cellar-pour-1|720|s|open')).toHaveAttribute('href', '/en/sake/1?rate=1')
    await expect(page.getByTestId('cellar-finish-1|720|s|open')).toBeVisible()
    await expect(page.getByTestId('cellar-open-3|720|s')).toBeVisible()
    await expect(page.getByTestId('cellar-remove-3|720|s')).toHaveText('Remove one')
    await expect(page.getByTestId('cellar-remove-3|1800|n')).toHaveText('Remove')

    // "Edit" opens the sheet on the row's own count, size and nama.
    await page.getByTestId('cellar-edit-3|1800|n').click()
    const sheet = page.getByTestId('cellar-sheet')
    await expect(sheet).toContainText('Edit bottles')
    await expect(sheet).toContainText('Denshu')
    await expect(sheet.getByTestId('cellar-sheet-count')).toHaveText('1')
    await expect(sheet.getByRole('radio', { name: '1800 ml' })).toBeChecked()
    await expect(sheet.getByRole('switch', { name: /Nama/ })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)

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
    // No bottle has left the cellar, so there is no "Bottles you've had" yet.
    await expect(page.getByTestId('bottles-had-row')).toHaveCount(0)

    await context.close()
  })

  test('"Bottles you\'ve had" lists the bottles that left the cellar, newest first, each one removable', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('populated')])
    const page = await context.newPage()

    // v1.10 AB6 (131): the last row under the cellar.
    await page.goto('/en/collection?tab=cellar')
    await page.getByTestId('bottles-had-row').click()
    await expect(page).toHaveURL(/\/en\/collection\/had$/)

    // (132): name, kanji, "Added · Finished/Removed"; no total anywhere.
    const rows = page.getByTestId('bottles-had-bottle')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).getByTestId('bottles-had-name')).toHaveText('Nabeshima')
    await expect(rows.nth(0).getByTestId('bottles-had-dates')).toHaveText('Added Jun 5 · Removed Jun 15')
    await expect(rows.nth(1).getByTestId('bottles-had-name')).toHaveText('Denshu')
    await expect(rows.nth(1).getByTestId('bottles-had-dates')).toHaveText('Added May 21 · Finished Jun 10')
    await expect(rows.nth(1).getByRole('link')).toHaveAttribute('href', '/en/sake/3')

    // The row's ⋯ asks before it takes the bottle off for good; "Keep it" closes.
    await rows.nth(0).getByTestId('bottles-had-more').click()
    await expect(page.getByTestId('bottles-had-confirm')).toContainText('Take Nabeshima off this list?')
    await page.getByTestId('bottles-had-keep').click()
    await expect(page.getByTestId('bottles-had-confirm')).toHaveCount(0)

    // The stub draws the screen, it does not fake a store: the real action
    // refuses, and the row says so instead of vanishing.
    await rows.nth(0).getByTestId('bottles-had-more').click()
    await page.getByTestId('bottles-had-remove').click()
    await expect(page.getByTestId('bottles-had-confirm').getByRole('alert')).toHaveText(
      'Couldn’t remove that just now — try again.',
    )
    await expect(rows).toHaveCount(2)

    await expect(page.getByText('Powered by Sakenowa')).toBeVisible()
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
