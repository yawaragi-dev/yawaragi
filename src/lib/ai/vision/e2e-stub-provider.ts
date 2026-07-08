import 'server-only'

import { cookies } from 'next/headers'
import { debugAdd } from '@/lib/debug/debug-log'
import {
  LabelScanExtractionSchema,
  type LabelScanExtraction,
} from '@/lib/schemas/label-scan-extraction'
import type { VisionProvider } from './vision-provider'

/**
 * Deterministic vision-provider stub for the Playwright specs. By
 * default it returns a fixed high-confidence Dassai / Asahi Shuzo
 * extraction matching `e2e/fixtures/dassai-label.jpg`, so the E2E
 * exercises the whole real scan flow (rate-limit → vision → Sakenowa
 * lookup → in-place result) without burning Anthropic credit.
 *
 * Selection is opt-in via `VISION_PROVIDER=e2e-stub`. Production fails
 * closed: if the env var ever leaks into a production deploy, the first
 * scan throws rather than silently serving Dassai for every label.
 *
 * ## Per-test injection (issue #109 PR B)
 *
 * To drive a SPECIFIC result branch (ambiguous / no_match / divergence
 * / low-confidence), a spec sets the `yawaragi_e2e_vision` cookie to a
 * base64-encoded JSON `{ name_ja, brewery_ja, confidence }`. The stub
 * decodes it and returns that extraction instead of the Dassai default,
 * letting the real Sakenowa lookup resolve it to the branch the spec
 * wants. Base64 keeps the cookie value ASCII-safe despite kanji
 * payloads. The cookie is only ever read here (a non-production
 * provider), so it carries no production surface.
 */
const DEFAULT_EXTRACTION: LabelScanExtraction = LabelScanExtractionSchema.parse({
  source: 'llm_extracted',
  name_ja: '獺祭',
  brewery_ja: '旭酒造',
  confidence: 0.95,
})

/** Cookie the Playwright specs set to inject a per-test extraction. */
export const E2E_VISION_COOKIE = 'yawaragi_e2e_vision'

async function readInjectedExtraction(): Promise<LabelScanExtraction | null> {
  try {
    const jar = await cookies()
    const raw = jar.get(E2E_VISION_COOKIE)?.value
    if (!raw) return null
    const json = Buffer.from(raw, 'base64').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { name_ja, brewery_ja, confidence } = parsed as Record<string, unknown>
    // Pin `source` here; the injected payload only carries the three
    // model-output fields. Schema.parse enforces the field contract so
    // a malformed cookie can't smuggle a bad shape into the pipeline.
    return LabelScanExtractionSchema.parse({
      source: 'llm_extracted',
      name_ja,
      brewery_ja,
      confidence,
    })
  } catch {
    // Missing request scope (unit test), malformed base64/JSON, or a
    // schema-invalid payload: fall back to the Dassai default rather
    // than throwing — the stub must never crash the flow it exists to
    // exercise.
    return null
  }
}

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
      const injected = await readInjectedExtraction()
      const extraction = injected ?? DEFAULT_EXTRACTION
      debugAdd(
        'Vision',
        injected
          ? `e2e-stub: returning INJECTED extraction (no model call)`
          : `e2e-stub: returning fixed Dassai extraction (no model call)`,
        { name_ja: extraction.name_ja, confidence: extraction.confidence },
      )
      return extraction
    },
  }
}
