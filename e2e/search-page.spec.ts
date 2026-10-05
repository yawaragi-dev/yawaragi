// E2E for §8 Search ("Type it") — `/[locale]/search`.
//
// Split by whether the case needs the mirror, and every path runs in one
// environment or the other:
//
// - **Always**: the age gate, the autofocused empty field, the too-short
//   query, and the `/scan` entry — none of them reads a row.
// - **`!dbUp` skip**: anything that navigates with `?q=`, because that reads
//   the mirror. Locally these run; on CI, which has no `DATABASE_URL`, they
//   skip. Same discipline as `scan-page.spec.ts`.
// - **`dbUp` skip** — the inverse, and the only spec that WANTS no database:
//   "says the catalogue is unreachable". It runs on CI and skips locally.
//
// That last one exists because CI caught a missing guard here: the clear-field
// case was the one `?q=` navigation not marked DB-bound, and without
// `DATABASE_URL` the page 500d rather than degrading.
import { expect, test } from '@playwright/test'
import { BASE_URL } from './_base-url'
import { findAnyBrandId } from './_db-fixtures'

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

let dbUp = false

test.beforeAll(async () => {
  dbUp = (await findAnyBrandId()) !== null
})

async function searchPage(browser: import('@playwright/test').Browser, locale = 'en-US') {
  const context = await browser.newContext({ locale })
  await context.addCookies([AGE_GATE_COOKIE, CONSENT_COOKIE])
  return { context, page: await context.newPage() }
}

test.describe('§8 search', () => {
  test('is gated — no 18+ cookie, no brand data (JMStV)', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    // `/search` is absent from `UNGATED_LOCALE_PATHS`, which is
    // deny-by-default, so the proxy rewrites to the landing gate. A brand-new
    // route that shows catalogue data is exactly what gets forgotten, so this
    // is pinned rather than assumed.
    await page.goto('/en/search?q=%E7%94%B7%E5%B1%B1')

    await expect(page.getByTestId('age-gate')).toBeVisible()
    await expect(page.getByTestId('search-page')).toHaveCount(0)
    await expect(page.getByTestId('search-results')).toHaveCount(0)

    await context.close()
  })

  test('opens focused on the field, with no query and no promises', async ({ browser }) => {
    const { context, page } = await searchPage(browser)

    await page.goto('/en/search')

    await expect(page.getByTestId('search-page')).toBeVisible()
    // §8: "autofocus". An HTML attribute, not an effect — so it holds before
    // hydration would have run (playbook check 14).
    await expect(page.getByTestId('search-input')).toBeFocused()
    // §8's own empty state is "Recently tasted", which needs a journal this
    // visitor does not have (ADR-0020). It says what the field reads instead
    // of promising a list that would always be blank.
    await expect(page.getByTestId('search-empty')).toBeVisible()
    await expect(page.getByTestId('search-results')).toHaveCount(0)

    await context.close()
  })

  test('finds a sake by typing its name, and the row opens its bottle page', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(!dbUp, 'Sakenowa mirror not populated — DB-bound spec')
    const { context, page } = await searchPage(browser)

    // Typed, submitted with Enter, and read back off the URL — the whole point
    // of the GET form is that this works with no client JavaScript at all.
    await page.goto('/en/search')
    await page.getByTestId('search-input').fill('yama')
    await page.getByTestId('search-input').press('Enter')

    await expect(page).toHaveURL(/\/en\/search\?q=yama$/)
    await expect(page.getByTestId('search-count')).toBeVisible()

    // Reported on Firefox as "my cursor disappears". `autofocus` focuses the
    // element but says nothing about the caret, and Firefox parks it at offset
    // 0 — so the caret sat at the far left behind the search icon, and typing
    // `45` after submitting `yama` produced `45yama`. The field now claims
    // focus only while it is empty.
    await expect(page.getByTestId('search-input')).not.toBeFocused()
    const rows = page.getByTestId('search-result-row')
    expect(await rows.count()).toBeGreaterThan(0)

    // §8: "Tap → result card". Ours is the bottle page, where §6's rows go too.
    await rows.first().click()
    await expect(page).toHaveURL(/\/en\/sake\/\d+$/)

    await context.close()
  })

  test('asks for one more letter rather than matching a third of the catalogue', async ({
    browser,
  }) => {
    const { context, page } = await searchPage(browser)

    // One Latin letter is not a query — "a" appears in most romaji names. One
    // kanji is, which the unit tests cover; this pins the visible half.
    await page.goto('/en/search?q=a')

    await expect(page.getByTestId('search-too-short')).toBeVisible()
    await expect(page.getByTestId('search-results')).toHaveCount(0)

    // "One more letter" is an instruction to keep typing, so the caret is
    // already back in the field — after the letter, not before it, or the
    // next keystroke would make "ba" out of "a" + "b".
    const field = page.getByTestId('search-input')
    await expect(field).toBeFocused()
    await page.keyboard.type('b')
    await expect(field).toHaveValue('ab')

    await context.close()
  })

  test('a bottle name finds its sake, instead of nothing at all', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(!dbUp, 'Sakenowa mirror not populated — DB-bound spec')
    const { context, page } = await searchPage(browser)

    // The reported dead end. Sakenowa's unit is the LINE — 獺祭 is one row —
    // while the bottle in the visitor's hand says "Dassai 23", where 23 is the
    // polishing ratio. No row will ever carry it, so the query is retried
    // without the parts of a label that are not a name.
    await page.goto('/en/search?q=dassai%2023')

    await expect(page.getByTestId('search-no-match')).toHaveCount(0)
    const rows = page.getByTestId('search-result-row')
    expect(await rows.count()).toBeGreaterThan(0)
    await expect(rows.first()).toContainText('獺祭')

    // Never silent: a substitution the visitor cannot see would leave them
    // believing the catalogue holds a row for the exact bottle they typed.
    const note = page.getByTestId('search-searched-instead')
    await expect(note).toBeVisible()
    await expect(note).toContainText('dassai 23')
    await expect(note).toContainText('dassai')

    await context.close()
  })

  test('narrowing only rescues a query that could be rescued', async ({ browser }, testInfo) => {
    testInfo.skip(!dbUp, 'Sakenowa mirror not populated — DB-bound spec')
    const { context, page } = await searchPage(browser)

    // A number alongside a name that is genuinely absent still ends in the
    // empty state — the fallback must not manufacture results by widening
    // until something matches.
    await page.goto('/en/search?q=zzzqqqnotasake%2045')

    await expect(page.getByTestId('search-no-match')).toBeVisible()
    await expect(page.getByTestId('search-searched-instead')).toHaveCount(0)

    await context.close()
  })

  test('a query with no matches is not a dead end', async ({ browser }, testInfo) => {
    testInfo.skip(!dbUp, 'Sakenowa mirror not populated — DB-bound spec')
    const { context, page } = await searchPage(browser)

    await page.goto('/en/search?q=zzzqqqnotasake')

    await expect(page.getByTestId('search-no-match')).toBeVisible()
    // #162: every empty branch offers somewhere to go. Here it is the other
    // way to identify a bottle.
    await expect(page.getByTestId('search-no-match-scan')).toBeVisible()
    await page.getByTestId('search-no-match-scan').click()
    await expect(page).toHaveURL(/\/en\/scan$/)

    await context.close()
  })

  test('clearing returns to the empty field, keeping the screen', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(!dbUp, 'Sakenowa mirror not populated — DB-bound spec')
    const { context, page } = await searchPage(browser)

    // DB-bound because the ✕ only renders with a query, and a query reads the
    // mirror. This case is how CI found the missing guard: it was the one
    // `?q=` navigation not marked DB-bound, so on a runner with no
    // `DATABASE_URL` the page 500d instead of rendering.
    await page.goto('/en/search?q=yama')
    await page.getByTestId('search-clear').click()

    await expect(page).toHaveURL(/\/en\/search$/)
    await expect(page.getByTestId('search-empty')).toBeVisible()

    await context.close()
  })

  test('is reachable from the scan screen, which is what §8 is for', async ({ browser }) => {
    const { context, page } = await searchPage(browser)

    // §4 puts "Type it" beside the shutter. A desktop has no viewfinder and
    // goes straight to the "add a photo" panel, which carries the same link —
    // where a visitor whose label will not read is standing.
    await page.goto('/en/scan')
    await page.getByTestId('scan-camera-fallback-type-it').click()

    await expect(page).toHaveURL(/\/en\/search$/)
    await expect(page.getByTestId('search-input')).toBeFocused()

    await context.close()
  })

  test('renders Sakenowa attribution beside the rows (ADR-0014)', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(!dbUp, 'Sakenowa mirror not populated — DB-bound spec')
    const { context, page } = await searchPage(browser)

    await page.goto('/en/search?q=yama')

    // Every row is a Sakenowa brand row, and the licence does not accept
    // footer-only credit.
    const attribution = page.getByTestId('sakenowa-attribution-inline')
    await expect(attribution).toBeVisible()
    await expect(attribution).toContainText('Powered by Sakenowa')
    // The kanji, ids and brewery names ARE canonical `sakenowa`, so no badge.
    await expect(page.getByTestId('provenance-badge')).toHaveCount(0)
    // The romaji is not. Sakenowa publishes Japanese only; `name_romaji` is a
    // Hepburn reading generated by Haiku at ingest, which ADR-0005 classes
    // `llm_inferred` — the bottle page badges it, and this list showed it bare
    // twenty rows at a time until §16's disclosure was added. The caveat text
    // must be IN the DOM, not only inside the sheet, or assistive tech loses
    // it until someone taps.
    const caveat = page.getByTestId('info-sheet-search-romaji-caveat')
    await expect(caveat).toBeVisible()
    const trigger = page.getByTestId('info-sheet-search-romaji-trigger')
    await expect(trigger).toHaveAttribute(
      'aria-describedby',
      await caveat.evaluate((el) => el.id),
    )

    await trigger.click()
    const panel = page.getByTestId('info-sheet-search-romaji-panel')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('AI model')

    await context.close()
  })

  test('says the catalogue is unreachable rather than "nothing matches"', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(dbUp, 'Needs a run with no reachable mirror — the inverse of the DB-bound specs')
    const { context, page } = await searchPage(browser)

    // The one spec that WANTS no database. `searchCatalogue` turns a mirror
    // failure into `unavailable`, and the page says whose fault it is — saying
    // "nothing in the catalogue matches" would be a lie, and the one a visitor
    // acts on by retyping. The field, this copy and the camera bridge all work
    // without the mirror, which is why this surface degrades where `/sake/*`
    // legitimately does not.
    await page.goto('/en/search?q=yama')

    await expect(page.getByTestId('search-page')).toBeVisible()
    await expect(page.getByTestId('search-unavailable')).toBeVisible()
    await expect(page.getByTestId('search-no-match')).toHaveCount(0)
    await expect(page.getByTestId('search-input')).toBeVisible()
    await expect(page.getByTestId('search-unavailable-scan')).toBeVisible()

    await context.close()
  })

  test('/de/search is rewritten to coming-soon (ADR-0008)', async ({ browser }) => {
    const { context, page } = await searchPage(browser, 'de-DE')

    await page.goto('/de/search')

    // Gated path + non-launched locale, so the proxy serves `(site)`'s
    // coming-soon. `site-footer` names which one, the way #312's spec does.
    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('search-page')).toHaveCount(0)
    await expect(page.getByTestId('site-footer')).toBeVisible()

    await context.close()
  })
})
