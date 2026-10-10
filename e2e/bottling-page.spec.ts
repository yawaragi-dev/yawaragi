// E2E coverage for /[locale]/bottling/[id] — §9a, a bottling the visitor
// added themselves (design v1.6 / v1.6.1, ADR-0025) — and for the two places
// on the sake page that lead to it.
//
// The bottling page is the visitor's own record and renders without the
// catalogue, so its scenarios run with no DATABASE_URL: the non-production
// `yawaragi_journal_stub=populated` cookie supplies one bottling
// (`STUB_EXPRESSIONS`) with one tasting. The sake-page scenarios need a real
// brand and skip without the mirror.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'
import { findAnyBrandId } from './_db-fixtures'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}
const stub = (value: string) => ({ name: 'yawaragi_journal_stub', value, url: BASE_URL })

let anyBrandId: number | null = null
test.beforeAll(async () => {
  anyBrandId = await findAnyBrandId()
})

test.describe('own bottling page', () => {
  test('shows a bottling you added: its name, the sake it belongs to, and that only you see it', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stub('populated')])
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/en/bottling/stub-bottling')

    await expect(page.getByTestId('bottling-name')).toHaveText('Jikon Nama 2025')
    // "A bottling of {line} ›" leads back to the sake's page.
    const lineLink = page.getByTestId('bottling-line-link')
    await expect(lineLink).toContainText('A bottling of Jikon')
    await expect(lineLink.locator('[lang="ja"]')).toHaveText('而今')
    await expect(lineLink).toHaveAttribute('href', '/en/sake/1')
    await expect(page.getByTestId('bottling-own-tag')).toHaveText('Your own entry')
    await expect(page.getByTestId('bottling-own-line')).toHaveText(
      'Your own bottling of Jikon, not in the catalogue yet. Only you can see it.',
    )
    // The sake's name is Sakenowa's, so the credit stays above the fold.
    const credit = page.getByTestId('bottling-identity').getByRole('link', { name: /Sakenowa/ })
    await expect(credit).toBeVisible()
    expect((await credit.boundingBox())!.y).toBeLessThan(844)

    // §9a.3: the sake page's action row, without "Similar" — that is about the line.
    await expect(page.getByTestId('bottle-rate-open')).toContainText('Rate a new tasting')
    await expect(page.getByTestId('similar-sakes-link')).toHaveCount(0)

    // §9a.4: this bottling's tastings only.
    const history = page.getByTestId('bottle-history')
    await expect(history).toContainText('You and this bottling')
    await expect(history.getByTestId('bottle-history-entry')).toHaveCount(1)

    await context.close()
  })

  test('fences what is true of the whole sake into one block, with its caveat', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stub('populated')])
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/en/bottling/stub-bottling')

    const block = page.getByTestId('bottling-line-block')
    await expect(block.getByRole('heading', { name: /About the Jikon line/ })).toBeVisible()
    // §16: the caveat is on screen, and the info button is described by it.
    const caveat = block.getByText('Measured for the whole line; bottlings vary.')
    await expect(caveat).toBeVisible()
    const info = block.getByRole('button', { name: 'About this measurement' })
    const describedBy = await info.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(page.locator(`[id="${describedBy}"]`)).toContainText('Measured for the whole line')

    await info.click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toContainText('Sakenowa charts a sake — the Jikon line')
    await expect(sheet).toContainText('about this bottling only')

    await context.close()
  })

  test('is not there for anyone else', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    // Someone who can keep a journal, but has no such bottling...
    await context.addCookies([AGE_GATE_COOKIE, stub('empty')])
    const page = await context.newPage()
    expect((await page.goto('/en/bottling/stub-bottling'))!.status()).toBe(404)
    // ...and someone who cannot keep one at all.
    await context.clearCookies()
    await context.addCookies([AGE_GATE_COOKIE])
    expect((await page.goto('/en/bottling/stub-bottling'))!.status()).toBe(404)

    await context.close()
  })
})

test.describe('bottlings on the sake page', () => {
  test('with none yet, "Add your bottling" stands alone and asks only for a name', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(anyBrandId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stub('empty')])
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/en/sake/${anyBrandId}`)

    const section = page.getByTestId('bottle-bottlings')
    // v1.6.1, screenshot 63: no heading, no list.
    await expect(section.getByRole('heading')).toHaveCount(0)
    await expect(section).not.toContainText('Your bottlings')
    const open = page.getByTestId('add-bottling-open')
    await expect(open).toContainText('Add your bottling')
    await expect(open).toContainText('Just the name — the rest can wait')

    await open.click()
    const name = page.getByTestId('add-bottling-name')
    await expect(name).toBeFocused()
    // Prefilled with the sake's name, as the page's title shows it.
    await expect(name).toHaveValue((await page.locator('h1').first().innerText()).trim())
    await expect(page.getByTestId('add-bottling-form')).toContainText('Only you can see it.')

    await page.getByTestId('add-bottling-cancel').click()
    await expect(page.getByTestId('add-bottling-form')).toHaveCount(0)
    await expect(page.getByTestId('add-bottling-open')).toBeVisible()

    await context.close()
  })

  test('someone who cannot keep a journal is offered no bottlings', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(anyBrandId === null, 'DB-bound spec')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE])
    const page = await context.newPage()
    await page.goto(`/en/sake/${anyBrandId}`)
    await expect(page.getByTestId('sake-brand-page')).toBeVisible()
    await expect(page.getByTestId('bottle-bottlings')).toHaveCount(0)

    await context.close()
  })

  test('your own bottlings of a sake are listed on its page, each leading to its own', async ({
    browser,
  }, testInfo) => {
    // The stub's bottling belongs to brand 1.
    testInfo.skip(anyBrandId !== 1, 'DB-bound spec: needs brand 1 in the mirror')

    const context = await browser.newContext({ locale: 'en-US' })
    await context.addCookies([AGE_GATE_COOKIE, stub('populated')])
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/en/sake/1')

    const section = page.getByTestId('bottle-bottlings')
    await expect(section.getByRole('heading', { name: 'Your bottlings' })).toBeVisible()
    await expect(section).toContainText('1 bottling')
    const row = page.getByTestId('own-bottling-link-stub-bottling')
    await expect(row).toContainText('Jikon Nama 2025')
    await expect(row).toContainText('Your own entry')
    await expect(row).toContainText('Tasted')
    // The tasting logged against it leads with the bottling's name (v1.6 §9).
    await expect(page.getByTestId('bottle-history-bottling')).toHaveText('Jikon Nama 2025')
    // "Add your bottling" stays under the list.
    await expect(page.getByTestId('add-bottling-open')).toBeVisible()

    await row.click()
    await expect(page).toHaveURL(/\/en\/bottling\/stub-bottling$/)

    await context.close()
  })
})
