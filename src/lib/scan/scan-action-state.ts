import type { DebugEvent } from '@/lib/debug/debug-log'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import type { NearestReason } from '@/lib/sakenowa/nearest-brands'
import type { LabelScanExtraction, NonSakeDrink, ScanBottlePosition, ScanGrade } from '@/lib/schemas/label-scan-extraction'

/**
 * A catalogue sake as the scan screen names it: enough for a row (Latin name
 * over the kanji, brewery, prefecture) and the link to its page. Built in one
 * place, `sakeRefOf` (`sake-ref.ts`), wherever the scan points at a sake.
 */
export interface SakeRef {
  brandId: number
  sakeHref: string
  nameKanji: string
  nameRomaji: string | null
  breweryKanji: string | null
  breweryRomaji: string | null
  prefectureName: string | null
}

/**
 * A catalogue sake offered as a guess — §5a's "Did you mean" and §5's
 * Best-guess "Not sure?" list — from `nearest-brands.ts`, with why.
 */
export interface ScanCandidate extends SakeRef {
  reason: NearestReason
  /** The brewery is the one that was read, not a lookalike. */
  sameBrewery: boolean
}

/**
 * A sake the scan reached only with the help of the visitor's previous
 * photo (#408): a guess resting on two photos, shown beside this photo's
 * own outcome and never in place of it.
 */
export type BothPhotosGuess = SakeRef

/**
 * What one bottle read as: the catalogue's answer to one label, or why the
 * catalogue was not asked (not sake, not one bottle, nothing legible). A
 * photo of two bottles holds one of these per bottle.
 */
export type ScanReading =
  | {
      status: 'matched'
      extraction: LabelScanExtraction
      brandId: number
      sakeHref: string
      /**
       * Romaji / English transliteration of the matched brand and
       * brewery, surfaced alongside the kanji on the confirm-tier
       * card so non-Japanese-readers can still tell what they're
       * about to open. `null` when neither `Brand.nameRomaji` nor
       * Sakenowa's `Brand.name` is set (extremely rare — `name` is
       * required in the Brand schema). The action computes the
       * `nameRomaji ?? name` fallback once so the UI doesn't have
       * to.
       */
      sakeRomaji: string | null
      breweryRomaji: string | null
      /**
       * ADR-0015: the result card renders the six-axis flavor chart in
       * place on `/scan` (no more auto-navigate to `/sake/[brandId]`).
       * Populated by `lookupFlavorChart(brandId)` in the matched branch
       * of `scan-action`. `null` when the brand exists in the mirror but
       * has no `flavor_charts` row — rare enough to render the card
       * without the chart rather than fail the whole match.
       */
      flavorChart: FlavorChart | null
      /**
       * §5 Best guess (confidence 0.60–0.84): up to three other catalogue
       * sakes near the read, for the "Not sure?" row under the card. Never
       * the match itself. Empty for a sure match, which does not ask.
       */
      otherCandidates: readonly ScanCandidate[]
      /**
       * The visitor's own bottlings of this sake (ADR-0025), for "Is it one
       * of these bottlings?" under the card (design v1.6 §5, screenshot 54).
       * `fitsLabel` marks the one the label's product name or grade points
       * at, when exactly one does; it is listed first. Absent for a visitor
       * who keeps no journal, and when they have none of this line.
       */
      ownBottlings?: readonly {
        id: string
        name: string
        fitsLabel: boolean
        /** Its grade and style words, for the tags when it opens directly (v1.7, 85). */
        grade?: ScanGrade
        styles?: readonly string[]
      }[]
    }
  /**
   * Phase 3 / #123: the `(brand AND brewery)` exact-match join
   * returned 0 rows, but the brand-only fallback found exactly one
   * match. The brand is unambiguous, but the brewery the model
   * extracted (`breweryDivergence.extracted`) does not match what
   * Sakenowa stores (`breweryDivergence.stored`). The UI MUST surface
   * the divergence honestly and require a deliberate tap to navigate
   * to the sake page — silently routing the visitor to a sake whose
   * brewery doesn't match the label is worse than saying "we're not
   * sure". `sakeHref` is included for the explicit-tap navigation;
   * `useEffect` MUST NOT auto-push to it (see `matched` above for
   * contrast).
   */
  | {
      status: 'matched_brand_only'
      extraction: LabelScanExtraction
      brandId: number
      sakeHref: string
      /**
       * `storedRomaji` is the catalogue brewery's romaji shown
       * alongside the kanji in the divergence row. `null` if the
       * Sakenowa brewery has neither a `nameRomaji` nor a `name`
       * (rare). No romaji for `extracted` — it's the model's
       * Japanese-only output.
       *
       * `stored` is empty where the catalogue files the sake under Sakenowa's
       * "maker not on record" placeholder (#419): then nothing contradicts the
       * label's brewery, the catalogue just names none, and the card says so
       * with `storedPrefecture` (absent on states cached before it existed).
       */
      breweryDivergence: { extracted: string; stored: string; storedRomaji: string | null; storedPrefecture?: string | null }
      /**
       * Canonical brand kanji from Sakenowa. Displayed prominently in
       * the divergence card. We prefer the catalogue form over
       * `extraction.name_ja` because (a) it survives the kanji-variant
       * mismatch (extracted `蔵王` matches stored `藏王` via variant
       * expansion, but the visitor sees the canonical form), and (b)
       * for the field-swap rescue path (single-char guard → brand-only
       * on the *brewery* field) the extraction's `name_ja` is the
       * model's hallucinated single character — we MUST display the
       * canonical brand kanji here, not the junk.
       */
      sakeKanji: string
      /**
       * Romaji of the matched brand (the trusted side). Used next to
       * the kanji on the divergence card.
       */
      sakeRomaji: string | null
    }
  /**
   * Structural dual of `matched_brand_only`: the first-pass and the
   * brand-only fallback both missed, but the brewery-only third pass
   * found exactly one brand under that brewery. Brewery is
   * unambiguously identified; the brand the model extracted does NOT
   * match what Sakenowa stores for that brewery. Same divergence-
   * surfacing UX — explicit-tap navigation, no auto-push. Real-world
   * motivation: Takashimizu bottles where the model reads the
   * brewery (高清水酒造) but hallucinates a wrong brand kanji.
   */
  | {
      status: 'matched_brewery_only'
      extraction: LabelScanExtraction
      brandId: number
      sakeHref: string
      /**
       * `storedRomaji` is the catalogue brand's romaji. Same
       * structure as `matched_brand_only.breweryDivergence` but for
       * the brand field.
       */
      brandDivergence: { extracted: string; stored: string; storedRomaji: string | null }
      /**
       * Romaji of the matched brewery (the trusted side here).
       */
      breweryRomaji: string | null
    }
  | {
      status: 'no_match'
      extraction: LabelScanExtraction
      /**
       * §5a "Did you mean": up to three catalogue sakes nearest to the read
       * by name or brewery (`nearest-brands.ts`), each with why it is
       * offered. Empty when nothing is near or the catalogue is unreachable.
       * Guesses, not matches — the screen never styles them as one.
       */
      candidates: readonly ScanCandidate[]
      /** Set when this photo and the previous one together point at a sake. */
      bothPhotos?: BothPhotosGuess
    }
  /**
   * Disambiguation list state. Multiple Sakenowa brands match the
   * extraction — the visitor reads their label, picks the right one
   * by tapping. Each candidate carries enough information to render
   * a row (kanji + romaji + locale-aware href) plus its brewery's
   * kanji + romaji so a "We matched the brewery: X" header can be
   * shown when all candidates share a brewery (the common shape
   * coming from `findSakeByBreweryOnly`'s ambiguous arm).
   *
   * Previous shape was `brandIds: readonly number[]` — replaced by
   * the richer per-candidate data so the UI doesn't need extra
   * lookups. The lookup chain already JOINs both sides for every
   * ambiguous-producing pass.
   */
  | {
      status: 'ambiguous'
      extraction: LabelScanExtraction
      /**
       * Each with its brewery's prefecture (e.g. "Gunma"), from the static
       * `manual_curation` area map, so a visitor facing same-brand-across-
       * breweries collisions (Hakushika: Ibaraki vs Hyogo) can pick by
       * region. Every ambiguous-producing pass joins both sides, but the
       * brewery may be Sakenowa's "maker not on record" placeholder (#419):
       * its names are then null and only the prefecture is shown.
       */
      candidates: readonly SakeRef[]
      /** Set when this photo and the previous one together point at a sake. */
      bothPhotos?: BothPhotosGuess
    }
  /**
   * The label prints that the bottle is something other than sake (焼酎,
   * 泡盛, 梅酒, リキュール …). The catalogue is sake only, and the makers of
   * these drinks often brew sake too, so a lookup would land on a sake the
   * visitor is not holding. No lookup is made; the screen says what the
   * drink is. `drink` comes from a word printed in the photo, never from
   * the brand or the maker.
   */
  | {
      status: 'not_sake'
      extraction: LabelScanExtraction
      drink: NonSakeDrink
    }
  /**
   * The photo is of a menu or of several bottles, not of one bottle. The
   * scan answers "which sake is this bottle", and neither has one answer.
   * The read (the first or most prominent drink) is carried so the visitor
   * can search from it.
   */
  | {
      status: 'not_one_bottle'
      extraction: LabelScanExtraction
      subject: 'menu' | 'several_bottles' | 'no_bottle'
    }
  /**
   * The read is too unsure to look up, or the side photographed carries no
   * writing. The extraction is carried for the read card and for pairing
   * the next photo with this one (#408).
   */
  | {
      status: 'low_confidence'
      extraction: LabelScanExtraction
      /** Set when this photo and the previous one together point at a sake. */
      bothPhotos?: BothPhotosGuess
    }

/**
 * Why a scan has no reading at all: nothing sent yet, a request the server
 * refused, or a read that failed on our side.
 */
export type ScanRequestOutcome =
  | { status: 'idle' }
  | { status: 'invalid_input'; reason: 'missing_image' | 'unsupported_locale' }
  /**
   * Phase 3 / S2 (#107): the per-visitor rate limit on the vision-scan
   * bucket has been exhausted. The UI renders a localized "you've
   * reached today's limit, try again in X" message using
   * `retryAfterSec` for the human-readable retry time. No promotional
   * copy per CLAUDE.md JMStV rules — discovery/learning register.
   */
  | {
      status: 'rate_limited'
      retryAfterSec: number
    }
  /**
   * The anonymous-session cookie is missing on the request. Post-#161
   * middleware refactor: the proxy (`src/proxy.ts`) is the sole writer
   * of `yawaragi_session` — actions read only. This state is a
   * defensive branch and should not surface in practice: every gated
   * page path passes through the middleware, which stamps the cookie
   * before render. Kept as an explicit variant so a hypothetical bypass
   * lands as a tagged UI state instead of a thrown exception.
   */
  | {
      status: 'session_missing'
    }
  /**
   * Catch-all for unhandled throws inside the action — Anthropic API
   * outages, the vision schema parse failing after retries on a
   * non-sake image, Sakenowa DB connectivity, etc. Without this state
   * the action would surface a Next.js error digest (`ERROR 3102…`)
   * and the operator would lose the entire server-side debug trace.
   *
   * `reason` is the thrown error's name (e.g. `AI_RetryError`,
   * `ZodError`). The `message` is intentionally NOT carried — full
   * error messages can leak server-side detail. The UI renders a
   * polite localized "couldn't process this image" copy; the panel
   * shows the technical detail via the debugLog the action attached
   * before returning.
   */
  | {
      status: 'extraction_failed'
      reason: string
    }

/** One bottle of two in a photo, and what its label read as. */
export interface ScanBottle {
  position: ScanBottlePosition
  /** Its brewery was printed on its label, not supplied by the model: "name and brewery read". */
  breweryPrinted: boolean
  reading: ScanReading
}

/**
 * Design v1.7 §5a (74): two bottles of equal weight share the photo, and
 * neither is clearly the one. "Which bottle do you mean?", one row per
 * bottle whose name could be read, each opening its own reading. The
 * photo's own extraction (its most prominent bottle) is kept for the debug
 * trace; the screen shows no read card.
 */
export interface ScanTwoBottles {
  status: 'two_bottles'
  extraction: LabelScanExtraction
  bottles: readonly ScanBottle[]
}

/**
 * Tagged-union state returned by `scanLabel` (as JSON from
 * `POST /{locale}/scan/read`). Lives in its own module because the scan
 * itself is server-only and the screen imports these types and constants.
 */
type ScanActionStateBase = ScanRequestOutcome | ScanReading | ScanTwoBottles

/**
 * Optional server-side trace attached to every action result when the
 * caller has the debug cookie set (`yawaragi_debug=1`). The client
 * `<DebugPanel />` renders these events alongside its own client-side
 * events (file picked, downscale done, etc.). Undefined when debug is
 * off — and stripped at the server boundary so debug data never leaks
 * to a non-debug visitor.
 */
export type ScanActionState = ScanActionStateBase & {
  debugLog?: ReadonlyArray<DebugEvent>
  /**
   * Free scans left after this one, when the visitor's scans are counted
   * (design v1.8, J3): 1 adds "Uses your last free scan" to the after-scan
   * nudge, 0 hides the nudge. Absent where nothing is counted.
   */
  scansLeft?: number
}

export const INITIAL_SCAN_ACTION_STATE: ScanActionState = { status: 'idle' }

/**
 * The catalogue sake a reading landed on, whichever status carries it, with
 * the catalogue's own kanji (never the model's misread): `matched_brand_only`
 * holds it on `sakeKanji`, `matched_brewery_only` on `brandDivergence.stored`.
 * `null` for a reading that names no one sake.
 */
export function landedSakeOf(
  reading: ScanActionState,
): { brandId: number; sakeHref: string; nameKanji: string; nameRomaji: string | null } | null {
  switch (reading.status) {
    case 'matched':
      return { brandId: reading.brandId, sakeHref: reading.sakeHref, nameKanji: reading.extraction.name_ja, nameRomaji: reading.sakeRomaji }
    case 'matched_brand_only':
      return { brandId: reading.brandId, sakeHref: reading.sakeHref, nameKanji: reading.sakeKanji, nameRomaji: reading.sakeRomaji }
    case 'matched_brewery_only':
      return {
        brandId: reading.brandId,
        sakeHref: reading.sakeHref,
        nameKanji: reading.brandDivergence.stored,
        nameRomaji: reading.brandDivergence.storedRomaji,
      }
    default:
      return null
  }
}
