// NOTE: no `import 'server-only'` here. This module is intentionally
// reachable from `scripts/ingest-sakenowa.ts`, a Node CLI that runs
// outside of any Next.js request context — `server-only` throws on
// load in that environment. The module is still server-only by
// convention (it calls Anthropic and reads ANTHROPIC_API_KEY);
// nothing client-side imports it.

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
 * Calls `ROMAJI_MODEL` via the AI SDK with a `generateObject`
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

// The first prompt asked for "Hepburn romanisation" of the name alone, and
// the model read the kanji one at a time: 北鹿 came back "Kitashika" for
// Hokushika, 花巴 "Hanaba" for Hanatomoe, 黄桜 "Kiou" for Kizakura. Checked
// against 54 names whose reading is printed on their labels (2026-10-12), it
// got 34 right. Sake names are proper names with fixed and often irregular
// readings, so the prompt now says so, and the caller says what the name is
// a name of and where it is from — which is what lets a model recognise it.
// With that and Sonnet 5.5: 51 of 54.
const PROMPT = `You give the Latin-alphabet name of a Japanese sake or sake brewery, as the brewery itself writes it.

These are proper names with fixed readings, and many are irregular. Do not read the kanji one at a time. If you recognise the sake or the brewery — from the name, and from the brewery and prefecture when they are given — use its real reading: 十四代 is Juyondai, 新政 is Aramasa, 而今 is Jikon, 飛露喜 is Hiroki, 醸し人九平次 is Kamoshibito Kuheiji, 作 is Zaku. Compounds usually voice their second word: 樽酒 is Taruzake, 酒蔵 is Sakagura.

Format:
- Hepburn, plain ASCII letters, no macrons ("Kokuryu", not "Kokuryū").
- Title Case, words separated the way the name is said ("Koshi no Kanbai", "Nanbu Bijin").
- A sake's name is the name alone. It never ends in "Shuzo" or "Jozo", even when the sake is named after its brewery: 出羽桜 is "Dewazakura", its brewery 出羽桜酒造 is "Dewazakura Shuzo".
- For a brewery, drop legal forms (株式会社, 有限会社, 合資会社, 合同会社) and keep the rest: 酒造 is "Shuzo", 醸造 is "Jozo", 酒造店 is "Shuzoten", 酒造場 is "Shuzojo", 商店 is "Shoten".
- Only the name. No explanation, no translation, no alternatives.

Two different names can have the same Latin form (旭酒造 and 朝日酒造 are both "Asahi Shuzo"); that is expected.`

/** The model new and changed rows are read with. Sonnet, because a reading is kept for good. */
export const ROMAJI_MODEL = 'claude-sonnet-5-5'

const ResponseSchema = z.object({
  romaji: z
    .string()
    .min(1)
    .describe('The Hepburn-romanised display name. ASCII letters only, no macrons.'),
})

/**
 * What the model is asked: the name, what it is a name of, and where it is
 * from. Exported for the unit test — the context is the point of it.
 */
export function transliterationRequest(item: TransliterationItem): string {
  if (!item.kind) return item.nameKanji
  const lines = [`${item.kind === 'sake' ? 'Sake' : 'Brewery'}: ${item.nameKanji}`]
  if (item.kind === 'sake' && item.breweryKanji) lines.push(`Brewery: ${item.breweryKanji}`)
  if (item.prefecture) lines.push(`Prefecture: ${item.prefecture}`)
  return lines.join('\n')
}

/**
 * Transliterate one name. Throws on AI SDK exhausted retries or empty
 * output — the caller decides whether to surface as a hard failure or
 * fall back to `null`.
 */
async function transliterateOne(_nameKanji: string, item: TransliterationItem, model: string): Promise<string> {
  const { object } = await generateObject({
    model: anthropic(model),
    schema: ResponseSchema,
    schemaName: 'RomajiTransliteration',
    schemaDescription: 'The Latin-alphabet name of a Japanese sake or sake brewery, as the brewery writes it.',
    // The instructions and the answer's schema are the same on every call
    // and are most of the input (843 tokens, measured 2026-10-14; Sonnet
    // 5.5 caches from 512), so they are marked for Anthropic's prompt
    // cache: a regeneration of ~4,000 names reads them at a twentieth of
    // the price instead of paying for them in full each time. The message
    // form is load-bearing: a bare `system` string cannot carry
    // `providerOptions`, and the marker would be dropped silently.
    instructions: {
      role: 'system',
      content: PROMPT,
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } },
    },
    messages: [{ role: 'user', content: transliterationRequest(item) }],
  })
  return object.romaji.trim()
}

export interface TransliterationItem {
  /** Stable id for the caller (brand_id or brewery_id). */
  id: number
  /** Japanese name to transliterate. */
  nameKanji: string
  /** What the name is a name of. Omitted, the model is given the name alone. */
  kind?: 'sake' | 'brewery'
  /** For a sake: its brewery, in Japanese. */
  breweryKanji?: string
  /** Where it is made, in Japanese (秋田県) or Latin. */
  prefecture?: string
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
  call?: (nameKanji: string, item: TransliterationItem) => Promise<string>
  /** Model id for the default call. Defaults to {@link ROMAJI_MODEL}. */
  model?: string
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
  const model = opts.model ?? ROMAJI_MODEL
  const call = opts.call ?? ((nameKanji: string, item: TransliterationItem) => transliterateOne(nameKanji, item, model))
  const results: TransliterationResult[] = new Array(items.length)
  let nextIndex = 0
  let completed = 0

  // `once`: stop after the first model call. The batch makes one call
  // alone before the others start, because a cache entry exists only once
  // its first response begins — eight calls started together would each
  // write the prompt instead of seven of them reading it.
  async function worker(once = false): Promise<void> {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      const item = items[i]
      if (item.nameKanji.trim() === '') {
        results[i] = { id: item.id, nameRomaji: null }
      } else {
        try {
          const romaji = await call(item.nameKanji, item)
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
      if (once && item.nameKanji.trim() !== '') return
    }
  }

  await worker(true)
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )

  return results
}
