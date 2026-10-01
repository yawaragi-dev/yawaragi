// E2E matrix for the /[locale]/scan result branches (issue #109 PR B).
//
// Each branch is driven by injecting a deterministic extraction into the
// `e2e-stub` VisionProvider via the `yawaragi_e2e_vision` cookie (a
// base64-encoded {name_ja, brewery_ja, confidence}). The real Sakenowa
// lookup then resolves that extraction to the branch under test, so the
// UI is exercised end-to-end without burning Anthropic credit.
//
// DB-bound: the lookup needs a populated Sakenowa mirror. Specs that need
// specific catalogue shapes (ambiguous brewery, unique brand, mono-brand
// brewery) resolve a live fixture via `_db-fixtures` and skip when the
// mirror lacks a qualifying row — the same skip discipline as
// `scan-page.spec.ts`. CI without `DATABASE_URL` skips the whole file.
//
// German parity: `/de/scan` renders coming-soon until DE joins
// LAUNCHED_LOCALES (ADR-0008), so the DE scan form cannot be driven
// pre-launch. The DE contract is the coming-soon guard below plus the
// EN/DE message-parity unit audit (`pnpm i18n:audit`); each EN branch's
// copy has a matching DE key that flips live the day DE launches.
import { expect, test, type Browser } from '@playwright/test'
import { BASE_URL } from './_base-url'
import {
  findAmbiguousBreweryFixture,
  findAnyBrandId,
  findMatchedNoChartFixture,
  findMonoBrandBreweryFixture,
  findScanS1FixtureBrandId,
  findUniqueBrandFixture,
} from './_db-fixtures'

const AGE_GATE_COOKIE = {
  name: 'yawaragi_age_gate',
  value: JSON.stringify({ v: 1, ts: Date.now() }),
  url: BASE_URL,
}

const FIXTURE_IMAGE = 'e2e/fixtures/dassai-label.jpg'

interface Injection {
  name_ja: string
  brewery_ja: string
  confidence: number
}

// Mirror of the stub's `yawaragi_e2e_vision` contract: base64 JSON so the
// kanji payload stays ASCII-safe in the cookie value.
function injectionCookie(payload: Injection) {
  return {
    name: 'yawaragi_e2e_vision',
    value: Buffer.from(JSON.stringify(payload)).toString('base64'),
    url: BASE_URL,
  }
}

async function scanPageWith(
  browser: Browser,
  cookies: { name: string; value: string; url: string }[],
  locale = 'en-US',
) {
  const context = await browser.newContext({ locale })
  await context.addCookies([AGE_GATE_COOKIE, ...cookies])
  const page = await context.newPage()
  return { context, page }
}

// `dbReady`: the default Dassai stub extraction resolves in this mirror
// (needed by branches that drive the default matched flow). `dbUp`: any
// catalogue row exists (needed by branches that inject their own
// extraction and only require the lookup to run against real data).
let dbReady = false
let dbUp = false

test.beforeAll(async () => {
  dbReady = (await findScanS1FixtureBrandId()) !== null
  dbUp = (await findAnyBrandId()) !== null
})

test.describe('scan result branches (#109 PR B)', () => {
  test('confirm-tier match renders the in-place result card (auto/confirm share the card)', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(!dbReady, 'Sakenowa mirror not available — DB-bound spec')
    // Confidence 0.70 lands in the `confirm` tier. Post-ADR-0015 the
    // confirm and auto tiers render the SAME rich result card; the tier
    // survives only as the confidence % on the provenance badge.
    const { context, page } = await scanPageWith(browser, [
      injectionCookie({ name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.7 }),
    ])
    await page.goto('/en/scan')
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)

    await expect(page.getByTestId('scan-result-card')).toBeVisible()
    await expect(page.getByTestId('scan-result-name-kanji')).toContainText('獺祭')
    // The confidence badge surfaces the tier: 70%.
    await expect(
      page.getByTestId('scan-result-card').getByTestId('provenance-badge-confidence'),
    ).toContainText('70%')
    expect(page.url()).toMatch(/\/en\/scan$/)
    await context.close()
  })

  test('a match replaces the entry pickers with one "Scan again" that still rescans', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(!dbReady, 'Sakenowa mirror not available — DB-bound spec')
    // The camera is how a visitor with an empty screen starts. Once the card
    // is up it is noise above the answer — the card's own row is the way back
    // to it. This pins the swap AND that the replacement still works, so
    // hiding the camera cannot strand a visitor on a wrong match.
    const { context, page } = await scanPageWith(browser, [
      injectionCookie({ name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.95 }),
    ])
    await page.goto('/en/scan')
    await expect(page.getByTestId('scan-camera')).toBeVisible()

    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)
    await expect(page.getByTestId('scan-result-card')).toBeVisible()

    await expect(page.getByTestId('scan-camera')).toHaveCount(0)
    const rescan = page.getByTestId('scan-result-match-rescan')
    await expect(rescan).toBeVisible()

    // Rescan into the retry tier: the card goes, the retry copy arrives,
    // and that state brings its own rescan rather than the camera's shutter.
    await context.addCookies([
      injectionCookie({ name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.3 }),
    ])
    await rescan.click()
    // §4's model: a rescan RETURNS TO THE CAMERA. It used to open the OS photo
    // library, because there was no camera screen to return to. Asserted here
    // because it is the half of the rescan contract that has no other home —
    // the tap is observable, but "and then the viewfinder is back" is not,
    // unless something says so.
    await expect(page.getByTestId('scan-camera')).toBeVisible()
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)
    await expect(page.getByTestId('scan-result-low-confidence')).toBeVisible()
    await expect(page.getByTestId('scan-result-retry-rescan')).toBeVisible()
    await context.close()
  })

  test('the recent-scans consensus card carries its own rescan, so hiding the camera is safe', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(!dbUp, 'Sakenowa mirror not available — DB-bound spec')
    const brandId = await findAnyBrandId()
    if (brandId === null) return

    // The fifth state `hasResult` hides the camera for, and the only one
    // whose rendering had no coverage at all. It needs two things at once: a
    // retry-tier extraction (confidence < 0.60, so no lookup runs) AND a
    // per-tab history with a strict majority. Seeding `sessionStorage`
    // directly beats scanning three times — `getConsensusFromHistory` reads
    // exactly this key, and two identical entries are 2 of 2, a majority.
    const { context, page } = await scanPageWith(browser, [
      injectionCookie({ name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.3 }),
    ])
    const entry = {
      brandId,
      sakeHref: `/en/sake/${brandId}`,
      nameKanji: '獺祭',
      nameRomaji: 'Dassai',
      tMs: Date.now(),
    }
    await page.addInitScript(
      ([key, value]) => window.sessionStorage.setItem(key, value),
      ['yawaragi_scan_history', JSON.stringify([entry, { ...entry, tMs: Date.now() + 1 }])],
    )

    await page.goto('/en/scan')
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)

    await expect(page.getByTestId('scan-result-consensus')).toBeVisible()
    await expect(page.getByTestId('scan-result-consensus-kanji')).toContainText('獺祭')
    // The point of the test: the camera has stepped aside, and this state still has
    // both a way forward (accept) and a way back to the camera (rescan).
    await expect(page.getByTestId('scan-camera')).toHaveCount(0)
    await expect(page.getByTestId('scan-result-consensus-accept')).toBeVisible()
    const rescan = page.getByTestId('scan-result-consensus-rescan')
    await expect(rescan).toBeVisible()

    // §4's model: a rescan RETURNS TO THE CAMERA. It used to open the OS photo
    // library, because there was no camera screen to return to — the entry
    // affordance was two text buttons. Asserted on this branch because it is
    // the one of the five that runs without the Dassai-under-Asahi fixture,
    // and "and then the viewfinder is back" has no other home: the tap is
    // observable, the thing it reveals is not unless something says so.
    await rescan.click()
    await expect(page.getByTestId('scan-camera')).toBeVisible()
    await expect(page.getByTestId('scan-result-consensus')).toHaveCount(0)
    await context.close()
  })

  test('retry (low confidence) offers a rescan that resolves to a match', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(!dbReady, 'Sakenowa mirror not available — DB-bound spec')
    // Confidence 0.30 → retry tier → low_confidence, short-circuiting the
    // lookup. The discovery-framed retry copy + rescan button render.
    const { context, page } = await scanPageWith(browser, [
      injectionCookie({ name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.3 }),
    ])
    await page.goto('/en/scan')
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)

    await expect(page.getByTestId('scan-result-low-confidence')).toBeVisible()
    await expect(page.getByTestId('scan-result-retry-rescan')).toBeVisible()
    // The camera steps aside once the result owns the rescan: two
    // ways to re-pick a photo stacked above the answer is what the
    // maintainer caught on this exact screen.
    await expect(page.getByTestId('scan-camera')).toHaveCount(0)

    // Rescan: swap the injection to a confident Dassai and re-pick. The
    // retry state is replaced by the in-place result card.
    await context.addCookies([
      injectionCookie({ name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.95 }),
    ])
    await page.getByTestId('scan-result-retry-rescan').click()
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)
    await expect(page.getByTestId('scan-result-card')).toBeVisible()
    await context.close()
  })

  test('no-match renders the enriched extraction with a provenance badge', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(!dbUp, 'Sakenowa mirror not populated — DB-bound spec')
    // Garbage kanji that no catalogue row matches → no_match. The
    // enriched branch shows WHAT we read (kanji + brewery) with an
    // llm_extracted provenance badge, the "not in catalogue yet" note,
    // and both onward affordances (rescan + explore).
    const { context, page } = await scanPageWith(browser, [
      injectionCookie({
        name_ja: '架空銘柄零一',
        brewery_ja: '架空酒造零',
        confidence: 0.95,
      }),
    ])
    await page.goto('/en/scan')
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)

    await expect(page.getByTestId('scan-result-no-match')).toBeVisible()
    await expect(page.getByTestId('scan-result-no-match-name-ja')).toContainText('架空銘柄零一')
    await expect(page.getByTestId('scan-result-no-match-brewery-ja')).toContainText('架空酒造零')
    // llm_extracted provenance badge sits on the extracted-name baseline.
    await expect(
      page
        .getByTestId('scan-result-no-match')
        .locator('[data-testid="provenance-badge"][data-kind="llmExtracted"]'),
    ).toBeVisible()
    // Dead-end recovery: rescan + explore bridge both present, and the
    // camera is gone because this state carries its own rescan.
    await expect(page.getByTestId('scan-result-no-match-rescan')).toBeVisible()
    await expect(page.getByTestId('scan-result-no-match-explore')).toBeVisible()
    await expect(page.getByTestId('scan-camera')).toHaveCount(0)
    await context.close()
  })

  test('recognised-but-no-chart shows the "flavor profile coming soon" affordance with onward paths', async ({
    browser,
  }, testInfo) => {
    const fixture = await findMatchedNoChartFixture()
    testInfo.skip(
      fixture === null,
      'No catalogue-unique brand without a flavor chart in the mirror — DB-bound spec',
    )
    if (!fixture) return
    // ADR-0016 / #202: the brand resolves to a clean `matched` but Sakenowa
    // has no flavor_charts row, so the card renders the coming-soon panel
    // instead of the flavor grid — and must NOT read as a dead end.
    const { context, page } = await scanPageWith(browser, [
      injectionCookie({
        name_ja: fixture.nameJa,
        brewery_ja: fixture.breweryJa,
        confidence: 0.95,
      }),
    ])
    await page.goto('/en/scan')
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)

    await expect(page.getByTestId('scan-result-card')).toBeVisible()
    // The recognised brand is shown…
    await expect(page.getByTestId('scan-result-name-kanji')).toContainText(fixture.nameJa)
    // …the flavor grid is absent…
    await expect(page.getByTestId('brand-flavor-chart')).toHaveCount(0)
    // …and the reassuring coming-soon panel takes its place.
    await expect(page.getByTestId('flavor-coming-soon')).toBeVisible()
    // The panel is not a dead end: the on-topic "Full bottle page"
    // deep-dive link for THIS sake stays reachable. (We deliberately do NOT
    // bridge to /suggest here — a cold general recommender would divert the
    // visitor away from the sake they just scanned.)
    await expect(page.getByTestId('scan-result-open-detail')).toHaveAttribute(
      'href',
      new RegExp(`/en/sake/${fixture.brandId}\\?from=scan$`),
    )
    await context.close()
  })

  test('ambiguous disambiguation — tapping a candidate lands on the right sake page', async ({
    browser,
  }, testInfo) => {
    const fixture = await findAmbiguousBreweryFixture()
    testInfo.skip(
      fixture === null,
      'No brewery with 2+ distinct-kanji brands in the mirror — DB-bound spec',
    )
    if (!fixture) return
    const [firstBrandId] = fixture.brandIds
    // Garbage name + a real multi-brand brewery kanji → the brewery-only
    // pass returns the ambiguous candidate list.
    const { context, page } = await scanPageWith(browser, [
      injectionCookie({
        name_ja: '架空銘柄零一',
        brewery_ja: fixture.breweryJa,
        confidence: 0.95,
      }),
    ])
    await page.goto('/en/scan')
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)

    await expect(page.getByTestId('scan-result-ambiguous')).toBeVisible()
    await expect(page.getByTestId('scan-result-ambiguous-list')).toBeVisible()
    const candidate = page.getByTestId(`scan-result-ambiguous-candidate-${firstBrandId}`)
    await expect(candidate).toBeVisible()
    // This state is in `hasResult`, so the camera is hidden — which is
    // only safe because the candidate list carries its own rescan.
    await expect(page.getByTestId('scan-camera')).toHaveCount(0)
    await expect(page.getByTestId('scan-result-ambiguous-rescan')).toBeVisible()

    await candidate.click()
    await page.waitForURL(new RegExp(`/en/sake/${firstBrandId}\\?from=scan$`))
    await expect(page.getByTestId('sake-brand-page')).toBeVisible()
    // Arrived via scan → the "Not this one? Scan again" affordance shows.
    await expect(page.getByTestId('scan-return-hint')).toBeVisible()
    await context.close()
  })

  test('matched_brand_only surfaces the brewery divergence with an explicit-tap link', async ({
    browser,
  }, testInfo) => {
    const fixture = await findUniqueBrandFixture()
    testInfo.skip(fixture === null, 'No catalogue-unique brand kanji in the mirror — DB-bound spec')
    if (!fixture) return
    // Unique brand kanji + garbage brewery → first pass misses, brand-only
    // resolves to one row → matched_brand_only + brewery divergence.
    const { context, page } = await scanPageWith(browser, [
      injectionCookie({
        name_ja: fixture.nameJa,
        brewery_ja: '架空酒造零',
        confidence: 0.95,
      }),
    ])
    await page.goto('/en/scan')
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)

    await expect(page.getByTestId('scan-result-matched-brand-only')).toBeVisible()
    await expect(page.getByTestId('scan-result-brewery-divergence')).toBeVisible()
    const link = page.getByTestId('scan-result-matched-brand-only-link')
    await expect(link).toHaveAttribute('href', new RegExp(`/en/sake/${fixture.brandId}\\?from=scan$`))
    await context.close()
  })

  test('matched_brewery_only surfaces the brand divergence with an explicit-tap link', async ({
    browser,
  }, testInfo) => {
    const fixture = await findMonoBrandBreweryFixture()
    testInfo.skip(fixture === null, 'No mono-brand brewery in the mirror — DB-bound spec')
    if (!fixture) return
    // Garbage brand + a real mono-brand brewery → first pass + brand-only
    // miss, brewery-only finds the single brand → matched_brewery_only.
    const { context, page } = await scanPageWith(browser, [
      injectionCookie({
        name_ja: '架空銘柄零一',
        brewery_ja: fixture.breweryJa,
        confidence: 0.95,
      }),
    ])
    await page.goto('/en/scan')
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)

    await expect(page.getByTestId('scan-result-matched-brewery-only')).toBeVisible()
    await expect(page.getByTestId('scan-result-brand-divergence')).toBeVisible()
    const link = page.getByTestId('scan-result-matched-brewery-only-link')
    await expect(link).toHaveAttribute('href', new RegExp(`/en/sake/${fixture.brandId}\\?from=scan$`))
    await context.close()
  })

  test('"Not this one?" affordance shows only when arriving via scan', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(!dbReady, 'Sakenowa mirror not available — DB-bound spec')
    const brandId = await findScanS1FixtureBrandId()
    if (brandId === null) return

    // Arrive via scan: match → tap "Full bottle page" → the hint renders.
    const { context, page } = await scanPageWith(browser, [
      injectionCookie({ name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.95 }),
    ])
    await page.goto('/en/scan')
    await page.getByTestId('scan-file-input').setInputFiles(FIXTURE_IMAGE)
    await expect(page.getByTestId('scan-result-card')).toBeVisible()
    await page.getByTestId('scan-result-open-detail').click()
    await page.waitForURL(new RegExp(`/en/sake/${brandId}\\?from=scan$`))
    await expect(page.getByTestId('scan-return-hint')).toBeVisible()
    await expect(page.getByTestId('scan-return-hint-link')).toHaveAttribute(
      'href',
      /\/en\/scan$/,
    )
    // The bottle slot shows the photo the visitor just scanned, carried over
    // in memory by the client-side navigation.
    await expect(page.getByTestId('bottle-scanned-photo')).toHaveAttribute('src', /^blob:/)

    // Leaving the scanned bottle for any other page in the same tab drops
    // both: the old sessionStorage flag stayed set for the whole tab and put
    // "Not the bottle you scanned?" on every bottle page after one scan.
    await page.goto(`/en/sake/${brandId}`)
    await expect(page.getByTestId('sake-brand-page')).toBeVisible()
    await expect(page.getByTestId('scan-return-hint')).toHaveCount(0)
    await expect(page.getByTestId('bottle-scanned-photo')).toHaveCount(0)
    await context.close()

    // Direct navigation (fresh tab): the hint stays hidden.
    const direct = await scanPageWith(browser, [])
    await direct.page.goto(`/en/sake/${brandId}`)
    await expect(direct.page.getByTestId('sake-brand-page')).toBeVisible()
    await expect(direct.page.getByTestId('scan-return-hint')).toHaveCount(0)
    await direct.context.close()
  })

  test('/de/scan stays coming-soon even with an injection cookie (DE gated, ADR-0008)', async ({
    browser,
  }) => {
    // DE parity contract pre-launch: the injection cookie must not punch
    // through the locale gate. The DE branch copy is covered by the
    // EN/DE message-parity audit and flips live when DE launches.
    const { context, page } = await scanPageWith(
      browser,
      [injectionCookie({ name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.95 })],
      'de-DE',
    )
    await page.goto('/de/scan')
    await expect(page.getByTestId('coming-soon')).toBeVisible()
    await expect(page.getByTestId('scan-entry-page')).toHaveCount(0)
    await context.close()
  })
})
