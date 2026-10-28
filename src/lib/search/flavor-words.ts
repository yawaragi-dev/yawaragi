import type { Locale } from '@/i18n/routing'

/**
 * Flavor words for §8 Search (design v1.8 M3, #451): the English and German
 * words a visitor might type for each of Sakenowa's flavor tags, so that
 * "grapefruit" or "Grapefruit" finds the sakes Sakenowa drinkers tagged
 * グレープフルーツ.
 *
 * **DRAFT — every line needs the maintainer's review before merge.** The
 * words were drafted by engineering (Claude) on 2026-10-28 from Sakenowa's
 * public `GET /flavor-tags` list (141 tags, fetched that day); the tag ids
 * and their Japanese spellings are copied from it verbatim. Nothing here was
 * checked against a dictionary or a native speaker yet. Source of the words:
 * `manual_curation` (CLAUDE.md "Source provenance"); the tags themselves, and
 * which sakes carry them, are `sakenowa`.
 *
 * How an entry reads:
 * - `tags` — the Sakenowa tag(s) the words stand for, as `[id, kanji]`. More
 *   than one when Sakenowa spells one flavor two ways (キャラメル, カラメル) or
 *   when the English word covers several tags (heavy: 重い, どっしり, ずっしり).
 *   A sake carrying any of them is listed; its row names the first it carries.
 * - `en` / `de` — the words to type, the main one first: that is the word the
 *   row shows, "Tagged グレープフルーツ (grapefruit)", in the page's language.
 *   Matching ignores case, accents, quotes and hyphens and takes the whole
 *   query only, so "grapefruit sake" is a name search.
 *
 * Every word means one entry across both languages (a test holds this). The
 * kanji itself is not a search word: 桜 or 花 typed in Japanese is far more
 * often part of a sake's name.
 *
 * **Left out on purpose** (no word a visitor would type, or not a flavor):
 * - Drinking pace, which JMStV-minded copy should not invite: スイスイ, するする,
 *   ゴクゴク, グイグイ, ちびちび.
 * - An effect or a judgement rather than a taste: 落ち着く (calming), 心地よい
 *   (pleasant), 安定 (dependable), じっくり (slowly), じわじわ (spreading slowly),
 *   ひろがる (spreading).
 * - Brand names: ヤクルト (Yakult), カルピス (Calpis).
 * - No clear English or German word, or one already taken by a nearer tag:
 *   あっさり, 厚み, さらり, 豊か, まったり, みずみずしい, ふっくら, 甘辛い,
 *   アミノ酸, 燗冷まし.
 */

export interface FlavorWordEntry {
  readonly tags: readonly (readonly [id: number, kanji: string])[]
  readonly en: readonly string[]
  readonly de: readonly string[]
}

export const FLAVOR_WORDS: readonly FlavorWordEntry[] = [
  // ── Fruit ────────────────────────────────────────────────────────────
  { tags: [[6, 'フルーティ'], [192, '果物']], en: ['fruity', 'fruit'], de: ['fruchtig', 'Frucht', 'Obst'] },
  { tags: [[109, 'グレープフルーツ']], en: ['grapefruit'], de: ['Grapefruit'] },
  { tags: [[52, '柑橘']], en: ['citrus', 'citrusy'], de: ['Zitrus', 'zitrisch', 'Zitrusfrucht'] },
  { tags: [[226, 'レモン']], en: ['lemon'], de: ['Zitrone'] },
  { tags: [[206, 'オレンジ']], en: ['orange'], de: ['Orange'] },
  { tags: [[42, 'メロン']], en: ['melon'], de: ['Melone'] },
  { tags: [[45, 'リンゴ']], en: ['apple', 'apples'], de: ['Apfel', 'Äpfel'] },
  { tags: [[202, '洋梨'], [75, '梨']], en: ['pear', 'pears'], de: ['Birne', 'Birnen'] },
  { tags: [[75, '梨']], en: ['nashi', 'asian pear'], de: ['Nashi', 'Nashibirne'] },
  { tags: [[69, 'バナナ']], en: ['banana'], de: ['Banane'] },
  { tags: [[89, 'ブドウ']], en: ['grape', 'grapes'], de: ['Traube', 'Trauben', 'Weintraube'] },
  { tags: [[93, 'マスカット']], en: ['muscat'], de: ['Muskateller'] },
  { tags: [[97, '桃']], en: ['peach'], de: ['Pfirsich'] },
  { tags: [[147, 'パイナップル']], en: ['pineapple'], de: ['Ananas'] },
  { tags: [[165, 'ライチ']], en: ['lychee', 'litchi'], de: ['Litschi'] },
  { tags: [[213, 'いちご']], en: ['strawberry'], de: ['Erdbeere'] },
  { tags: [[211, 'プラム']], en: ['plum'], de: ['Pflaume'] },
  { tags: [[240, 'プルーン']], en: ['prune'], de: ['Backpflaume', 'Dörrpflaume'] },
  { tags: [[44, 'レーズン']], en: ['raisin', 'raisins'], de: ['Rosine', 'Rosinen'] },
  { tags: [[239, 'トロピカル']], en: ['tropical'], de: ['tropisch'] },
  { tags: [[67, 'ジューシー']], en: ['juicy'], de: ['saftig'] },
  { tags: [[119, 'ジュース']], en: ['juice'], de: ['Saft'] },

  // ── Flowers, herbs, spice ────────────────────────────────────────────
  // 華やか is also the f1 axis (Floral / Blumig); the tag is what drinkers
  // wrote, the axis Sakenowa's computed score. Same word, as in the chart.
  { tags: [[26, '華やか']], en: ['floral'], de: ['blumig'] },
  { tags: [[71, '花']], en: ['flowers', 'flower', 'flowery'], de: ['Blüten', 'Blüte', 'Blumen'] },
  { tags: [[145, '桜']], en: ['cherry blossom', 'sakura'], de: ['Kirschblüte'] },
  { tags: [[216, '芳香']], en: ['aromatic', 'fragrant'], de: ['aromatisch', 'duftend'] },
  { tags: [[175, 'ハーブ']], en: ['herbal', 'herbs'], de: ['Kräuter', 'kräuterig'] },
  { tags: [[224, 'スパイシー'], [172, 'スパイス']], en: ['spicy', 'spice', 'spices'], de: ['würzig', 'Gewürz', 'Gewürze'] },

  // ── Sweet things, dairy, roast ───────────────────────────────────────
  { tags: [[12, '甘味']], en: ['sweet', 'sweetness'], de: ['süß', 'Süße'] },
  { tags: [[63, '甘酸っぱい']], en: ['sweet and sour', 'sweet sour', 'sweet tart'], de: ['süßsauer'] },
  { tags: [[29, 'キャラメル'], [139, 'カラメル']], en: ['caramel'], de: ['Karamell'] },
  { tags: [[152, 'ハチミツ'], [150, '蜜']], en: ['honey'], de: ['Honig'] },
  { tags: [[150, '蜜']], en: ['nectar'], de: ['Nektar'] },
  { tags: [[185, '飴']], en: ['candy', 'hard candy'], de: ['Bonbon'] },
  { tags: [[197, '砂糖']], en: ['sugar', 'sugary'], de: ['Zucker'] },
  { tags: [[121, 'ラムネ']], en: ['ramune', 'lemonade'], de: ['Limonade', 'Brause'] },
  { tags: [[128, 'チョコレート']], en: ['chocolate'], de: ['Schokolade'] },
  { tags: [[204, 'コーヒー']], en: ['coffee'], de: ['Kaffee'] },
  { tags: [[118, 'ナッツ']], en: ['nutty', 'nuts', 'nut'], de: ['nussig', 'Nüsse', 'Nuss'] },
  { tags: [[212, '栗']], en: ['chestnut'], de: ['Kastanie', 'Marone'] },
  { tags: [[193, '香ばしい']], en: ['toasty', 'roasted', 'toasted'], de: ['röstig', 'geröstet'] },
  { tags: [[174, 'スモーキー']], en: ['smoky', 'smokey'], de: ['rauchig'] },
  { tags: [[72, 'ヨーグルト']], en: ['yogurt', 'yoghurt'], de: ['Joghurt'] },
  { tags: [[173, 'ミルク']], en: ['milky', 'milk'], de: ['milchig', 'Milch'] },
  { tags: [[137, 'チーズ']], en: ['cheese', 'cheesy'], de: ['Käse'] },
  { tags: [[149, 'クリーミー']], en: ['creamy'], de: ['cremig'] },
  { tags: [[16, '穀物']], en: ['grain', 'grainy', 'cereal'], de: ['Getreide', 'getreidig'] },
  { tags: [[209, '味噌']], en: ['miso'], de: ['Miso'] },
  { tags: [[199, '醤油']], en: ['soy sauce', 'soy'], de: ['Sojasauce', 'Sojasoße'] },

  // ── Like another drink ───────────────────────────────────────────────
  { tags: [[27, 'ワイン']], en: ['wine', 'winey', 'wine like'], de: ['Wein', 'weinig'] },
  { tags: [[217, 'シャンパン']], en: ['champagne'], de: ['Champagner'] },
  { tags: [[84, 'ラム']], en: ['rum'], de: ['Rum'] },
  { tags: [[159, '紹興酒']], en: ['shaoxing', 'shaoxing wine'], de: ['Shaoxingwein', 'Shaoxing-Wein'] },
  { tags: [[182, 'セメダイン']], en: ['solvent', 'glue', 'nail polish'], de: ['Lösungsmittel', 'Klebstoff', 'Nagellack'] },

  // ── Taste ────────────────────────────────────────────────────────────
  { tags: [[3, '辛口']], en: ['dry'], de: ['trocken'] },
  { tags: [[2, '酸味']], en: ['acidity', 'acidic', 'sour', 'tart'], de: ['Säure', 'sauer', 'säuerlich'] },
  { tags: [[5, '旨味']], en: ['umami', 'savory', 'savoury'], de: ['Umami', 'herzhaft'] },
  { tags: [[17, '苦味']], en: ['bitter', 'bitterness'], de: ['bitter', 'Bitterkeit'] },
  { tags: [[146, '渋み']], en: ['astringent', 'astringency'], de: ['herb', 'adstringierend'] },
  { tags: [[98, 'ツン']], en: ['pungent'], de: ['stechend'] },
  { tags: [[241, 'ピリリ']], en: ['tingly', 'tingling'], de: ['kribbelnd'] },

  // ── Weight and texture ───────────────────────────────────────────────
  // 芳醇, 穏やか and 軽快 are also chart axes (Mellow, Mild, Light); the words
  // match the chart's.
  { tags: [[73, '芳醇']], en: ['mellow'], de: ['vollmundig'] },
  { tags: [[30, '穏やか'], [167, 'マイルド']], en: ['mild'], de: ['mild'] },
  { tags: [[126, '軽快']], en: ['light'], de: ['leicht'] },
  { tags: [[34, '濃厚'], [176, 'こってり']], en: ['rich', 'full bodied'], de: ['reichhaltig', 'üppig'] },
  { tags: [[19, 'コク']], en: ['body', 'depth of flavor'], de: ['Körper', 'gehaltvoll'] },
  { tags: [[140, '深み']], en: ['depth', 'deep'], de: ['Tiefe', 'tief'] },
  { tags: [[104, '重い'], [88, 'どっしり'], [237, 'ずっしり']], en: ['heavy'], de: ['schwer'] },
  { tags: [[9, 'しっかり']], en: ['firm', 'solid'], de: ['fest', 'solide'] },
  { tags: [[163, '硬い']], en: ['hard'], de: ['hart'] },
  { tags: [[61, '力強い']], en: ['powerful', 'robust'], de: ['kraftvoll', 'kräftig'] },
  { tags: [[56, 'ふくよか']], en: ['full', 'ample'], de: ['füllig'] },
  { tags: [[90, '複雑']], en: ['complex'], de: ['komplex', 'vielschichtig'] },
  { tags: [[20, 'バランス']], en: ['balanced', 'balance'], de: ['ausgewogen', 'Balance'] },
  { tags: [[25, 'まろやか'], [186, '円やか'], [188, '丸み']], en: ['round', 'rounded'], de: ['rund', 'abgerundet'] },
  { tags: [[95, 'なめらか']], en: ['smooth', 'silky'], de: ['geschmeidig', 'samtig'] },
  { tags: [[40, '柔らかい']], en: ['soft'], de: ['weich'] },
  { tags: [[32, '優しい']], en: ['gentle'], de: ['sanft'] },
  { tags: [[33, '淡い']], en: ['delicate', 'pale'], de: ['zart'] },
  { tags: [[22, 'ほのか']], en: ['subtle', 'faint'], de: ['dezent', 'dezente'] },
  { tags: [[131, '控えめ']], en: ['restrained', 'understated'], de: ['zurückhaltend'] },
  { tags: [[50, '薄い']], en: ['thin', 'watery'], de: ['dünn', 'wässrig'] },
  { tags: [[106, 'とろみ']], en: ['viscous', 'thick', 'syrupy'], de: ['dickflüssig', 'sämig'] },
  { tags: [[113, 'ふんわり']], en: ['airy', 'fluffy'], de: ['luftig'] },

  // ── Clean, crisp, fresh ──────────────────────────────────────────────
  { tags: [[7, 'スッキリ']], en: ['clean'], de: ['sauber', 'klar'] },
  { tags: [[235, '透き通る']], en: ['clear', 'transparent'], de: ['durchsichtig', 'transparent'] },
  { tags: [[24, '綺麗']], en: ['pure', 'pristine'], de: ['rein'] },
  { tags: [[169, '上品']], en: ['elegant', 'refined'], de: ['elegant', 'fein'] },
  { tags: [[23, 'キレ']], en: ['crisp', 'crisp finish', 'clean finish'], de: ['knackig', 'klarer Abgang'] },
  { tags: [[154, 'シャープ']], en: ['sharp'], de: ['pointiert'] },
  { tags: [[242, 'キリリ']], en: ['brisk'], de: ['straff'] },
  { tags: [[100, 'さわやか'], [21, 'さっぱり'], [223, '爽快'], [222, '清涼']], en: ['refreshing'], de: ['erfrischend'] },
  { tags: [[48, 'フレッシュ']], en: ['fresh'], de: ['frisch'] },
  { tags: [[123, '若い']], en: ['young'], de: ['jung'] },
  { tags: [[187, '鮮烈']], en: ['vivid'], de: ['lebhaft'] },
  { tags: [[184, '派手']], en: ['showy', 'flashy'], de: ['auffällig'] },
  { tags: [[170, '荒々しい']], en: ['rough', 'wild'], de: ['rau', 'wild'] },
  { tags: [[195, '昔ながら']], en: ['traditional', 'old fashioned', 'classic'], de: ['traditionell', 'klassisch'] },
  { tags: [[80, 'ガス'], [225, 'ピチピチ'], [228, 'プチプチ']], en: ['fizzy', 'sparkling', 'bubbly'], de: ['prickelnd', 'spritzig', 'perlend'] },

  // ── Finish ───────────────────────────────────────────────────────────
  { tags: [[38, '余韻']], en: ['lingering', 'long finish', 'finish', 'aftertaste'], de: ['Nachklang', 'Abgang', 'langer Abgang'] },

  // ── Serving temperature (drinkers tag these too) ─────────────────────
  { tags: [[51, '燗酒'], [43, '熱燗']], en: ['warm', 'warmed', 'good warm'], de: ['warm', 'erwärmt'] },
  { tags: [[43, '熱燗']], en: ['hot'], de: ['heiß'] },
  { tags: [[65, '冷酒']], en: ['chilled', 'cold'], de: ['gekühlt', 'kalt'] },
  { tags: [[36, '常温']], en: ['room temperature'], de: ['Zimmertemperatur', 'zimmerwarm'] },
]

/** A typed flavor word, resolved to the Sakenowa tags it stands for. */
export interface FlavorWordMatch {
  readonly tags: readonly { readonly tagId: number; readonly kanji: string }[]
  /** The entry's main word in the page's language: "(grapefruit)". */
  readonly word: string
  /** The word is our translation; the tags and their sakes are Sakenowa's. */
  readonly source: 'manual_curation'
}

/**
 * What a query and a dictionary word are compared as: lower case, no accents
 * (ß as ss, so "süß" and "süss" meet), no quotes, hyphens as spaces, one
 * space between words.
 */
export function normalizeFlavorQuery(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/["'“”„‚‘’«»]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ENTRY_BY_TERM: ReadonlyMap<string, FlavorWordEntry> = new Map(
  FLAVOR_WORDS.flatMap((entry) => [...entry.en, ...entry.de].map((term) => [normalizeFlavorQuery(term), entry] as const)),
)

/**
 * The tags a typed query names, when the whole query is one of the words
 * above in English or German (either, whatever the page language). `null`
 * otherwise, and the query is a name search only.
 */
export function matchFlavorWord(query: string, locale: Locale): FlavorWordMatch | null {
  const normalized = normalizeFlavorQuery(query)
  if (normalized.length === 0) return null
  const entry = ENTRY_BY_TERM.get(normalized)
  if (!entry) return null
  return {
    tags: entry.tags.map(([tagId, kanji]) => ({ tagId, kanji })),
    word: (locale === 'de' ? entry.de : entry.en)[0],
    source: 'manual_curation',
  }
}
