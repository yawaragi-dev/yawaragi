// E2E coverage for "Learn" — /[locale]/learn and its entries (design v1.6 §18,
// ADR-0026): the public reference on what a label and a bottle mean.
//
// No DATABASE_URL needed anywhere: the pages are hand-written content with no
// catalogue data, which is also why they sit outside the 18+ gate.
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

test.describe('Learn', () => {
  test('is readable without confirming your age, and shows no sake data', async ({ browser }) => {
    // No age-gate cookie at all.
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([CONSENT_COOKIE])
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })

    expect((await page.goto('/en/learn'))!.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible()
    await expect(page.getByTestId('learn-index')).toContainText(
      'What the words on a label mean. Written by hand, with sources.',
    )
    // "Start here", then the groups.
    await expect(page.getByTestId('learn-start-here')).toContainText('How to read a label')
    for (const group of ['Grades', 'Styles and processes', 'Rice', 'Serving and tasting']) {
      await expect(page.getByRole('heading', { level: 2, name: group })).toBeVisible()
    }
    // Hand-written pages credit no catalogue (rule 15), and are not the app:
    // no tab bar.
    await expect(page.getByText('Powered by Sakenowa')).toHaveCount(0)
    await expect(page.getByTestId('tab-bar')).toHaveCount(0)
    // Nothing scrolls sideways at phone width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

    // The product itself is still behind the gate: "Open the app" meets it.
    await page.getByTestId('learn-open-app').click()
    await expect(page.getByTestId('age-gate')).toBeVisible()

    await context.close()
  })

  test('an entry gives the term in Japanese, a short answer, the facts, and where they come from', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([CONSENT_COOKIE])
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/en/learn')
    await page.getByTestId('learn-row-yeast-starters').click()
    await expect(page).toHaveURL(/\/en\/learn\/yeast-starters$/)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Starters: sokujō, kimoto, yamahai')
    const kanji = page.getByTestId('learn-entry-kanji')
    await expect(kanji).toHaveText('酒母')
    await expect(kanji).toHaveAttribute('lang', 'ja')
    await expect(page.getByTestId('learn-entry-answer')).toContainText('lactic acid')

    // The three methods, each with its kanji beside it.
    const facts = page.getByTestId('learn-entry-facts')
    for (const [term, written] of [
      ['Sokujō', '速醸'],
      ['Kimoto', '生酛'],
      ['Yamahai', '山廃'],
    ] as const) {
      const row = facts.locator('div').filter({ has: page.getByText(term, { exact: true }) }).first()
      await expect(row).toContainText(written)
    }

    // Every entry names its sources, as links out, and when it was checked.
    const sources = page.getByTestId('learn-entry-sources')
    await expect(sources.getByRole('link').first()).toHaveAttribute('href', /^https:\/\//)
    await expect(sources.getByRole('link').first()).toHaveAttribute('rel', /noopener/)
    await expect(sources).toContainText('Checked against the sources on')

    // Related entries lead on; "All topics" leads back.
    await page.getByTestId('learn-entry-related').getByRole('link').first().click()
    await expect(page).toHaveURL(/\/en\/learn\/[a-z-]+$/)
    await page.getByTestId('learn-all-topics').click()
    await expect(page).toHaveURL(/\/en\/learn$/)

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await context.close()
  })

  test('every entry the index lists opens', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([CONSENT_COOKIE])
    const page = await context.newPage()
    await page.goto('/en/learn')
    const hrefs = await page
      .getByTestId('learn-index')
      .locator('a[href^="/en/learn/"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')!))
    expect(hrefs.length).toBeGreaterThanOrEqual(16)
    for (const href of hrefs) {
      expect((await page.goto(href))!.status(), href).toBe(200)
      await expect(page.getByTestId('learn-entry-sources')).toBeVisible()
    }
    // An entry that does not exist is a 404, not an empty page.
    expect((await page.goto('/en/learn/not-an-entry'))!.status()).toBe(404)
    await context.close()
  })

  test('stays behind the coming-soon page in German until the German site launches (ADR-0008)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addCookies([CONSENT_COOKIE])
    const page = await context.newPage()
    await page.goto('/de/learn/junmai')
    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('learn-entry')).toHaveCount(0)
    await context.close()
  })

  test('the six flavor words are the ones the charts use, each with its Japanese', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([CONSENT_COOKIE])
    const page = await context.newPage()
    await page.goto('/en/learn/flavor-words')

    await expect(page.getByTestId('learn-entry-answer')).toContainText('approximations of them, not translations')
    const facts = page.getByTestId('learn-entry-facts')
    for (const [word, written, reading] of [
      ['Floral', '華やか', 'hanayaka'],
      ['Mellow', '芳醇', 'hojun'],
      ['Rich', '重厚', 'juko'],
      ['Mild', '穏やか', 'odayaka'],
      ['Dry', 'ドライ', 'dry'],
      ['Light', '軽快', 'keikai'],
    ] as const) {
      const row = facts.locator('div').filter({ has: page.getByText(word, { exact: true }) }).first()
      await expect(row).toContainText(written)
      await expect(row).toContainText(reading)
    }
    // The trademark wording, and the source the six come from.
    await expect(page.getByTestId('learn-entry-detail')).toContainText('flavor chart (Sakenowa)')
    await expect(page.getByTestId('learn-entry-sources').getByRole('link')).toHaveAttribute(
      'href',
      'https://muro.sakenowa.com/sakenowa-data',
    )
    await context.close()
  })

  test('is one tap from Account, and from the landing page', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
    const page = await context.newPage()

    await page.goto('/en/account')
    const row = page.getByTestId('account-learn')
    await expect(page.getByTestId('account-group-learn')).toContainText('Learn')
    await expect(row).toContainText('What the words on a label mean')
    await row.click()
    await expect(page).toHaveURL(/\/en\/learn$/)

    await page.goto('/en')
    await page.getByTestId('footer-learn-link').click()
    await expect(page).toHaveURL(/\/en\/learn$/)
    await context.close()
  })
})
