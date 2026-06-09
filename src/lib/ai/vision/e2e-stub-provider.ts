import 'server-only'

import {
  LabelScanExtractionSchema,
  type LabelScanExtraction,
} from '@/lib/schemas/label-scan-extraction'
import type { VisionProvider } from './vision-provider'

/**
 * Deterministic vision-provider stub for the Playwright spec. Returns a
 * fixed high-confidence extraction matching the `e2e/fixtures/dassai-label.jpg`
 * fixture — Dassai / Asahi Shuzo — so the E2E exercises the whole real
 * scan flow (rate-limit → vision → Sakenowa lookup → matched navigation)
 * without burning Anthropic credit on every PR.
 *
 * Selection is opt-in via `VISION_PROVIDER=e2e-stub`. Production fails
 * closed: if the env var ever leaks into a production deploy, the first
 * scan throws rather than silently serving Dassai for every label.
 *
 * The fixed values must match what the S1 hardcoded extraction returned
 * (and what the Sakenowa Dassai row uses for name_kanji/brewery_kanji)
 * so the existing scan-page E2E continues to pass when running with this
 * stub registered as the default.
 */
const STUB_EXTRACTION: LabelScanExtraction = LabelScanExtractionSchema.parse({
  source: 'llm_extracted',
  name_ja: '獺祭',
  brewery_ja: '旭酒造',
  confidence: 0.95,
})

export function createE2eStubVisionProvider(): VisionProvider {
  return {
    async extractLabel(jpegBlob: Blob): Promise<LabelScanExtraction> {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'e2e-stub vision provider is not allowed in production. Set VISION_PROVIDER=anthropic-haiku-4-5 (or unset it) before deploying.',
        )
      }
      if (jpegBlob.size === 0) {
        // Mirror the Anthropic provider's failure mode for an empty
        // upload — the schema would also reject a blank-string field
        // but failing here keeps the error specific to the cause.
        throw new Error('e2e-stub: empty image blob')
      }
      return STUB_EXTRACTION
    },
  }
}
