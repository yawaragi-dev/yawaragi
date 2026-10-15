import 'server-only'

import type { LanguageModel } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { cookies } from 'next/headers'
import { env } from '@/env'
import { debugAdd } from '@/lib/debug/debug-log'
import { tracedGenerateObject } from '@/lib/ai/observability/langfuse-trace'
import {
  ListScanExtractionSchema,
  type ListScanExtraction,
} from '@/lib/schemas/list-scan-extraction'
import type { AnthropicHaikuProviderOptions } from './anthropic-haiku-provider'

/**
 * Reads a whole drinks list off one photo — a menu, or a shelf of bottles —
 * for design v1.7 §7. A second vision surface beside the label scan, not a
 * mode of it: the label scan returns one read, this returns every line, and
 * neither prompt would survive being merged into the other.
 *
 * The photo is the one the visitor already took for the scan; it goes inline
 * as base64 on /v1/messages exactly as the label photo does (never the Files
 * API — `pnpm anthropic-files:audit`), and is discarded after the call.
 */
export interface ListReader {
  /** `kind` is what the label scan said the photo is; the model may still answer the other. */
  readList(jpegBlob: Blob, kind: 'menu' | 'shelf'): Promise<ListScanExtraction>
}

const SYSTEM_PROMPT = `You read a whole list of drinks off one photo, so that each sake on it can be looked up in a sake catalogue and ranked for the person holding the phone. The photo is either a MENU (a printed or handwritten drinks list, a blackboard, a shelf card with several drinks) or a SHELF (bottles standing side by side: a shop shelf, a fridge, a bar counter, a tasting flight of three bottles).

Return every drink whose name you can read, in list order: a menu top to bottom, column by column in the order a reader would go (for vertical Japanese text, right to left); a shelf left to right, top shelf first. One entry per drink. A menu that prints one sake in two sizes is still one line. A shelf with two bottles of the same sake standing together is one line.

For each line:
- printed: the line's name part exactly as printed — brand, product name, grade and style words — without the price, the volume or a description sentence. "秋鹿 奥鹿 純米 山廃", "李白 純米吟醸 Wandering Poet", "Dassai 45".
- name_ja: the brand (銘柄) alone, in the script it is printed in, with grade words (純米大吟醸, 大吟醸, 純米吟醸, 吟醸, 特別純米, 純米, 本醸造, 特別本醸造), polishing markers (磨き45, 精米歩合50%) and style words (無濾過, 生, 生酒, 原酒, ひやおろし, 山廃, 生酛, にごり, 古酒) stripped: "秋鹿". Keep kana and Latin brands in kana and Latin; never turn kana or Latin into kanji you did not read. When a line names the brewery first and then the brand (寺田本家 香取90), name_ja is the brand (香取90 → 香取) and the brewery goes in brewery_ja.
- name_romaji: name_ja in Latin letters — the list's own spelling where it prints one, else Hepburn with macrons and a capital first letter (秋鹿 → Akishika).
- brewery_printed: true only if the list prints this drink's brewery. On a shelf the bottle's own label counts when you can read it there.
- brewery_ja: the brewery as printed, with 株式会社 / 有限会社 / 合同会社 stripped. When it is not printed and you know which brewery makes this brand, give that brewery and set brewery_printed false. Leave it out when you do not know.
- other_names: the product name and the brand in any other script the line prints (奥鹿; AKISHIKA beside 秋鹿). Not grades, not rice, not the brewery. At most 4.
- product_name: the product or sub-line name beside the brand, as printed (奥鹿, 甲子, 香取90, "Wandering Poet"). Leave out if there is none.
- product_name_romaji: product_name in Latin letters, by the name_romaji rule (奥鹿 → Okuharuka, 甲子 → Kinoene). Leave out when there is no product_name.
- grade: junmai_daiginjo, daiginjo, junmai_ginjo, ginjo, tokubetsu_junmai, junmai, tokubetsu_honjozo, honjozo or futsushu — only if printed on the line.
- styles: each printed style word — nama (生酒, 生), namachozo (生貯蔵), namazume (生詰), genshu (原酒), muroka (無濾過), nigori (にごり), sparkling (スパークリング, 発泡), koshu (古酒, 熟成), kimoto (生酛), yamahai (山廃), taruzake (樽酒), kijoshu (貴醸酒), hiyaoroshi (ひやおろし).
- drink: sake (日本酒, 清酒, a sake grade, or a sake brand under a sake heading), shochu (焼酎, 芋, 麦, 米焼酎 under a shochu heading), awamori (泡盛), umeshu (梅酒), liqueur (リキュール, 果実酒), other (beer, wine, whisky, highball, sour, soft drinks), unknown (a name alone with nothing to tell). A section heading counts for every line under it: under 日本酒 every line is sake, under 焼酎 every line is shochu. Never guess the drink from the maker: many sake breweries make shochu too.
- craft: true when the line is marked craft sake (クラフトサケ, "Craft Sake"); still drink: sake.
- price: on a menu, the price of one glass (グラス, 一合, 90ml, 120ml — the smallest serving printed) as a plain number in the list's currency: "¥1,100" → 1100, "€9,50" → 9.5. Leave it out on a shelf, and when no price is printed or you cannot read it.
- warm: true when the menu offers this drink warm — 燗, お燗, 熱燗, ぬる燗, 燗酒 printed on the line or as a column it is marked in, or a "hot" / "warm" option. Leave it out otherwise.
- partly_read: true when you read the name but part of the line is cut off at the edge, blurred or behind glare, so a grade or price may be missing. Leave it out when you read the whole line.

A brewery's own menu, price list or tasting sheet often prints its brand once — as a heading, a logo or the brewery's name at the top — and then lists its products under it (大吟醸, 吟醸生酒, ひやおろし, 囲, 天下山麓富士の山). Every one of those lines is that brand: put the brand in name_ja, the product words in product_name, and the brewery in brewery_ja (brewery_printed true when it is printed). A grade or style word alone (大吟醸, 生原酒, 純米甘口) is never a brand.

Count every line or bottle whose NAME you cannot read at all — cut off, blurred, turned away, too far, behind glare — in unreadable_count, and do not return a line for it. Never invent a name for one; a guessed name sends the person to the wrong sake. A shelf's price tags, empty shelf space and decoration are not lines.

kind: menu or shelf, as above. A brewery's own tasting sheet or price list is a menu; read only the names from it. A tasting flight of glasses with bottles behind them is a shelf.

currency: the currency the menu's prices are printed in (JPY for ¥ or 円, EUR, USD, GBP, CHF, other). Leave it out when no price is printed.

confidence: how sure you are of the names overall, between 0 and 1.

Return only what the photo shows. Do not add drinks you expect on such a list, do not translate, and do not fill a field you did not read — except brewery_ja with brewery_printed false and name_romaji, which are your readings.`

const USER_PROMPT_BY_KIND = {
  menu: 'This photo looks like a menu. Read every drink on it in menu order, following the rules in the system prompt.',
  shelf: 'This photo looks like a shelf of bottles. Read every bottle on it from left to right, following the rules in the system prompt.',
} as const

/** The prompts as sent, for the eval runner: a saved read is reusable only while they are unchanged. */
export const LIST_READ_PROMPTS = { system: SYSTEM_PROMPT, user: USER_PROMPT_BY_KIND } as const

export type ListReaderOptions = Pick<
  AnthropicHaikuProviderOptions,
  'model' | 'effort' | 'onUsage' | 'telemetryMetadata'
>

export function createAnthropicListReader(options: ListReaderOptions = {}): ListReader {
  return {
    async readList(jpegBlob, kind) {
      const model: LanguageModel = options.model ?? anthropic(LIST_READER_MODEL)
      const modelId =
        typeof model === 'object' && model !== null && 'modelId' in model
          ? String((model as { modelId: unknown }).modelId)
          : String(model)
      const bytes = new Uint8Array(await jpegBlob.arrayBuffer())
      debugAdd('ListReader', `calling ${modelId} with ${bytes.length} bytes of inline JPEG`, { kind })

      const start = Date.now()
      const { object, usage } = await tracedGenerateObject(
        {
          functionId: 'scan-read-list',
          metadata: { 'model.id': modelId, 'list.kind': kind, ...options.telemetryMetadata },
        },
        {
          model,
          schema: ListScanExtractionSchema,
          schemaName: 'ListScanExtraction',
          schemaDescription: 'Every drink readable on a menu or shelf photo, in list order.',
          // The same instructions on every read and most of the input, so
          // they are marked for the prompt cache, as the label scan's are.
          // The message form carries the marker; a bare string would drop it.
          instructions: {
            role: 'system',
            content: SYSTEM_PROMPT,
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } },
          },
          ...(options.effort ? { providerOptions: { anthropic: { effort: options.effort } } } : {}),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: USER_PROMPT_BY_KIND[kind] },
                { type: 'file', data: { type: 'data', data: bytes }, mediaType: jpegBlob.type || 'image/jpeg' },
              ],
            },
          ],
        },
      )
      options.onUsage?.({
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
      })
      const extraction = ListScanExtractionSchema.parse(object)
      debugAdd('ListReader', `model returned in ${Date.now() - start}ms`, {
        kind: extraction.kind,
        lines: extraction.lines.length,
        unreadable: extraction.unreadable_count,
      })
      return extraction
    },
  }
}

/**
 * The model that reads lists, and how hard it thinks. Pinned like the label
 * scan's (CLAUDE.md "Model versions"); chosen on `pnpm eval list-read-jp`
 * (2026-10-15, 49 menu and shelf photos): Sonnet 5.5 at low effort found as
 * many sakes as at its default effort on the probe photo in a quarter of the
 * time — a median of about 4 s against §7's "5–10 s" — at about $0.013 a read.
 */
export const LIST_READER_MODEL = 'claude-sonnet-5-5'
export const LIST_READER_EFFORT = 'low' as const

/** Cookie the Playwright specs set to inject a list read (base64 JSON, the schema's shape minus `source`). */
export const E2E_LIST_COOKIE = 'yawaragi_e2e_list'

/**
 * The fixed read the e2e stub returns: a short menu with a sake the
 * catalogue has (獺祭), one it has twice under one name (李白, as two
 * bottlings), one no catalogue has (a made-up name), and a shochu.
 */
const STUB_LIST: Omit<ListScanExtraction, 'source'> = {
  kind: 'menu',
  currency: 'JPY',
  unreadable_count: 1,
  lines: [
    { printed: '獺祭 純米大吟醸 45', name_ja: '獺祭', name_romaji: 'Dassai', brewery_printed: false, brewery_ja: '旭酒造', grade: 'junmai_daiginjo', drink: 'sake', price: 1200 },
    { printed: '李白 純米吟醸 Wandering Poet', name_ja: '李白', name_romaji: 'Rihaku', brewery_printed: false, brewery_ja: '李白酒造', product_name: 'Wandering Poet', product_name_romaji: 'Wandering Poet', grade: 'junmai_ginjo', drink: 'sake', price: 1100, warm: true },
    { printed: '李白 特別純米 超辛口', name_ja: '李白', name_romaji: 'Rihaku', brewery_printed: false, brewery_ja: '李白酒造', grade: 'tokubetsu_junmai', drink: 'sake', price: 950 },
    { printed: '架空ノ月 純米', name_ja: '架空ノ月', name_romaji: 'Kakū no Tsuki', drink: 'sake', grade: 'junmai', price: 800 },
    { printed: 'いいちこ', name_ja: 'いいちこ', name_romaji: 'Iichiko', drink: 'shochu', price: 600 },
  ],
}

function createE2eStubListReader(): ListReader {
  return {
    async readList(jpegBlob, kind) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('e2e-stub list reader is not allowed in production.')
      }
      if (jpegBlob.size === 0) throw new Error('e2e-stub: empty image blob')
      let injected: unknown = null
      try {
        const raw = (await cookies()).get(E2E_LIST_COOKIE)?.value
        if (raw) injected = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
      } catch {
        injected = null
      }
      const parsed = ListScanExtractionSchema.safeParse({ ...(injected as object | null ?? STUB_LIST), source: 'llm_extracted' })
      const extraction = parsed.success
        ? parsed.data
        : ListScanExtractionSchema.parse({ ...STUB_LIST, kind, source: 'llm_extracted' })
      debugAdd('ListReader', `e2e-stub: returning ${parsed.success && injected ? 'INJECTED' : 'fixed'} list (no model call)`, {
        lines: extraction.lines.length,
      })
      return extraction
    },
  }
}

/**
 * The list reader for the running environment: the e2e stub whenever the
 * label scan runs on it (`VISION_PROVIDER=e2e-stub`), so the Playwright specs
 * never reach the paid model; otherwise the pinned model.
 */
export function getListReader(): ListReader {
  if (env.VISION_PROVIDER === 'e2e-stub') return createE2eStubListReader()
  return createAnthropicListReader({ effort: LIST_READER_EFFORT, telemetryMetadata: { 'provider.key': LIST_READER_MODEL } })
}
