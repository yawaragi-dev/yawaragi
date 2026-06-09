import 'server-only'

import type { LanguageModel } from 'ai'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import {
  LabelScanExtractionSchema,
  type LabelScanExtraction,
} from '@/lib/schemas/label-scan-extraction'
import { ZDR_ACTIVE } from '@/lib/ai/zdr-status'
import type { VisionProvider } from './vision-provider'

/**
 * Anthropic Haiku 4.5 implementation of the `VisionProvider` seam
 * (Phase 3 / S3 #108).
 *
 * Architectural decisions:
 *   - Calls the AI SDK's `generateObject` with `LabelScanExtractionSchema`,
 *     so the model is forced into structured output and the same parse-time
 *     `source: 'llm_extracted'` pinning enforced by the schema runs at the
 *     seam. A model that hallucinates a different `source` value throws
 *     here, not downstream.
 *   - The image is passed as an `ImagePart` with `image: Uint8Array`. The
 *     `@ai-sdk/anthropic` provider serialises that to inline base64 on
 *     `/v1/messages` — it never reaches `/v1/files`. The forbidden-pattern
 *     scan in `scripts/audit-anthropic-files-api.ts` stays clean against
 *     this module. CLAUDE.md § "Anthropic Files API ban".
 *   - `ZDR_ACTIVE` is read from the source-of-truth. ADR-0009 documents
 *     7-day standard Anthropic retention (reduced from 30 on 2025-09-14)
 *     as the acceptable baseline; ZDR is a pre-DACH-launch action, not a
 *     hard prerequisite for any production call. So in production with
 *     ZDR off we log a once-per-cold-start warning that the project's
 *     documented baseline is in effect — and proceed. Flip
 *     `ZDR_ACTIVE = true` in `src/lib/ai/zdr-status.ts` after the
 *     Anthropic sales-negotiated ZDR contract is on file to silence the
 *     warning. Non-production paths don't log at all.
 *
 * @param overrides — escape hatch used by the unit tests in this slice and
 * (eventually) by the Playwright spec to inject a `MockLanguageModelV3`.
 * Production callers never pass it; the registry constructs the provider
 * with no overrides and the `anthropic` factory pulls the model from
 * `ANTHROPIC_API_KEY` (env.ts tightened it to required in this slice).
 */
export interface AnthropicHaikuProviderOptions {
  /**
   * Optional override for the language model. Tests pass a
   * `MockLanguageModelV3` (CLAUDE.md anti-pattern: do NOT mock the AI SDK
   * by stubbing fetch). Production callers omit this.
   */
  model?: LanguageModel
  /**
   * Optional override for the ZDR-warning gate. The production path
   * reads `ZDR_ACTIVE` directly; tests force the value to assert the
   * warning either fires or doesn't.
   */
  zdrActive?: boolean
  /**
   * Optional override for the NODE_ENV check. Tests pass
   * `'production'` to assert the warning fires; `'development'` to
   * assert it doesn't.
   */
  nodeEnv?: string
}

// The system prompt is deliberately terse. The structured-output schema
// already constrains the shape; we only need the model to know what to
// look at on the image. Romaji is explicitly excluded — the lookup joins
// on kanji (CONTEXT.md § "Same-romaji collisions are possible").
const SYSTEM_PROMPT = [
  'You read sake bottle labels and extract the sake name and brewery name in their original Japanese script.',
  'Return only what is visible on the label. Do not translate, romanise, or guess.',
  'If you are not confident about a field, lower the confidence score rather than fabricating a value.',
].join(' ')

const USER_PROMPT =
  'Read this sake bottle label and return the sake name and brewery name as written on the label (kanji / kana), plus a confidence score between 0 and 1.'

export function createAnthropicHaikuProvider(
  options: AnthropicHaikuProviderOptions = {},
): VisionProvider {
  const zdrActive = options.zdrActive ?? ZDR_ACTIVE
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  // The model is resolved lazily so a missing `ANTHROPIC_API_KEY` only
  // throws when the provider is actually used (tests don't need it).
  const model = options.model
  // Memoised so production cold start logs once, not on every scan.
  // Per-factory rather than module-level so vitest can assert "warn
  // fired" on a fresh provider per test without a beforeEach reset.
  let zdrWarnedOnce = false

  return {
    async extractLabel(jpegBlob: Blob): Promise<LabelScanExtraction> {
      if (nodeEnv === 'production' && !zdrActive && !zdrWarnedOnce) {
        // ADR-0009 § "Retention is documented per data type" already
        // documents 7-day standard Anthropic retention as the
        // acceptable baseline (reduced from 30 on 2025-09-14). ZDR is
        // the pre-DACH-launch upgrade, not a hard prerequisite for any
        // production call. Warn (rather than throw) so the application
        // stays in sync with the documented posture: the warning is a
        // reminder to flip ZDR_ACTIVE once the contract is on file,
        // not a refusal to serve traffic.
        console.warn(
          '[scan] Anthropic Zero Data Retention is not active; calls go to /v1/messages with the 7-day standard retention window (acknowledged in ADR-0009 RoPA). Flip ZDR_ACTIVE in src/lib/ai/zdr-status.ts after the ZDR contract is on file to silence this warning.',
        )
        zdrWarnedOnce = true
      }

      const resolvedModel = model ?? anthropic('claude-haiku-4-5')

      // Convert the JPEG blob to a Uint8Array. The AI SDK's `ImagePart`
      // with `image: Uint8Array` is serialised by `@ai-sdk/anthropic`
      // into inline base64 in the `/v1/messages` request body — never
      // through `/v1/files`. The forbidden-pattern audit (`pnpm
      // anthropic-files:audit`) protects against any regression here.
      const arrayBuffer = await jpegBlob.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)

      const { object } = await generateObject({
        model: resolvedModel,
        schema: LabelScanExtractionSchema,
        schemaName: 'LabelScanExtraction',
        schemaDescription:
          'Sake label extraction: name and brewery in original Japanese script, plus confidence.',
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: USER_PROMPT },
              {
                type: 'image',
                image: bytes,
                mediaType: jpegBlob.type || 'image/jpeg',
              },
            ],
          },
        ],
      })

      // `generateObject` already runs the schema parse, so `object` is
      // typed as `LabelScanExtraction`. We pass it back through the
      // schema's `parse` once more as a belt-and-braces guard against an
      // SDK version that ever stops enforcing the schema, and to keep the
      // documented contract of this method ("returns a value that has
      // passed LabelScanExtractionSchema.parse").
      return LabelScanExtractionSchema.parse(object)
    },
  }
}
