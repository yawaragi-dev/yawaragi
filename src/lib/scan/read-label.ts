import 'server-only'

import type { Locale } from '@/i18n/routing'
import type { VisionProvider } from '@/lib/ai/vision/vision-provider'
import { debugAdd } from '@/lib/debug/debug-log'
import { isKanjiVariant } from '@/lib/sakenowa/kanji-variants'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'
import type { NearestBrand } from '@/lib/sakenowa/nearest-brands'
import type { ResolveScannedLabelResult, ScannedLabel } from '@/lib/sakenowa/resolve-scanned-label'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'
import type { EarlierScanRead } from '@/lib/schemas/earlier-scan-read'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import type { LabelScanExtraction, ScanBottleRead } from '@/lib/schemas/label-scan-extraction'
import { CONFIDENCE_AUTO_THRESHOLD } from './confidence-tier'
import { bottleExtraction, firstReadStands, landLabel, twoBottleReadsOf } from './read-kind'
import { bestRomaji, sakeHrefFor, sakeRefOf } from './sake-ref'
import { landedSakeOf, type ScanActionState, type ScanBottle, type ScanCandidate, type ScanReading } from './scan-action-state'

/**
 * Reading one label photo, from the vision models to the state the scan
 * screen renders: tier 1, tier 2 when tier 1's answer does not stand, the
 * catalogue lookup, the guesses beside the answer ("Did you mean", "Not
 * sure?", what both photos point at).
 *
 * Everything outside that — the form, the read cache, the rate limit, the
 * Langfuse span, the debug cookie, the visitor's own bottlings — is the
 * Server Action's (`scan-action.ts`). The models and the catalogue come in as
 * `ReadLabelDeps`, so this runs against fakes in a unit test and against the
 * registry and Postgres in the action.
 *
 * The photo goes to the vision providers only; nothing here keeps it.
 */

/** The catalogue reads a scan needs. In the action these are the Sakenowa mirror's. */
export interface LabelCatalogue {
  /** The guards and the lookup cascade (`resolveScannedLabel`). */
  resolve(label: LabelScanExtraction): Promise<ResolveScannedLabelResult>
  breweryOf(brandId: number): Promise<Brewery | null>
  flavorChartOf(brandId: number): Promise<FlavorChart | null>
  /** "Did you mean" / "Not sure?" (`findNearestBrands`); never throws. */
  nearest(read: { name: string; brewery: string }, options?: { exclude?: number }): Promise<NearestBrand[]>
  /** #408: what this read and the earlier photo's read point at together (`resolveWithEarlierRead`). */
  withEarlierRead(
    second: ScannedLabel,
    secondOwn: ResolveScannedLabelResult,
    first: ScannedLabel,
  ): Promise<{ sake: Brand } | null>
}

export interface ReadLabelDeps {
  /**
   * The tiers, built when first asked for — tier 2 is never built on a scan
   * tier 1 settles. Without a tier 2, tier 1's read is the answer.
   */
  tier1: () => VisionProvider
  tier2?: { provider: () => VisionProvider; name: string }
  catalogue: LabelCatalogue
}

export interface ReadLabelInput {
  image: Blob
  locale: Locale
  /** What the previous photo in this tab read (#408), or null on a first scan. */
  earlierRead: EarlierScanRead | null
}

/** What the action records on its Langfuse span: the cost signal of the two-tier rule. */
export interface ReadLabelTrace {
  /** Tier 1's outcome, or why it had none of its own. */
  tier1Status: ScanActionState['status'] | 'skipped_second_photo' | 'matched_brewery_not_printed'
  tier2Used: boolean
  /** For a photo of several bottles: what the bottles read said, or that it threw. */
  bottlesRead?: 'two_bottles' | 'shelf' | 'failed'
  /** Whether the earlier read was needed and gave a guess; absent on a first scan. */
  earlierRead?: 'not_needed' | 'guess' | 'no_guess'
}

export interface ReadLabelResult {
  state: ScanActionState
  trace: ReadLabelTrace
}

export async function readLabel(input: ReadLabelInput, deps: ReadLabelDeps): Promise<ReadLabelResult> {
  const { image, locale, earlierRead } = input
  const trace = await readWithTiers(image, locale, earlierRead !== null, deps)
  const bottles = await withTwoBottles(trace.state, image, locale, deps)
  const withGuesses = await withNearestCandidates(bottles.state, locale, deps.catalogue)
  const { state, earlierReadOutcome } = await withEarlierRead(withGuesses, earlierRead, locale, deps.catalogue)
  return {
    state,
    trace: {
      tier1Status: trace.tier1Status,
      tier2Used: trace.tier2Used,
      ...(bottles.asked ? { bottlesRead: bottles.asked } : {}),
      ...(earlierReadOutcome ? { earlierRead: earlierReadOutcome } : {}),
    },
  }
}

/**
 * Since #414 the scan runs one model (Sonnet 5.5) and no tier 2, so the read
 * below is tier 1's alone. The two-tier rule stays for a cheaper first model:
 *
 * The two-tier rule. Tier 1 is the cheap model, enough for clear bottles;
 * tier 2 is materially better at brush-style kanji on busy backgrounds, at
 * many times the cost. The examples below date from the Haiku 4.5 / Sonnet
 * 4.6 pair; the rule is unchanged, and lives in `firstReadStands`
 * (`read-kind.ts`), which the eval replays too. Tier 2 reads again on every
 * tier-1 outcome EXCEPT a clean first-pass `matched`:
 *
 *   - `no_match` / `low_confidence` / `extraction_failed`: no result at all.
 *   - `matched_brand_only` / `matched_brewery_only`: the divergence is a
 *     strong "the model misread at least one field" signal. Real bite
 *     (Kiku-Masamune, 2026-06-14): Haiku read the descriptor "JUNMAI TARU
 *     SAKE" as the brand and fabricated the brewery `菊宮`; a Latin variant
 *     matched a generic `junmai`-named brand with a diverged brewery. Sonnet
 *     on the same image reads `菊正宗` cleanly.
 *   - `ambiguous`: tier 1's read was field-swapped or under-specified (the
 *     same Kiku-Masamune photo: brand in brewery_ja, four 菊正宗 candidates).
 *     Genuine catalogue-side ambiguity still pays the retry without a better
 *     answer, but the field swap is the more common case.
 *   - `not_sake` / `not_one_bottle`: on the 118-photo eval tier 1 called two
 *     single bottles "several bottles" (one of them a sake); tier 2 made no
 *     such mistake.
 *
 * One exception to the `matched` rule: a match whose brewery the model says
 * is not printed in the photo. Brand and brewery then agree only because the
 * model supplied the brewery of the brand it read, so a misread brand passes
 * as an exact match. Real bite (Dewazakura Yukimegami, front, 2026-10-13):
 * tier 1 read the brush kanji as 獺祭 and added 旭酒造 in every fresh run, at
 * 0.80-0.92; tier 2 read 出羽桜 each time and was never asked.
 *
 * A photo that comes with an earlier read (#408) goes straight to tier 2. The
 * earlier photo did not settle on a sake, so the bottle is one the cheap
 * model has trouble with, and waiting for it first only adds its seconds.
 * Replayed on the 118-photo eval for every second photo of a bottle whose
 * first photo was not a sure match (240 pairs over three runs): 208 right by
 * tier 2 alone against 205 through both tiers, and a median of about 4 s
 * against 9 s.
 */
async function readWithTiers(
  image: Blob,
  locale: Locale,
  secondPhoto: boolean,
  deps: ReadLabelDeps,
): Promise<{ state: ScanActionState; tier1Status: ReadLabelTrace['tier1Status']; tier2Used: boolean }> {
  if (secondPhoto && deps.tier2) {
    const tier2 = await readOnce(deps.tier2.provider(), image, locale, deps.catalogue)
    return { state: tier2.state, tier1Status: 'skipped_second_photo', tier2Used: true }
  }

  const tier1 = await readOnce(deps.tier1(), image, locale, deps.catalogue)
  if (!deps.tier2 || firstReadStands(tier1.kind, tier1.breweryPrinted)) {
    // Recorded on the cheap path too — a retry RATE needs the denominator.
    return { state: tier1.state, tier1Status: tier1.state.status, tier2Used: false }
  }

  const tier1BreweryNotPrinted = tier1.kind === 'exact' && tier1.breweryPrinted === false
  debugAdd(
    'ScanAction',
    `tier-1 returned ${tier1.state.status} — retrying with tier-2 (${deps.tier2.name})`,
    { tier1Status: tier1.state.status, tier1BreweryNotPrinted },
    'warn',
  )
  const tier2 = await readOnce(deps.tier2.provider(), image, locale, deps.catalogue)
  return {
    state: tier2.state,
    // Which tier-1 outcome drives the retry is what says whether to tune the
    // prompt, the confidence thresholds, or the tier-1 model itself.
    tier1Status: tier1BreweryNotPrinted ? 'matched_brewery_not_printed' : tier1.state.status,
    tier2Used: true,
  }
}

/** One model's read of the photo: the state it renders, and where it landed for the two-tier rule. */
interface OneRead {
  state: ScanActionState
  /** The landing's kind (`read-kind.ts`), or `failed` when the read threw. */
  kind: string
  breweryPrinted: boolean | undefined
}

/**
 * Vision → land → render state, in one try/catch. A throw (an Anthropic
 * outage, schema-validation retries exhausted, a DB blip) lands as
 * `extraction_failed` with the debug trace intact, rather than a 500 whose
 * server-side trace never reaches the client.
 */
async function readOnce(
  provider: VisionProvider,
  image: Blob,
  locale: Locale,
  catalogue: LabelCatalogue,
): Promise<OneRead> {
  try {
    // The downscaled JPEG goes inline as base64 on /v1/messages; the
    // Anthropic Files API is forbidden (`pnpm anthropic-files:audit`). The
    // provider parses the model output through `LabelScanExtractionSchema`,
    // pinning `source` to `'llm_extracted'`.
    const extraction = await provider.extractLabel(image)
    const { kind, reading } = await readingOf(extraction, locale, catalogue)
    return { kind, breweryPrinted: extraction.brewery_printed, state: reading }
  } catch (err) {
    const name = err instanceof Error ? err.name : 'UnknownError'
    const message = err instanceof Error ? err.message : String(err)
    // `AI_NoObjectGeneratedError` fires when the AI SDK exhausts its
    // schema-validation retries — typically a non-sake image whose empty
    // fields our `min(1)` schema rejects. A healthy outcome, not a system
    // error, so it is a `warn`; real outages keep `error`.
    const isExpectedNoObject = name === 'AI_NoObjectGeneratedError'
    debugAdd(
      'ScanAction',
      `extraction threw: ${name}`,
      // The full message is for the debug overlay only; the state carries
      // the error name so the localized copy stays generic.
      { message: message.slice(0, 500) },
      isExpectedNoObject ? 'warn' : 'error',
    )
    return { kind: 'failed', breweryPrinted: undefined, state: { status: 'extraction_failed', reason: name } }
  }
}

/** One bottle's label → its reading, and where it landed for the two-tier rule. */
async function readingOf(
  extraction: LabelScanExtraction,
  locale: Locale,
  catalogue: LabelCatalogue,
): Promise<{ kind: string; reading: ScanReading }> {
  const landing = await landLabel(extraction, () => catalogue.resolve(extraction))
  switch (landing.kind) {
    case 'not_one_bottle':
      return { kind: landing.kind, reading: { status: 'not_one_bottle', extraction, subject: landing.subject } }
    case 'not_sake':
      return { kind: landing.kind, reading: { status: 'not_sake', extraction, drink: landing.drink } }
    // Nothing written on this side (design v1.7 G): there is no name to look
    // up, so the catalogue is not asked — the answer does not depend on it
    // being reachable.
    case 'no_text':
      return { kind: landing.kind, reading: { status: 'low_confidence', extraction } }
    default:
      return { kind: landing.kind, reading: await mapResolvedToState(landing, extraction, locale, catalogue) }
  }
}

/**
 * Design v1.7 §5a: a photo the label read called `several_bottles` is asked
 * once more, by tier 2, how many bottles stand in it and what each says. Two
 * become "Which bottle do you mean?"; three or more stay the shelf outcome,
 * as does a photo whose bottles read fails. A request of its own because
 * putting the bottles on the label read cost single-bottle reads (see
 * `SeveralBottlesReadSchema`); only these photos pay for it.
 */
async function withTwoBottles(
  state: ScanActionState,
  image: Blob,
  locale: Locale,
  deps: ReadLabelDeps,
): Promise<{ state: ScanActionState; asked?: ReadLabelTrace['bottlesRead'] }> {
  if (state.status !== 'not_one_bottle' || state.subject !== 'several_bottles') return { state }
  try {
    const read = await (deps.tier2?.provider ?? deps.tier1)().readBottles(image)
    const twoBottles = twoBottleReadsOf(read)
    if (!twoBottles) return { state, asked: 'shelf' }
    return { state: await readTwoBottles(state.extraction, twoBottles, locale, deps.catalogue), asked: 'two_bottles' }
  } catch (err) {
    debugAdd('ScanAction', 'reading the bottles threw; keeping the shelf outcome', {
      message: err instanceof Error ? err.message.slice(0, 300) : String(err),
    }, 'warn')
    return { state, asked: 'failed' }
  }
}

/**
 * Design v1.7 §5a (74): each of two bottles looked up on its own, with the
 * guesses its outcome shows. The same bottle twice — two of one sake, or two
 * reads of one name the catalogue lacks — leaves nothing to choose between,
 * so the answer is that bottle's reading alone.
 */
async function readTwoBottles(
  photo: LabelScanExtraction,
  reads: readonly ScanBottleRead[],
  locale: Locale,
  catalogue: LabelCatalogue,
): Promise<ScanActionState> {
  const bottles: ScanBottle[] = await Promise.all(
    reads.map(async (read) => {
      const { reading } = await readingOf(bottleExtraction(photo, read), locale, catalogue)
      return {
        position: read.position,
        breweryPrinted: read.brewery_printed === true,
        reading: await withNearestCandidates(reading, locale, catalogue),
      }
    }),
  )
  const [first, second] = bottles
  if (first && second && sameBottle(first.reading, second.reading)) {
    debugAdd('ScanAction', 'two bottles of one sake — answering with it', {})
    return first.reading
  }
  debugAdd('ScanAction', 'returning two_bottles', { bottles: bottles.map((b) => [b.position, b.reading.status]) })
  return { status: 'two_bottles', extraction: photo, bottles }
}

/** Two readings of one bottle: the same catalogue sake, or the same name and brewery where none was found. */
function sameBottle(a: ScanReading, b: ScanReading): boolean {
  const sakeA = landedSakeOf(a)
  const sakeB = landedSakeOf(b)
  if (sakeA || sakeB) return sakeA?.brandId === sakeB?.brandId
  if (!('extraction' in a) || !('extraction' in b)) return false
  return a.status === b.status && a.extraction.name_ja === b.extraction.name_ja && a.extraction.brewery_ja === b.extraction.brewery_ja
}

/**
 * Maps a `resolveScannedLabel` result onto the state the scan screen renders.
 * The matching decisions are already made; this is presentation shaping —
 * locale-aware hrefs, romaji, the brewery and flavor chart on an exact match
 * (the in-place result card, ADR-0015), and the kanji-variant display
 * preference.
 */
async function mapResolvedToState(
  resolved: ResolveScannedLabelResult,
  extraction: LabelScanExtraction,
  locale: Locale,
  catalogue: LabelCatalogue,
): Promise<ScanReading> {
  switch (resolved.kind) {
    case 'low_confidence':
      return { status: 'low_confidence', extraction }

    case 'exact': {
      const sakeHref = sakeHrefFor(resolved.sake.brandId, locale)
      // The brewery may be null if a race deleted it between queries; the
      // chart is null for the small tail of brands Sakenowa's
      // `/flavor-charts` omits. The UI tolerates both.
      const [brewery, flavorChart] = await Promise.all([
        catalogue.breweryOf(resolved.sake.brandId),
        catalogue.flavorChartOf(resolved.sake.brandId),
      ])
      debugAdd('ScanAction', 'returning matched', {
        brandId: resolved.sake.brandId,
        sakeHref,
        hasFlavorChart: flavorChart !== null,
      })
      return {
        status: 'matched',
        extraction,
        brandId: resolved.sake.brandId,
        sakeHref,
        sakeRomaji: bestRomaji(resolved.sake),
        breweryRomaji: brewery ? bestRomaji(brewery) : null,
        flavorChart,
        // Filled by `withNearestCandidates` for a best guess.
        otherCandidates: [],
      }
    }

    case 'matched_brand_only': {
      const sakeHref = sakeHrefFor(resolved.sake.brandId, locale)
      debugAdd('ScanAction', 'returning matched_brand_only — brewery divergence surfaced', {
        brandId: resolved.sake.brandId,
        sakeHref,
        extractedBrewery: resolved.breweryDivergence.extracted,
        storedBrewery: resolved.breweryDivergence.stored,
      })
      return {
        status: 'matched_brand_only',
        extraction,
        brandId: resolved.sake.brandId,
        sakeHref,
        breweryDivergence: {
          ...resolved.breweryDivergence,
          storedRomaji: bestRomaji(resolved.brewery),
          storedPrefecture: getPrefectureNames(resolved.brewery.areaId)?.nameEn ?? null,
        },
        sakeKanji: preferExtractedWhenVariant(extraction.name_ja, resolved.sake.nameKanji),
        sakeRomaji: bestRomaji(resolved.sake),
      }
    }

    case 'matched_brewery_only': {
      const sakeHref = sakeHrefFor(resolved.sake.brandId, locale)
      debugAdd('ScanAction', 'returning matched_brewery_only — brand divergence surfaced', {
        brandId: resolved.sake.brandId,
        sakeHref,
        extractedBrand: resolved.brandDivergence.extracted,
        storedBrand: resolved.brandDivergence.stored,
      })
      return {
        status: 'matched_brewery_only',
        extraction,
        brandId: resolved.sake.brandId,
        sakeHref,
        brandDivergence: {
          ...resolved.brandDivergence,
          storedRomaji: bestRomaji(resolved.sake),
        },
        breweryRomaji: bestRomaji(resolved.brewery),
      }
    }

    case 'ambiguous':
      debugAdd('ScanAction', 'returning ambiguous', {
        candidates: resolved.candidates.map((c) => c.sake.brandId),
      })
      return {
        status: 'ambiguous',
        extraction,
        candidates: resolved.candidates.map((c) => ambiguousCandidate(c, locale)),
      }

    case 'no_match':
      debugAdd('ScanAction', 'returning no_match', {
        attempted: { name_ja: extraction.name_ja, brewery_ja: extraction.brewery_ja },
      })
      // Filled by `withNearestCandidates` once the last tier has answered.
      return { status: 'no_match', extraction, candidates: [] }
  }
}

/**
 * Guesses for the answer the visitor will see: §5a "Did you mean" on a
 * `no_match`, and §5's "Not sure?" list under a Best-guess match (0.60–0.84,
 * the match itself left out). Applied once, after the last tier — a tier-1
 * `no_match` is always read again, and reading the catalogue for a result
 * that is thrown away is wasted work. A sure match asks nothing.
 */
async function withNearestCandidates<S extends ScanActionState>(
  state: S,
  locale: Locale,
  catalogue: LabelCatalogue,
): Promise<S> {
  const read = (extraction: LabelScanExtraction) => ({ name: extraction.name_ja, brewery: extraction.brewery_ja })
  const toCandidate = ({ row, reason, sameBrewery }: NearestBrand): ScanCandidate => ({
    ...sakeRefOf(
      row,
      // A placeholder brewery arrives with no names but its prefecture; `sakeRefOf`
      // keeps the prefecture and names no brewery.
      row.breweryKanji === null && row.areaId === null
        ? null
        : { nameKanji: row.breweryKanji ?? '', nameRomaji: row.breweryRomaji, areaId: row.areaId },
      locale,
    ),
    reason,
    sameBrewery,
  })

  if (state.status === 'no_match') {
    return { ...state, candidates: (await catalogue.nearest(read(state.extraction))).map(toCandidate) }
  }
  if (state.status === 'matched' && state.extraction.confidence < CONFIDENCE_AUTO_THRESHOLD) {
    const others = await catalogue.nearest(read(state.extraction), { exclude: state.brandId })
    return { ...state, otherCandidates: others.map(toCandidate) }
  }
  return state
}

/**
 * #408: a scan that did not land on one sake, looked at again with what the
 * visitor's previous photo read. The rules — this photo's own answer always
 * stands, the earlier read only fills a gap, and only for the same bottle —
 * live in `resolveWithEarlierRead`. Here the guess is attached BESIDE the
 * outcome, which is left exactly as it was: the two photos may be two
 * bottles, and then the outcome is the true answer and the guess is not.
 *
 * Never fails the scan: a lookup error here costs the guess, nothing else.
 */
async function withEarlierRead(
  state: ScanActionState,
  earlierRead: EarlierScanRead | null,
  locale: Locale,
  catalogue: LabelCatalogue,
): Promise<{ state: ScanActionState; earlierReadOutcome?: ReadLabelTrace['earlierRead'] }> {
  if (earlierRead === null) return { state }
  if (state.status !== 'no_match' && state.status !== 'ambiguous' && state.status !== 'low_confidence') {
    return { state, earlierReadOutcome: 'not_needed' }
  }
  let earlierReadOutcome: ReadLabelTrace['earlierRead']
  try {
    const own = await catalogue.resolve(state.extraction)
    const guess = await catalogue.withEarlierRead(state.extraction, own, earlierRead)
    earlierReadOutcome = guess ? 'guess' : 'no_guess'
    if (!guess) return { state, earlierReadOutcome }

    const brewery = await catalogue.breweryOf(guess.sake.brandId)
    return {
      earlierReadOutcome,
      state: {
        ...state,
        bothPhotos: sakeRefOf(guess.sake, brewery, locale),
      },
    }
  } catch (err) {
    debugAdd('ScanAction', 'combining with the earlier read threw; keeping this scan as it is', {
      message: err instanceof Error ? err.message.slice(0, 300) : String(err),
    }, 'warn')
    return { state, earlierReadOutcome }
  }
}

/** One row of the disambiguation list, its brewery and prefecture denormalised onto it. */
function ambiguousCandidate(c: { sake: Brand; brewery: Brewery }, locale: Locale) {
  return sakeRefOf(c.sake, c.brewery, locale)
}

/**
 * The brand kanji on the matched_brand_only card: the visitor's read when it
 * is a 旧/新 variant of the catalogue form (scanned `蔵王`, stored `藏王`), so
 * the card matches the bottle in hand; otherwise the catalogue form — which
 * also covers the field-swap rescue, where the read is the model's
 * single-character hallucination.
 */
function preferExtractedWhenVariant(extracted: string, canonical: string): string {
  return isKanjiVariant(extracted, canonical) ? extracted : canonical
}
