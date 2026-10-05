/**
 * E2E coverage for /[locale]/home — §3 Home, the app's front door.
 *
 * §3 is three things stacked: the greeting, the action tiles, and then either
 * what you have been drinking (screenshot 04) or an explanation of what this
 * is for (screenshot 05). Recent tastings come from the journal, which is
 * maintainer-only until the local-first rewrite (ADR-0020), so the
 * `yawaragi_journal_stub` cookie drives both — it also stands in for the
 * maintainer check, so these specs need no Clerk session and no Upstash.
 */
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

const CONSENT_COOKIE = {
  name: 'yawaragi_consent',
  value: JSON.stringify({ version: 1, analytics: false, marketing: false }),
  url: BASE_URL,
}

const journalStub = (mode: 'populated' | 'empty') => ({
  name: 'yawaragi_journal_stub',
  value: mode,
  url: BASE_URL,
})

test.describe('/en/home — §3 Home', () => {
  test('greets you and offers the one thing you can start', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/home')

    await expect(page.getByTestId('home-page')).toBeVisible()
    // 和らぎ above the greeting — the product's name in Japanese, preserved
    // verbatim in every locale because it is data, not copy.
    const greeting = page.getByTestId('home-greeting')
    await expect(greeting).toContainText('和らぎ')
    // The greeting itself is one of four bands, never empty: the heading is
    // the screen's title, and a blank one is a 34px hole.
    await expect(page.getByTestId('home-greeting-text')).not.toHaveText('')

    await page.getByTestId('home-tile-scan').click()
    await expect(page).toHaveURL(/\/en\/scan$/)

    // §3's second tile: typing the name is the other way to start.
    await page.goto('/en/home')
    await page.getByTestId('home-tile-type-it').click()
    await expect(page).toHaveURL(/\/en\/search$/)

    await context.close()
  })

  test('with nothing tasted, it explains what the app is for', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('empty')])
    const page = await context.newPage()

    await page.goto('/en/home')

    // Screenshot 05. Three steps, and §3 puts the cross-beverage cold start
    // directly below — the same component §12 renders, so the chip list and
    // the mandatory disclaimer live in one place.
    await expect(page.getByTestId('home-first-run')).toBeVisible()
    for (const step of ['scan', 'learn', 'palate'] as const) {
      await expect(page.getByTestId(`home-first-run-step-${step}`)).toBeVisible()
    }
    await expect(page.getByTestId('palate-cold-start')).toBeVisible()
    await expect(page.getByTestId('heuristic-disclaimer-title')).toBeVisible()

    // One way to the camera, not two: the card's own "Scan a label" is the
    // call to action here, so the tile row above it would only repeat it.
    await expect(page.getByTestId('home-first-run-cta')).toHaveAttribute('href', '/en/scan')
    await expect(page.getByTestId('home-action-tiles')).toHaveCount(0)
    await expect(page.getByTestId('heuristic-disclaimer-body')).toBeAttached()

    // The first-run copy must not promise the save that does not exist yet.
    // §3's own line is "tap a star, and it's in your journal. No account
    // needed" — §5's star row is Phase 2 and ADR-0020 holds the journal to
    // maintainers, so that sentence would be wrong twice over. Matched on the
    // promise rather than the word "star", which is also inside "Start".
    const firstRun = page.getByTestId('home-first-run')
    await expect(firstRun).not.toContainText('tap a star')
    await expect(firstRun).not.toContainText('in your journal')

    // And nothing claiming tastings the visitor does not have.
    await expect(page.getByTestId('home-recent-tastings')).toHaveCount(0)
    await expect(page.getByTestId('home-palate-strip')).toHaveCount(0)

    await context.close()
  })

  test('with tastings, it shows the recent ones and what they add up to', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/home')

    // Screenshot 04. Three cards, newest first, each a door to its bottle
    // page — and an "All {n}" link into §11, which is the complete list.
    const recent = page.getByTestId('home-recent-tastings')
    await expect(recent).toBeVisible()
    await expect(page.getByTestId('home-recent-entry')).toHaveCount(3)
    await expect(page.getByTestId('home-recent-link-1')).toHaveAttribute('href', '/en/sake/1')
    await expect(page.getByTestId('home-recent-all')).toContainText('3')

    // The palate strip restates §12's own title, computed the same way, so
    // Home and the Palate tab cannot disagree about what the palate leans.
    const strip = page.getByTestId('home-palate-strip')
    await expect(strip).toBeVisible()
    await expect(strip).toHaveAttribute('href', '/en/profile')
    const stripText = (await strip.innerText()).toLowerCase()
    await page.goto('/en/profile')
    const palateTitle = (await page.getByTestId('palate-title').innerText()).toLowerCase()
    expect(stripText).toContain(palateTitle)

    await context.close()
  })

  test('the first-run card is gone once there is something to show', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE, journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/home')

    // Both screens on one page would be the app introducing itself to someone
    // already using it.
    await expect(page.getByTestId('home-first-run')).toHaveCount(0)
    await expect(page.getByTestId('palate-cold-start')).toHaveCount(0)

    await context.close()
  })

  test('shows the age gate when the cookie is absent — the screen names sakes', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([journalStub('populated')])
    const page = await context.newPage()

    await page.goto('/en/home')

    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByTestId('home-page')).toHaveCount(0)

    await context.close()
  })

  test('/de/home rewrites to the coming-soon landing (DE not launched)', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/de/home')

    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('home-page')).toHaveCount(0)

    await context.close()
  })
})
