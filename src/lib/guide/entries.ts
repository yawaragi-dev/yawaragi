import { type GuideEntry, type GuideGroup, GuideEntrySchema, type GuideSource } from '@/lib/schemas/guide-entry'

/**
 * The entries of "Learn" (design v1.6 §18, ADR-0026), in the order the index
 * lists them. Structure only — the words are in `messages/{en,de}.json` under
 * `learn.entries.<slug>`; `entries.test.ts` checks the two agree.
 *
 * **Every fact is hand-written from the sources named on its entry**
 * (`manual_curation`). To add or change one: read the source, write the entry
 * in both languages, set `verifiedOn` to the day you checked. Do not paste in
 * model-written text, and do not state a number the source does not.
 *
 * Where the sources disagree, the entry says so rather than picking one:
 * koshu has no legal minimum age, and the makers' own glossary and guide give
 * two and three years.
 */

// The sources most entries lean on, named once.
const GUIDE: GuideSource = {
  label:
    'Japan Sake and Shochu Makers Association and National Research Institute of Brewing, “A Comprehensive Guide to Japanese Sake” (2011)',
  url: 'https://www.nrib.go.jp/English/sake/pdf/guidesse01.pdf',
}
const NRIB_VARIETIES: GuideSource = {
  label: 'National Research Institute of Brewing, “Sake Essentials: Varieties”',
  url: 'https://www.nrib.go.jp/English/sake_info/sake-essentials/varieties/',
}
const JSS_GLOSSARY: GuideSource = {
  label: 'Japan Sake and Shochu Makers Association, “Glossary of Sake Terms”',
  url: 'https://japansake.or.jp/sake/en/basic/glossary/',
}
const JSS_BREWING: GuideSource = {
  label: 'Japan Sake and Shochu Makers Association, “Sake Brewing Processes and Flavor”',
  url: 'https://japansake.or.jp/sake/en/professional/sake-brewing-processes-flavor/',
}
const NTA_2022: GuideSource = {
  label: 'National Tax Agency, Notice No. 30 of 19 July 2022 (revision of the sake labelling standard)',
  url: 'https://www.nta.go.jp/law/kokuji/220729/01.htm',
}

const VERIFIED = '2026-10-11'

const ENTRIES = [
  {
    slug: 'how-to-read-a-label',
    group: 'start',
    kanji: null,
    romaji: null,
    facts: [
      { id: 'name', kanji: '銘柄', romaji: 'meigara' },
      { id: 'type', kanji: '清酒 · 日本酒', romaji: 'seishu · nihonshu' },
      { id: 'grade', kanji: '純米吟醸', romaji: 'junmai ginjō' },
      { id: 'polishing', kanji: '精米歩合', romaji: 'seimai-buai' },
      { id: 'ingredients', kanji: '原材料名', romaji: 'genzairyō-mei' },
      { id: 'alcohol', kanji: 'アルコール分', romaji: 'arukōru-bun' },
      { id: 'volume', kanji: '内容量', romaji: 'naiyōryō' },
      { id: 'date', kanji: '製造年月', romaji: 'seizō nengetsu' },
      { id: 'maker', kanji: '製造者', romaji: 'seizōsha' },
      { id: 'styles', kanji: '生 · 原酒 · 無濾過 · 山廃' },
    ],
    paragraphs: 2,
    related: ['grades', 'polishing-ratio', 'nama', 'yeast-starters'],
    sources: [GUIDE, NTA_2022],
  },
  {
    slug: 'grades',
    group: 'grades',
    kanji: '特定名称酒',
    romaji: 'tokutei meishō-shu',
    facts: [
      { id: 'junmai', kanji: '純米酒' },
      { id: 'tokubetsuJunmai', kanji: '特別純米酒' },
      { id: 'junmaiGinjo', kanji: '純米吟醸酒', note: false },
      { id: 'junmaiDaiginjo', kanji: '純米大吟醸酒', note: false },
      { id: 'honjozo', kanji: '本醸造酒' },
      { id: 'tokubetsuHonjozo', kanji: '特別本醸造酒', note: false },
      { id: 'ginjo', kanji: '吟醸酒' },
      { id: 'daiginjo', kanji: '大吟醸酒' },
    ],
    paragraphs: 3,
    related: ['junmai', 'ginjo', 'honjozo', 'polishing-ratio'],
    sources: [GUIDE, NRIB_VARIETIES],
  },
  {
    slug: 'junmai',
    group: 'grades',
    kanji: '純米',
    romaji: 'junmai',
    facts: [
      { id: 'ingredients', kanji: '米 · 米こうじ' },
      { id: 'polishing', kanji: '精米歩合' },
      { id: 'alcohol', kanji: '醸造アルコール', note: false },
    ],
    paragraphs: 2,
    related: ['grades', 'ginjo', 'honjozo'],
    sources: [GUIDE, JSS_GLOSSARY],
  },
  {
    slug: 'ginjo',
    group: 'grades',
    kanji: '吟醸 · 大吟醸',
    romaji: 'ginjō · daiginjō',
    facts: [
      { id: 'ginjo', kanji: '吟醸', note: false },
      { id: 'daiginjo', kanji: '大吟醸', note: false },
      { id: 'method', kanji: '吟醸造り', romaji: 'ginjō-zukuri' },
      { id: 'alcohol', kanji: '醸造アルコール' },
      { id: 'aroma', kanji: '吟醸香', romaji: 'ginjō-ka' },
    ],
    paragraphs: 2,
    related: ['grades', 'polishing-ratio', 'junmai', 'sake-rice'],
    sources: [
      GUIDE,
      NRIB_VARIETIES,
      {
        label: 'National Tax Agency, “Sake tasting sheet” (description of ginjō, junmai and honjōzō sake)',
        url: 'https://www.nta.go.jp/english/taxes/liquor_administration/data/01.pdf',
      },
    ],
  },
  {
    slug: 'honjozo',
    group: 'grades',
    kanji: '本醸造',
    romaji: 'honjōzō',
    facts: [
      { id: 'polishing', kanji: '精米歩合', note: false },
      { id: 'alcohol', kanji: '醸造アルコール', romaji: 'jōzō arukōru' },
      { id: 'tokubetsu', kanji: '特別本醸造' },
    ],
    paragraphs: 2,
    related: ['grades', 'junmai', 'ginjo'],
    sources: [GUIDE, NRIB_VARIETIES],
  },
  {
    slug: 'polishing-ratio',
    group: 'grades',
    kanji: '精米歩合',
    romaji: 'seimai-buai',
    facts: [
      { id: 'honjozo', kanji: '本醸造', note: false },
      { id: 'ginjo', kanji: '吟醸', note: false },
      { id: 'daiginjo', kanji: '大吟醸', note: false },
      { id: 'junmai', kanji: '純米' },
      { id: 'rounding' },
    ],
    paragraphs: 2,
    related: ['grades', 'ginjo', 'sake-rice'],
    sources: [GUIDE, JSS_GLOSSARY],
  },
  {
    slug: 'yeast-starters',
    group: 'styles',
    kanji: '酒母',
    romaji: 'shubo',
    facts: [
      { id: 'sokujo', kanji: '速醸', romaji: 'sokujō' },
      { id: 'kimoto', kanji: '生酛', romaji: 'kimoto' },
      { id: 'yamahai', kanji: '山廃', romaji: 'yamahai' },
    ],
    paragraphs: 3,
    related: ['nama', 'muroka', 'grades'],
    sources: [GUIDE, JSS_BREWING, JSS_GLOSSARY],
  },
  {
    slug: 'nama',
    group: 'styles',
    kanji: '生酒',
    romaji: 'namazake',
    facts: [
      { id: 'namazake', kanji: '生酒', romaji: 'namazake' },
      { id: 'namachozo', kanji: '生貯蔵酒', romaji: 'nama-chozō-shu' },
      { id: 'namazume', kanji: '生詰', romaji: 'nama-zume' },
      { id: 'hiyaoroshi', kanji: 'ひやおろし', romaji: 'hiyaoroshi' },
    ],
    paragraphs: 2,
    related: ['muroka', 'genshu', 'sparkling'],
    sources: [GUIDE, JSS_BREWING],
  },
  {
    slug: 'muroka',
    group: 'styles',
    kanji: '無濾過',
    romaji: 'muroka',
    facts: [
      { id: 'skipped', kanji: '活性炭', romaji: 'kasseitan' },
      { id: 'kept' },
      { id: 'looks', note: false },
      { id: 'combined', kanji: '無濾過生原酒', romaji: 'muroka nama genshu' },
    ],
    paragraphs: 2,
    related: ['nama', 'genshu', 'nigori'],
    sources: [GUIDE, JSS_BREWING, JSS_GLOSSARY],
  },
  {
    slug: 'genshu',
    group: 'styles',
    kanji: '原酒',
    romaji: 'genshu',
    facts: [{ id: 'usual', note: false }, { id: 'genshu', note: false }, { id: 'rule' }],
    paragraphs: 1,
    related: ['muroka', 'nama'],
    sources: [GUIDE, JSS_BREWING],
  },
  {
    slug: 'nigori',
    group: 'styles',
    kanji: 'にごり酒',
    romaji: 'nigorizake',
    facts: [
      { id: 'mesh', note: false },
      { id: 'texture', note: false },
      { id: 'pasteurised' },
      { id: 'live', kanji: '活性にごり', romaji: 'kassei nigori' },
    ],
    paragraphs: 1,
    related: ['muroka', 'sparkling', 'nama'],
    sources: [GUIDE, JSS_BREWING],
  },
  {
    slug: 'koshu',
    group: 'styles',
    kanji: '古酒',
    romaji: 'koshu',
    facts: [
      { id: 'usual', note: false },
      { id: 'koshu' },
      { id: 'printedAge' },
      { id: 'alsoWritten', kanji: '熟成酒 · 長期熟成酒', romaji: 'jukusei-shu · chōki jukusei-shu', note: false },
    ],
    paragraphs: 2,
    related: ['genshu', 'nama'],
    sources: [GUIDE, JSS_GLOSSARY],
  },
  {
    slug: 'sparkling',
    group: 'styles',
    kanji: 'スパークリング日本酒',
    romaji: null,
    facts: [
      { id: 'carbonated', kanji: '炭酸ガス注入' },
      { id: 'secondFermentation', kanji: '瓶内二次発酵', romaji: 'bin-nai niji hakkō' },
      { id: 'live', kanji: '活性にごり', romaji: 'kassei nigori' },
      { id: 'awa', kanji: 'awa 酒' },
    ],
    paragraphs: 2,
    related: ['nigori', 'nama'],
    sources: [
      {
        label: 'WSET, “Sparkling sake: styles and production” (11 August 2026)',
        url: 'https://www.wsetglobal.com/knowledge-centre/blog/2026/sparkling-sake-styles-and-production',
      },
      GUIDE,
      { label: 'Japan Awasake Association', url: 'https://www.awasake.or.jp/en/' },
    ],
  },
  {
    slug: 'sake-rice',
    group: 'rice',
    kanji: '酒造好適米',
    romaji: 'shuzō kōtekimai',
    facts: [
      { id: 'yamadaNishiki', kanji: '山田錦' },
      { id: 'gohyakumangoku', kanji: '五百万石' },
      { id: 'miyamaNishiki', kanji: '美山錦' },
      { id: 'omachi', kanji: '雄町' },
    ],
    paragraphs: 3,
    related: ['polishing-ratio', 'ginjo', 'how-to-read-a-label'],
    sources: [
      GUIDE,
      {
        label: 'Mynavi Agri, on the sake rice varieties and their lineage (15 November 2025)',
        url: 'https://agri.mynavi.jp/2025_11_15_407739/',
      },
      {
        label: 'Sake Street, “The Root of Sake Rice: Omachi genealogy and its 100 year history”',
        url: 'https://sakestreet.com/en/media/what-is-omachi',
      },
      {
        label: 'Go Nagano (Nagano Prefecture), on Miyama Nishiki',
        url: 'https://www.go-nagano.net/food-and-drink/id17857',
      },
    ],
  },
  {
    slug: 'serving-temperatures',
    group: 'tasting',
    kanji: '冷やと燗',
    romaji: 'hiya to kan',
    facts: [
      { id: 'yukihie', kanji: '雪冷え', romaji: 'yukihie' },
      { id: 'hanahie', kanji: '花冷え', romaji: 'hanahie', note: false },
      { id: 'suzuhie', kanji: '涼冷え', romaji: 'suzuhie', note: false },
      { id: 'joon', kanji: '常温', romaji: 'jōon' },
      { id: 'hinatakan', kanji: '日向燗', romaji: 'hinata-kan', note: false },
      { id: 'hitohadakan', kanji: '人肌燗', romaji: 'hitohada-kan', note: false },
      { id: 'nurukan', kanji: 'ぬる燗', romaji: 'nuru-kan', note: false },
      { id: 'jokan', kanji: '上燗', romaji: 'jō-kan' },
      { id: 'atsukan', kanji: '熱燗', romaji: 'atsu-kan', note: false },
    ],
    paragraphs: 3,
    related: ['flavor-words', 'ginjo', 'nama'],
    sources: [
      GUIDE,
      {
        label: 'Nippon.com, “知っていると100倍おいしい酒のABC（10）温度で変わる日本酒の味” (16 July 2018)',
        url: 'https://www.nippon.com/ja/guide-to-japan/gu002011/',
      },
      {
        label: 'Japan Sake and Shochu Makers Association, “How to Serve Sake”',
        url: 'https://japansake.or.jp/sake/en/basic/how-to-serve-sake/',
      },
    ],
  },
  {
    slug: 'flavor-words',
    group: 'tasting',
    kanji: null,
    romaji: null,
    // The six axes, f1–f6 in Sakenowa's order. `entries.test.ts` holds these
    // to the chart's own labels, kanji and romaji, so the page and the chart
    // cannot drift apart (ADR-0022).
    facts: [
      { id: 'f1', kanji: '華やか', romaji: 'hanayaka' },
      { id: 'f2', kanji: '芳醇', romaji: 'hojun' },
      { id: 'f3', kanji: '重厚', romaji: 'juko' },
      { id: 'f4', kanji: '穏やか', romaji: 'odayaka' },
      { id: 'f5', kanji: 'ドライ', romaji: 'dry' },
      { id: 'f6', kanji: '軽快', romaji: 'keikai' },
    ],
    paragraphs: 3,
    related: ['serving-temperatures', 'grades'],
    sources: [
      {
        label: 'Sakenowa, “さけのわデータ” (the data project’s documentation)',
        url: 'https://muro.sakenowa.com/sakenowa-data',
      },
    ],
  },
] as const satisfies ReadonlyArray<
  Omit<GuideEntry, 'source' | 'verifiedOn' | 'facts'> & {
    facts: ReadonlyArray<{ id: string; kanji?: string; romaji?: string; note?: boolean }>
  }
>

export type GuideSlug = (typeof ENTRIES)[number]['slug']

/** Every entry, parsed, in index order. */
export const GUIDE_ENTRIES: readonly GuideEntry[] = ENTRIES.map((entry) =>
  GuideEntrySchema.parse({ ...entry, source: 'manual_curation', verifiedOn: VERIFIED }),
)

export const GUIDE_SLUGS: readonly GuideSlug[] = ENTRIES.map((entry) => entry.slug)

export function isGuideSlug(value: string): value is GuideSlug {
  return (GUIDE_SLUGS as readonly string[]).includes(value)
}

export function guideEntry(slug: GuideSlug): GuideEntry {
  return GUIDE_ENTRIES.find((entry) => entry.slug === slug)!
}

/** The entries of one group, in index order. */
export function guideEntriesIn(group: GuideGroup): GuideEntry[] {
  return GUIDE_ENTRIES.filter((entry) => entry.group === group)
}
