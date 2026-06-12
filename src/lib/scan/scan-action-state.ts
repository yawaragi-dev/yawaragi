import type { DebugEvent } from '@/lib/debug/debug-log'
import type { LabelScanExtraction } from '@/lib/schemas/label-scan-extraction'

/**
 * Tagged-union state returned by `scanAction`. Lives in its own module
 * because Next's `'use server'` rule forbids non-async exports from an
 * actions file — only async functions are allowed. Types and constants
 * have to live somewhere else and be re-imported on both sides.
 */
type ScanActionStateBase =
  | { status: 'idle' }
  | { status: 'invalid_input'; reason: 'missing_image' | 'unsupported_locale' }
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
       */
      breweryDivergence: { extracted: string; stored: string; storedRomaji: string | null }
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
    }
  /**
   * Disambiguation list state. Multiple Sakenowa brands match the
   * extraction — the visitor reads their label, picks the right one
   * by tapping. Each candidate carries enough information to render
   * a row (kanji + romaji + locale-aware href) plus its brewery's
   * kanji + romaji so a "We matched the brewery: X" header can be
   * shown when all candidates share a brewery (the common shape
   * coming from `findSakeByBreweryOnlyFromPool`'s ambiguous arm).
   *
   * Previous shape was `brandIds: readonly number[]` — replaced by
   * the richer per-candidate data so the UI doesn't need extra
   * lookups. The lookup chain already JOINs both sides for every
   * ambiguous-producing pass.
   */
  | {
      status: 'ambiguous'
      extraction: LabelScanExtraction
      candidates: readonly {
        brandId: number
        sakeHref: string
        nameKanji: string
        nameRomaji: string | null
        breweryKanji: string
        breweryRomaji: string | null
      }[]
    }
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
   * Phase 3 / S3 (#108) PLACEHOLDER: the vision provider produced an
   * extraction whose confidence is below the auto/confirm threshold.
   * S3 has no UI for medium / low confidence yet — S4 (#109) lands the
   * three-tier UX (auto/confirm/retry). Until then the action returns
   * this tagged state and the UI renders a localized "we couldn't read
   * the label clearly, try a closer shot" message. The `extraction` is
   * carried through so a future S4 confirm-card can use it without a
   * second scan.
   *
   * S4 will likely split this into `confirm` (medium) and `retry`
   * (low), at which point the placeholder copy is replaced; the action
   * change is local and the rest of the wire-shape is unaffected.
   */
  | {
      status: 'low_confidence'
      extraction: LabelScanExtraction
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
}

export const INITIAL_SCAN_ACTION_STATE: ScanActionState = { status: 'idle' }
