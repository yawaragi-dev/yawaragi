'use server'

import { getPathname } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { routing } from '@/i18n/routing'
import { findSakeByExtraction } from '@/lib/sakenowa/lookup'
import {
  type LabelScanExtraction,
  parseLabelScanExtraction,
} from '@/lib/schemas/label-scan-extraction'
import type { ScanActionState } from './scan-action-state'

/**
 * Phase 3 / S1 scan Server Action.
 *
 * What this slice ships (PRD #105 §"Provider strategy", issue #106):
 *   - Accepts the FormData from the client `<ScanForm />`.
 *   - Returns a HARDCODED extraction. The vision provider seam is wired
 *     in S3 (#108); until then, the action proves out the wire shape and
 *     end-to-end happy path.
 *   - Parses the hardcoded result through `LabelScanExtractionSchema` so
 *     the source pinning is the same parse-time seam the real provider
 *     will hit, and a future broken provider can't silently regress.
 *   - Runs the real `findSakeByExtraction` against the Sakenowa mirror.
 *   - Returns a tagged-union result for `useActionState` to render.
 *
 * Out of scope for S1 (defer to later slices per #105):
 *   - Real vision call (S3 / #108)
 *   - Anonymous-session cookie issuance + rate limiting (S2 / S5)
 *   - Medium/low confidence UX states (S4)
 *   - Disambiguation list UI (S4)
 *   - Age-gate "requires_age_gate" gate-resume flow (S4 wiring; the
 *     existing proxy already keeps the result page out of reach for an
 *     un-gated visitor, so the S1 happy-path arrives at `/sake/[brandId]`
 *     only when the gate is accepted)
 */

// Hardcoded test extraction. Dassai / Asahi Shuzo — picked because it's
// the canonical sake referenced in CONTEXT.md "Language" §Sake. Confidence
// is pinned at 0.95 (high) so the happy-path UI tier resolution always
// returns `auto`.
const HARDCODED_EXTRACTION = {
  source: 'llm_extracted',
  name_ja: '獺祭',
  brewery_ja: '旭酒造',
  confidence: 0.95,
} satisfies LabelScanExtraction

function isLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value)
}

/**
 * Server Action invoked by `<ScanForm />`. `_prev` is the previous
 * `useActionState` value (ignored — every submission is fresh). The
 * `formData` carries the downscaled JPEG under `image` and the visitor's
 * locale under `locale` so the redirect URL is locale-correct without
 * the action having to re-derive it from headers.
 */
export async function scanAction(
  _prev: ScanActionState,
  formData: FormData,
): Promise<ScanActionState> {
  const image = formData.get('image')
  if (!(image instanceof Blob) || image.size === 0) {
    return { status: 'invalid_input', reason: 'missing_image' }
  }
  const localeRaw = formData.get('locale')
  if (typeof localeRaw !== 'string' || !isLocale(localeRaw)) {
    return { status: 'invalid_input', reason: 'unsupported_locale' }
  }

  // S1: the vision provider is stubbed. The blob is accepted but not
  // sent anywhere — S3 (#108) wires the real Haiku 4.5 call here.
  const extraction = parseLabelScanExtraction(HARDCODED_EXTRACTION)

  const lookup = await findSakeByExtraction({
    nameJa: extraction.name_ja,
    breweryJa: extraction.brewery_ja,
  })

  if (lookup.kind === 'exact') {
    const sakeHref = getPathname({
      locale: localeRaw,
      href: { pathname: '/sake/[brandId]', params: { brandId: String(lookup.sake.brandId) } },
    })
    return {
      status: 'matched',
      extraction,
      brandId: lookup.sake.brandId,
      sakeHref,
    }
  }
  if (lookup.kind === 'ambiguous') {
    return {
      status: 'ambiguous',
      extraction,
      brandIds: lookup.candidates.map((c) => c.brandId),
    }
  }
  return { status: 'no_match', extraction }
}
