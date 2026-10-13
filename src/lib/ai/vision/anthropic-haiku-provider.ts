import 'server-only'

import type { LanguageModel } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import {
  LabelScanExtractionSchema,
  type LabelScanExtraction,
} from '@/lib/schemas/label-scan-extraction'
import { ZDR_ACTIVE } from '@/lib/ai/zdr-status'
import { debugAdd } from '@/lib/debug/debug-log'
import { tracedGenerateObject } from '@/lib/ai/observability/langfuse-trace'
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
 *   - The image is passed as a `FilePart` with `data: { type: 'data', data:
 *     Uint8Array }` and an `image/*` media type (AI SDK 7 deprecated the
 *     `ImagePart` shape). The `@ai-sdk/anthropic` provider serialises that
 *     to inline base64 on `/v1/messages` — it never reaches `/v1/files`.
 *     Only the `data` variant of AI SDK 7's tagged file-data union is
 *     ZDR-eligible; `{ type: 'reference' }` *is* the Files-API upload path.
 *     The forbidden-pattern scan in
 *     `scripts/audit-anthropic-files-api.ts` stays clean against this
 *     module. CLAUDE.md § "Anthropic Files API ban".
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
  /**
   * Optional extra trace attributes attached to the Langfuse trace
   * emitted by `tracedGenerateObject`. Phase 4 / S4 (#141) — the
   * provider always emits a trace; the caller (registry / scan-action)
   * uses this to tag the call with provider key, tier, or other
   * action-level context. Keys follow the `<area>.<key>` convention
   * (`provider.key`, `scan.tier`, etc.).
   *
   * String values only — Langfuse's `propagateAttributes` drops
   * non-strings with a console warning. See `TracedCallContext.metadata`.
   */
  telemetryMetadata?: Record<string, string>
  /**
   * How much the model reasons before answering (Claude 5 models think by
   * default, which is most of a scan's latency). Omitted, the model's own
   * default applies. Not accepted by the Claude 4.5 models.
   */
  effort?: 'low' | 'medium' | 'high'
  /**
   * Called with the tokens each call used. The eval runner adds them up to
   * say what a run cost; the scan itself has no use for it.
   */
  onUsage?: (usage: {
    /** All input tokens, cached or not. */
    inputTokens: number
    outputTokens: number
    /** Of the input: read from the prompt cache, and written to it. */
    cacheReadTokens: number
    cacheWriteTokens: number
  }) => void
}

// The system prompt teaches the model the difference between the
// SAKE BRAND (銘柄, Sakenowa's brand row) and SKU-level modifiers
// (grade, polishing ratio, style). Initial tuning observation: the
// model is happy to extract the full label string verbatim ("獺祭 純米
// 大吟醸 磨き45"), but Sakenowa's `brands.name_kanji` stores just
// "獺祭" — exact-match joins return zero rows for any specific bottle.
// Stripping the SKU modifiers brings the extraction in line with the
// lookup key. Romaji is explicitly excluded — the lookup joins on
// kanji (CONTEXT.md § "Same-romaji collisions are possible").
//
// The brewery side has a parallel issue at a different scale: labels
// often write the brewery with a legal-form suffix ("旭酒造株式会社")
// while Sakenowa stores just "旭酒造". Strip those suffixes; keep
// the operational suffix (酒造 / 醸造 / 酒造場) which is part of the
// brewery's core name.
const SYSTEM_PROMPT = `You identify the sake brand and the brewery on a sake bottle label.

The brand (銘柄) is the main product LINE name — the prominent kanji that identifies the sake family. Strip grade descriptors, polishing-ratio markers, and style modifiers from it.

Strip these from the brand name:
- Grade descriptors: 純米大吟醸, 大吟醸, 純米吟醸, 純米, 本醸造, 特別純米, 特別本醸造, 吟醸
- Polishing-ratio markers: 磨き45, 磨き35, 磨き二割三分, 精米歩合50%
- Style modifiers: 無濾過, 生酒, ひやおろし, 古酒, 貴醸酒, スパークリング, にごり, 原酒
- Year/lot markers: 平成X年, 令和X年, BY数字, lot numbers

The brewery is the company that made it. Strip Japanese legal-form markers (株式会社, 有限会社, 合資会社, 合同会社) wherever they appear — they can be a SUFFIX (旭酒造株式会社 → 旭酒造) OR a PREFIX (合同会社蔵王酒造 → 蔵王酒造). 合同会社 is especially common as a prefix. Both positions must be stripped. KEEP operational suffixes (酒造, 醸造, 酒造場, 酒造店) — those are part of the brewery's core name.

Examples (label → output):
- "獺祭 純米大吟醸 磨き45" by "旭酒造株式会社" → name_ja: "獺祭", brewery_ja: "旭酒造"
- "八海山 大吟醸" by "八海醸造株式会社" → name_ja: "八海山", brewery_ja: "八海醸造"
- "久保田 千寿" by "朝日酒造株式会社" → name_ja: "久保田 千寿", brewery_ja: "朝日酒造"
- "蔵王" by "合同会社蔵王酒造" → name_ja: "蔵王", brewery_ja: "蔵王酒造"  ← prefix form, 合同会社 stripped
- "風の森" by "有限会社油長酒造" → name_ja: "風の森", brewery_ja: "油長酒造"  ← prefix form, 有限会社 stripped

CRITICAL — script and field-identity rules:

1. PRESERVE THE SCRIPT THE BRAND IS ACTUALLY PRINTED IN. Many sake brands are intentionally printed in non-kanji script. Return what you see:
   - If the brand on the label is printed in **kanji** (e.g. 獺祭, 八海山) → return the kanji form.
   - If the brand on the label is printed in **katakana** (e.g. ウマミ, ラッキーキャッツ) → return the katakana form VERBATIM. Do NOT convert katakana to kanji.
   - If the brand on the label is printed in **hiragana** (e.g. うまみ, あたごのまつ) → return the hiragana form VERBATIM. Do NOT convert hiragana to kanji.
   - If the brand on the label is printed in **Latin alphabet** (e.g. UMAMI, Shangri-la, Highland) → return the Latin form VERBATIM. Latin script IS allowed for name_ja in this case.
   When a label shows BOTH a kana/Latin form AND a kanji form, prefer the kana/Latin form ONLY when the kanji is small/secondary and the kana/Latin is the visually dominant brand mark. If kanji and kana are equally prominent, prefer kanji. If you cannot determine the brand at all, drop confidence sharply (below 0.5) rather than guessing or fabricating.

   ABSOLUTELY DO NOT "translate" Latin romaji into kanji you didn't actually read. This is the most damaging hallucination mode: the label shows "Tanigawa Dake" in big Latin and possibly some small kanji you can only partially make out, and a tempting kanji form (e.g. 谷川岳 or, worse, a fabricated 天川 that "sounds right") jumps to mind from training data. DO NOT WRITE THE KANJI YOU DID NOT VISUALLY VERIFY. If Latin is what you can read most confidently, return the Latin verbatim — even at high confidence. The downstream Sakenowa lookup matches Latin → romaji column directly; a Latin answer with correct spelling beats a kanji answer with phantom characters.

   Examples:
   - Label has "Tanigawa Dake" in large Latin + tiny kanji you cannot confidently identify → name_ja: "Tanigawa Dake", confidence: 0.8 (NOT a guessed kanji form, NEVER a "sounds-like" fabrication like 天川).
   - Label has "Tanigawa Dake" in large Latin + clearly readable "谷川岳" kanji → name_ja: "谷川岳", confidence: 0.9 (kanji is preferred when verifiable).
   - Label has "UMAMI" in huge Latin + no other brand text → name_ja: "UMAMI", confidence: 0.9.

   Brewery (brewery_ja) names should still be returned in their original Japanese script — brewery legal names are almost always in kanji.

2. Do NOT confuse the brewery with RICE-VARIETY call-outs. Sake labels frequently advertise the rice cultivar — 山田錦 (Yamada Nishiki), 雄町 (Omachi), 五百万石 (Gohyakumangoku), 美山錦 (Miyama Nishiki), 出羽燦々 (Dewa Sansan), 秋田酒こまち (Akita Sake Komachi), 愛山 (Aiyama). These are RICE varieties, NOT breweries. Never put a rice-variety name in brewery_ja OR name_ja. The brewery is the company / 酒造 / 醸造, typically printed in a smaller block elsewhere on the label.

3. Do NOT confuse the brewery with sake-rice ratings or grade markers. 精米歩合 (polishing ratio percentages), 日本酒度 (SMV), 酸度 (acidity), 使用酵母 (yeast strain) are all data ABOUT the sake — never put them in name_ja or brewery_ja.

4. Do NOT confuse the brewery with a RETAILER. Some bottles — especially collaborations and limited editions — show both the brewery (e.g. 川鶴酒造) and a retailer/store (e.g. 柴田屋酒店) on the label, and the RETAILER IS OFTEN PRINTED MORE PROMINENTLY than the actual brewery. The actual brewery is the company that brewed the sake — typically printed smaller, in regulatory text near the bottom or side of the label.

   Preference order for picking brewery_ja:

   - FIRST, look for a name ending in 酒造 (sake brewery), 醸造 (brewing), 酒造場, or 酒造店. These are unambiguous brewery suffixes. PREFER THESE EVEN WHEN PRINTED SMALLER than competing names — the prominent name may well be a retailer.
   - A name ending in 酒店 BY ITSELF (note: distinct from the three-character 酒造店) is ambiguous. Most are urban retailers (柴田屋酒店, 山仁酒店); a small number are mini-breweries with attached retail. WHEN YOU SEE X酒店 ALONGSIDE Y酒造 / Y醸造 ON THE SAME LABEL, THE BREWERY IS Y, NOT X. Only fall back to X酒店 for brewery_ja if no 酒造 / 醸造 name is visible anywhere on the label.
   - Names ending in 酒販店, 酒販, or リカーショップ are always retailers — exclude them outright. Never put them in brewery_ja.
   - The two-character 酒店 (酒 immediately followed by 店) is the retailer pattern. The three-character 酒造店 is a brewery — treat it the same as 酒造.

5. NEVER return a placeholder / sentinel value when you cannot read a field. The following are FORBIDDEN as field values:
   - 不明 / 不明な / 不詳 (Japanese for "unknown")
   - "unknown" / "n/a" / "N/A" / "未確認" / "—" / "?"
   - Empty strings (the schema rejects them anyway).
   If you genuinely cannot read the brand or brewery, return whatever IS legible — even a partial substring, even just Latin romaji, even a single character — and drop the confidence below 0.4. A partial-but-honest extraction is far more useful than "不明" because the downstream Sakenowa lookup can still try variants. A "不明" answer is identical to silence and dead-ends the visitor.

   Examples of preferred low-confidence partial extractions:
   - Label shows "Tanigawa Dake" Latin + small kanji you can't make out → name_ja: "Tanigawa Dake", brewery_ja: <whatever IS visible, even partial>, confidence: 0.4
   - Label shows "獺" but the rest of the brand kanji is blurred → name_ja: "獺", brewery_ja: <…>, confidence: 0.3
   - Label is a sake bottle but ALL text is unreadable → name_ja: <best Latin guess from shape or "?">, brewery_ja: <…>, confidence: 0.15

WHAT THE PHOTO SHOWS (subject). Decide this first:
   - one_bottle: one bottle (or its label) is the subject. A neighbouring bottle at the edge of the frame or on the shelf behind does not change this: read the bottle the photo is of.
   - several_bottles: two or more bottles share the frame and none is clearly the one being photographed. Read the most prominent one into the fields below.
   - menu: a menu, a drinks list, a shelf card or a price list — printed text naming drinks, not a bottle. Read the first or most prominent drink into the fields below.

WHAT THE DRINK IS (drink). Go by the words printed in the photo, not by the maker or the look of the bottle:
   - sake: the label prints 清酒, 日本酒, "Sake", or a sake grade (純米, 吟醸, 大吟醸, 本醸造 and their combinations).
   - shochu: the label prints 焼酎 (本格焼酎, 焼酎甲類, 焼酎乙類, 芋焼酎, 麦焼酎, 米焼酎) or "Shochu".
   - awamori: the label prints 泡盛 or "Awamori".
   - umeshu: the label prints 梅酒 or "Umeshu".
   - liqueur: the label prints リキュール or "Liqueur" (and is not umeshu).
   - other: the label prints another category — whisky, beer, wine, gin, mirin.
   - unknown: the photo prints none of these words. A front label with the name alone is unknown. Never guess a category from the brand or the brewery: many sake breweries also make shochu and umeshu, and shochu makers make sake.
   Whatever the drink is, still read its name and maker into name_ja and brewery_ja.

BREWERY PRINTED (brewery_printed). Say whether this photo prints the brewery's name, and decide it before you write brewery_ja:
   - true: the brewery's name is on the label in this photo, in any script, and brewery_ja is what you read there.
   - false: the photo does not print the brewery (a front label often shows the brand alone), or you cannot read it there, and brewery_ja is the brewery you know makes this brand.
   Being sure which brewery makes a sake does not make it printed. Answer true only for text you can point to in the photo. When it is false, still fill brewery_ja with your best knowledge.

OTHER NAMES (other_names). After choosing name_ja, list every OTHER name the label prints for this same sake, verbatim, one per entry, at most 5:
   - the product or sub-line name printed beside the brand — 縁 on a 勝山 label, 山ノ霞 on a 七賢 label, あわ咲き, "Awasaki", "Gold", "Barrel", "Wandering Poet". On an importer's back label the title line usually reads "Sake BRAND Product" (e.g. "Sake FUKUJU Awasaki Sparkling") or (PRODUCT NAME) "MAKER": put the brand in name_ja and the product words in other_names.
   - the same brand in another script — HANATOMOE or ハナトモエ beside 花巴, a small kana reading (furigana) beside brush kanji such as くろかぶと, the Latin spelling under the kanji.
   - any second large name on the label you did not choose as the brand.
   Do NOT list grades (純米吟醸, Junmai Daiginjo), rice varieties, polishing ratios, volume, alcohol, dates, the brewery, the importer, or slogans. Leave the list empty when the label prints no other name. The catalogue often lists a sub-line as its own sake, so these names decide which one the bottle is.

THIS BOTTLING (bottling). The brand names a family; the label usually says more about this one product. Fill in only what is printed in the photo and leave out the rest — an empty object is a fine answer:
   - product_name: the product or sub-line name beside the brand, verbatim, in the script it is printed in (一味, 縁, 山ノ霞, "Wandering Poet"). Not the brand again, not a grade, not a slogan. Where it is printed in both Japanese and Latin, give the Japanese.
   - grade: the grade the label prints — junmai_daiginjo (純米大吟醸), daiginjo (大吟醸), junmai_ginjo (純米吟醸), ginjo (吟醸), tokubetsu_junmai (特別純米), junmai (純米), tokubetsu_honjozo (特別本醸造), honjozo (本醸造), futsushu (普通酒, or 上撰 / 佳撰 with no grade). Latin spellings count ("Junmai Ginjo"). Leave it out when no grade is printed.
   - styles: each style word printed — nama (生酒, 生), namachozo (生貯蔵), namazume (生詰), genshu (原酒), muroka (無濾過), nigori (にごり), sparkling (スパークリング, 発泡), koshu (古酒, 熟成), kimoto (生酛), yamahai (山廃), taruzake (樽酒), kijoshu (貴醸酒), hiyaoroshi (ひやおろし).
   - polishing_ratio: the polishing ratio in percent where printed (精米歩合 60% → 60).

Return only what is visible on the label. Do not translate, do not romanise kanji into Latin, do not transliterate kana into kanji, do not invent any field. If the image is not a sake label at all, lower the confidence score significantly rather than producing a plausible-sounding guess.`

const USER_PROMPT =
  'Read this sake bottle label and return the brand and brewery, preserving the script each is actually printed in (kanji / katakana / hiragana / Latin), what the photo shows and what the drink is, whether the brewery is printed in the photo, the other names printed for the same sake, what the label says about this bottling, plus a confidence score between 0 and 1. Follow the brand / SKU stripping and script-preservation rules in the system prompt.'

/**
 * The prompts as sent, for the eval runner: a saved model read is only
 * reusable while the prompt it was made with is unchanged.
 */
export const LABEL_SCAN_PROMPTS = { system: SYSTEM_PROMPT, user: USER_PROMPT } as const

export function createAnthropicHaikuProvider(
  options: AnthropicHaikuProviderOptions = {},
): VisionProvider {
  const zdrActive = options.zdrActive ?? ZDR_ACTIVE
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  // The model is resolved lazily so a missing `ANTHROPIC_API_KEY` only
  // throws when the provider is actually used (tests don't need it).
  const model = options.model
  const telemetryMetadata = options.telemetryMetadata
  const effort = options.effort
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
      const resolvedModelId =
        typeof resolvedModel === 'object' &&
        resolvedModel !== null &&
        'modelId' in resolvedModel
          ? String((resolvedModel as { modelId: unknown }).modelId)
          : 'unknown'

      // Convert the JPEG blob to a Uint8Array. The AI SDK's `FilePart`
      // with `data: Uint8Array` is serialised by `@ai-sdk/anthropic`
      // into inline base64 in the `/v1/messages` request body — never
      // through `/v1/files`. The forbidden-pattern audit (`pnpm
      // anthropic-files:audit`) protects against any regression here.
      //
      // AI SDK 7 deprecated the `image` content part in favour of a
      // `file` part with an `image/*` media type. The replacement matters
      // beyond the deprecation warning: `FilePart.data` is now a tagged
      // union, and only `{ type: 'data' }` (raw bytes / base64) is
      // ZDR-eligible. `{ type: 'reference' }` is the Files-API upload
      // shape that CLAUDE.md forbids — `anthropic-haiku-provider.test.ts`
      // asserts the discriminant so a regression is caught in CI.
      const arrayBuffer = await jpegBlob.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)

      debugAdd('Vision', `calling ${resolvedModelId} with ${bytes.length} bytes of inline JPEG`, {
        mediaType: jpegBlob.type || 'image/jpeg',
        modelId: resolvedModelId,
      })

      const start = Date.now()
      const { object, usage } = await tracedGenerateObject(
        {
          functionId: 'scan-extract-label',
          metadata: {
            'model.id': resolvedModelId,
            ...telemetryMetadata,
          },
        },
        {
          model: resolvedModel,
          schema: LabelScanExtractionSchema,
          schemaName: 'LabelScanExtraction',
          schemaDescription:
            'Sake label extraction: name and brewery in original script, other names printed for the sake, plus confidence.',
          // The instructions are the same for every scan and are most of
          // the input (4,113 tokens of about 5,000; the photo is the
          // rest), so they are marked for Anthropic's prompt cache. A scan
          // within five minutes of another on the same model reads them
          // at a tenth of the price (a twentieth on Sonnet 5.5); a scan
          // after a quiet spell writes them at 1.25x. It pays once more
          // than about one scan in five is a hit — a visitor photographing
          // two sides of a bottle is enough.
          //
          // Measured 2026-10-13 over three fresh reads of 79 photos: 81%
          // of input tokens read from the cache; a tier-2 call costs about
          // $0.005 warm against $0.013 uncached, and $0.015 cold.
          //
          // The message form is load-bearing: a bare string cannot carry
          // `providerOptions`, and the marker would be dropped silently.
          // Minimum cacheable size for both 5.5 models is 512 tokens
          // (docs, 2026-10-13); the eval's cost line prints the tokens
          // read from the cache — zero there means it stopped working.
          instructions: {
            role: 'system',
            content: SYSTEM_PROMPT,
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } },
          },
          ...(effort ? { providerOptions: { anthropic: { effort } } } : {}),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: USER_PROMPT },
                {
                  type: 'file',
                  data: { type: 'data', data: bytes },
                  mediaType: jpegBlob.type || 'image/jpeg',
                },
              ],
            },
          ],
        },
      )
      const elapsedMs = Date.now() - start
      options.onUsage?.({
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
      })

      // `generateObject` already runs the schema parse, so `object` is
      // semantically `LabelScanExtraction`. The traced wrapper returns
      // `unknown` (AI SDK 7's overload union loses precision when piped
      // through `Parameters<>` / `ReturnType<>`), so we re-parse here to
      // recover the type AND keep the documented contract of this method
      // ("returns a value that has passed LabelScanExtractionSchema.parse").
      const extraction = LabelScanExtractionSchema.parse(object)

      debugAdd('Vision', `model returned in ${elapsedMs}ms`, {
        name_ja: extraction.name_ja,
        brewery_ja: extraction.brewery_ja,
        subject: extraction.subject,
        drink: extraction.drink,
        brewery_printed: extraction.brewery_printed,
        other_names: extraction.other_names,
        bottling: extraction.bottling,
        confidence: extraction.confidence,
      })

      return extraction
    },
  }
}
