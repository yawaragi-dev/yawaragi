import 'server-only'

import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'

/**
 * Latin-alphabet transliteration for Sakenowa sake brand / brewery
 * kanji names. Issue #121.
 *
 * Sakenowa's API publishes only Japanese names; the Latin form is
 * editorial and lives in `brands.name_romaji` / `breweries.name_romaji`
 * (nullable, populated by this module during `pnpm ingest`).
 *
 * Calls Anthropic Haiku 4.5 via the AI SDK with a `generateObject`
 * structured-output schema. Concurrency is capped so we don't fan out
 * 3000 simultaneous calls at the model — a smaller batch keeps the
 * fan-out friendly to Anthropic's rate limits while still finishing
 * a fresh ingest in a few minutes rather than an hour.
 *
 * The fan-out batch size + per-call retry behaviour are tuned for the
 * "ingest runs once per night, ~50 changed rows per run" steady state.
 * The first-pass ingest on a fresh DB is ~4500 calls; at ~$0.003 per
 * call that's under $15 total.
 */

const PROMPT = `You produce a single-line Latin-alphabet (Hepburn romanisation) display name for a Japanese sake brand or brewery.

Rules:
- Use Hepburn romanisation with macrons OMITTED (write "Hakkaisan", not "Hakkaisan" with a macron — plain ASCII letters only).
- Title Case the name ("Asahi Shuzo", "Kubota", "Hakkaisan").
- Strip legal-form suffixes from brewery names: 株式会社 → drop, 有限会社 → drop, 合資会社 → drop, 合同会社 → drop.
- KEEP operational suffixes that are part of the core brewery name: 酒造 → "Shuzo", 醸造 → "Jozo", 酒造場 → "Shuzojo", 酒造店 → "Shuzo-ten".
- If the input has multiple kanji-blocks separated by spaces, preserve that separation in the output as well (e.g. "獺祭 純米大吟醸" would romanise to "Dassai Junmai Daiginjo" — but this function is only called on already-clean brand / brewery names, so multi-block inputs should be rare).
- Do not add explanatory text, English translations, or alternative readings — just the single Hepburn name.

Examples:
- 獺祭 → Dassai
- 旭酒造 → Asahi Shuzo
- 旭酒造株式会社 → Asahi Shuzo
- 久保田 → Kubota
- 朝日酒造 → Asahi Shuzo  (yes, two different breweries can share a romanisation — that's why we never join on romaji)
- 八海山 → Hakkaisan
- 八海醸造 → Hakkai Jozo
- 黒龍 → Kokuryu
- 黒龍酒造 → Kokuryu Shuzo`

const ResponseSchema = z.object({
  romaji: z
    .string()
    .min(1)
    .describe('The Hepburn-romanised display name. ASCII letters only, no macrons.'),
})

/**
 * Transliterate one kanji name. Throws on AI SDK exhausted retries or
 * empty output — the caller decides whether to surface as a hard
 * failure or fall back to `null`.
 */
async function transliterateOne(nameKanji: string): Promise<string> {
  const { object } = await generateObject({
    model: anthropic('claude-haiku-4-5'),
    schema: ResponseSchema,
    schemaName: 'RomajiTransliteration',
    schemaDescription: 'Hepburn-romanised Latin display name for a Japanese sake brand or brewery.',
    system: PROMPT,
    messages: [{ role: 'user', content: nameKanji }],
  })
  return object.romaji.trim()
}

export interface TransliterationItem {
  /** Stable id for the caller (brand_id or brewery_id). */
  id: number
  /** Japanese name to transliterate. */
  nameKanji: string
}

export interface TransliterationResult {
  /** Same as input `id`. */
  id: number
  /** Hepburn romanisation, or `null` when the model call failed. */
  nameRomaji: string | null
  /** Error class name when the call failed; useful for ingest logs. */
  error?: string
}

export interface TransliterateBatchOptions {
  /**
   * Max simultaneous in-flight LLM calls. Default 8 — empirically a
   * balance between Anthropic rate-limit headroom and total wall-clock
   * for a fresh-DB ingest.
   */
  concurrency?: number
  /**
   * Per-item override for the LLM call. Tests pass a mock; production
   * callers omit it and the default `transliterateOne` runs.
   */
  call?: (nameKanji: string) => Promise<string>
  /** Optional progress callback fired after each completion. */
  onProgress?: (completed: number, total: number) => void
}

/**
 * Transliterate a batch of kanji names with bounded concurrency.
 *
 * Empty / placeholder inputs (`nameKanji === ''`) short-circuit to
 * `nameRomaji: null` without a model call — Sakenowa's ~48
 * placeholder brewery rows have no kanji to transliterate, and we
 * shouldn't spend a call on each one. Same shortcut for any future
 * blank kanji that slip through the row-filter.
 *
 * Individual call failures are captured rather than thrown: a 500
 * from Anthropic on row #1342 shouldn't sink the whole batch. The
 * caller sees a `null` romaji + an `error` field, decides whether to
 * surface or retry.
 */
export async function transliterateBatch(
  items: ReadonlyArray<TransliterationItem>,
  opts: TransliterateBatchOptions = {},
): Promise<TransliterationResult[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 8)
  const call = opts.call ?? transliterateOne
  const results: TransliterationResult[] = new Array(items.length)
  let nextIndex = 0
  let completed = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      const item = items[i]
      if (item.nameKanji.trim() === '') {
        results[i] = { id: item.id, nameRomaji: null }
      } else {
        try {
          const romaji = await call(item.nameKanji)
          results[i] = { id: item.id, nameRomaji: romaji }
        } catch (err) {
          results[i] = {
            id: item.id,
            nameRomaji: null,
            error: err instanceof Error ? err.name : 'UnknownError',
          }
        }
      }
      completed++
      opts.onProgress?.(completed, items.length)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )

  return results
}
