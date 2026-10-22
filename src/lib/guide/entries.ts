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

const NTA_GI_LIST: GuideSource = {
  label: 'National Tax Agency, “酒類の地理的表示一覧” (the list of geographical indications for alcoholic drinks)',
  url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/ichiran.htm',
}

const NTA_CATEGORIES: GuideSource = {
  label: 'National Tax Agency, “酒のしおり” (2025), “酒税法における酒類の分類及び定義”',
  url: 'https://www.nta.go.jp/taxes/sake/shiori-gaikyo/shiori/2025/pdf/0009.pdf',
}

/** The day each entry was last checked against its sources. An entry that
 *  does not say was checked on the day "Learn" shipped. */
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
  {
    // Design v1.7 §18 "Around sake" (89). Linked from §5a's `not_sake`
    // outcome. No drink's or maker's name, like every entry (ADR-0026).
    slug: 'other-japanese-drinks',
    group: 'around',
    kanji: '日本酒とほかのお酒',
    romaji: 'nihonshu to hoka no osake',
    facts: [
      { id: 'sake', kanji: '清酒', romaji: 'seishu' },
      { id: 'craftSake', kanji: 'クラフトサケ', romaji: 'kurafuto sake' },
      { id: 'shochu', kanji: '焼酎', romaji: 'shōchū' },
      { id: 'awamori', kanji: '泡盛', romaji: 'awamori' },
      { id: 'umeshu', kanji: '梅酒', romaji: 'umeshu' },
      { id: 'liqueur', kanji: 'リキュール', romaji: 'rikyūru' },
    ],
    paragraphs: 2,
    related: ['how-to-read-a-label', 'grades'],
    sources: [
      NTA_CATEGORIES,
      {
        label: 'National Tax Agency, “酒類の表示方法チェックシート（各品目共通）” (the labelling duties of Article 86-5)',
        url: 'https://www.nta.go.jp/taxes/sake/qa/11/pdf/011.pdf',
      },
      {
        label: 'National Tax Agency, geographical indication “琉球”, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/pdf/0020008-114_2.pdf',
      },
      {
        label: 'National Tax Agency, “Product Specification of Geographical Indication 和歌山梅酒 (Wakayama Umeshu)”',
        url: 'https://www.nta.go.jp/english/taxes/liquor_administration/02_11.htm',
      },
      {
        label: 'Craft Sake Brewery Association, on what craft sake is',
        url: 'https://craftsakebreweries.com/index.html',
      },
    ],
    verifiedOn: '2026-10-14',
  },
  // Regions (design question Y): a prefecture's sake as its geographical
  // indication describes it. Every fact is from the GI's production standard
  // (国税庁, 生産基準), which states the character of the sake and the water,
  // climate and people behind it. A region holds no sake's or brewery's name.
  {
    slug: 'region-niigata',
    group: 'regions',
    kanji: '新潟県',
    romaji: 'Niigata',
    facts: [
      { id: 'character', kanji: '淡麗', romaji: 'tanrei' },
      { id: 'water', kanji: '軟水', romaji: 'nansui' },
      { id: 'winter' },
      { id: 'brewers', kanji: '越後杜氏', romaji: 'Echigo tōji' },
      { id: 'gi', kanji: '地理的表示「新潟」' },
    ],
    paragraphs: 2,
    related: ['sake-rice', 'serving-temperatures'],
    sources: [
      {
        label: 'National Tax Agency, geographical indication “新潟” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/220207_niigata_besshi01.htm',
      },
      NTA_GI_LIST,
    ],
    verifiedOn: '2026-10-22',
  },
  {
    slug: 'region-hyogo',
    group: 'regions',
    kanji: '兵庫県',
    romaji: 'Hyōgo',
    facts: [
      { id: 'nada', kanji: '灘五郷', romaji: 'Nada Gogō' },
      { id: 'miyamizu', kanji: '宮水', romaji: 'miyamizu' },
      { id: 'winter', kanji: '六甲おろし', romaji: 'Rokkō oroshi' },
      { id: 'harima', kanji: 'はりま', romaji: 'Harima' },
      { id: 'yamadanishiki', kanji: '山田錦', romaji: 'Yamada Nishiki' },
      { id: 'brewers', kanji: '丹波杜氏', romaji: 'Tanba tōji' },
    ],
    paragraphs: 2,
    related: ['sake-rice', 'serving-temperatures'],
    sources: [
      {
        label: 'National Tax Agency, geographical indication “灘五郷” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/1806_besshi02.htm',
      },
      {
        label: 'National Tax Agency, geographical indication “はりま” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/200316_besshi01.htm',
      },
      NTA_GI_LIST,
    ],
    verifiedOn: '2026-10-22',
  },
  {
    slug: 'region-kyoto',
    group: 'regions',
    kanji: '京都府',
    romaji: 'Kyōto',
    facts: [
      { id: 'character' },
      { id: 'water', kanji: '軟水 · 中硬水' },
      { id: 'winter', kanji: '底冷え', romaji: 'sokobie' },
      { id: 'food', kanji: '京料理', romaji: 'kyō-ryōri' },
      { id: 'gi', kanji: '地理的表示「京都」' },
    ],
    paragraphs: 2,
    related: ['sake-rice', 'serving-temperatures'],
    sources: [
      {
        label: 'National Tax Agency, geographical indication “京都” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/251001_kyoto_besshi01.htm',
      },
      NTA_GI_LIST,
    ],
    verifiedOn: '2026-10-22',
  },
  {
    slug: 'region-yamagata',
    group: 'regions',
    kanji: '山形県',
    romaji: 'Yamagata',
    facts: [
      { id: 'character' },
      { id: 'water', kanji: '軟水', romaji: 'nansui' },
      { id: 'winter' },
      { id: 'aroma' },
      { id: 'gi', kanji: '地理的表示「山形」' },
    ],
    paragraphs: 2,
    related: ['sake-rice', 'serving-temperatures'],
    sources: [
      {
        label: 'National Tax Agency, geographical indication “山形” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/161216_besshi01.htm#seishu',
      },
      NTA_GI_LIST,
    ],
    verifiedOn: '2026-10-22',
  },
  {
    slug: 'region-nagano',
    group: 'regions',
    kanji: '長野県',
    romaji: 'Nagano',
    facts: [
      { id: 'character' },
      { id: 'rice' },
      { id: 'water' },
      { id: 'food', kanji: '味噌 · 漬物', romaji: 'miso · tsukemono' },
      { id: 'gi', kanji: '地理的表示「長野」' },
    ],
    paragraphs: 2,
    related: ['sake-rice', 'serving-temperatures'],
    sources: [
      {
        label: 'National Tax Agency, geographical indication “長野” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/210630_nagano_besshi01.htm#seishu',
      },
      NTA_GI_LIST,
    ],
    verifiedOn: '2026-10-22',
  },
  {
    slug: 'region-shizuoka',
    group: 'regions',
    kanji: '静岡県',
    romaji: 'Shizuoka',
    facts: [
      { id: 'character' },
      { id: 'aroma' },
      { id: 'water', kanji: '軟水', romaji: 'nansui' },
      { id: 'yeast', kanji: '静岡酵母', romaji: 'Shizuoka kōbo' },
      { id: 'brewers', kanji: '志太杜氏', romaji: 'Shida tōji' },
      { id: 'gi', kanji: '地理的表示「静岡」' },
    ],
    paragraphs: 2,
    related: ['sake-rice', 'serving-temperatures'],
    sources: [
      {
        label: 'National Tax Agency, geographical indication “静岡” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/231130_shizuoka_besshi01.htm',
      },
      NTA_GI_LIST,
    ],
    verifiedOn: '2026-10-22',
  },
  {
    slug: 'region-iwate',
    group: 'regions',
    kanji: '岩手県',
    romaji: 'Iwate',
    facts: [
      { id: 'character' },
      { id: 'water' },
      { id: 'winter' },
      { id: 'brewers', kanji: '南部杜氏', romaji: 'Nanbu tōji' },
      { id: 'rice', kanji: '吟ぎんが · 結の香', romaji: 'Gin Ginga · Yui no Kaori' },
      { id: 'gi', kanji: '地理的表示「岩手」' },
    ],
    paragraphs: 2,
    related: ['sake-rice', 'serving-temperatures'],
    sources: [
      {
        label: 'National Tax Agency, geographical indication “岩手” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/230925_iwate_besshi01.htm',
      },
      NTA_GI_LIST,
    ],
    verifiedOn: '2026-10-22',
  },
  {
    slug: 'region-saga',
    group: 'regions',
    kanji: '佐賀県',
    romaji: 'Saga',
    facts: [
      { id: 'character', kanji: '芳醇旨口', romaji: 'hōjun umakuchi' },
      { id: 'land', kanji: '佐賀平野', romaji: 'Saga heiya' },
      { id: 'water' },
      { id: 'history' },
      { id: 'gi', kanji: '地理的表示「佐賀」' },
    ],
    paragraphs: 2,
    related: ['sake-rice', 'serving-temperatures'],
    sources: [
      {
        label: 'National Tax Agency, geographical indication “佐賀” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/210614_besshi01.htm',
      },
      NTA_GI_LIST,
    ],
    verifiedOn: '2026-10-22',
  },
  {
    slug: 'region-mie',
    group: 'regions',
    kanji: '三重県',
    romaji: 'Mie',
    facts: [
      { id: 'character' },
      { id: 'winter', kanji: '鈴鹿おろし', romaji: 'Suzuka oroshi' },
      { id: 'water' },
      { id: 'food' },
      { id: 'gi', kanji: '地理的表示「三重」' },
    ],
    paragraphs: 2,
    related: ['sake-rice', 'serving-temperatures'],
    sources: [
      {
        label: 'National Tax Agency, geographical indication “三重” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/200619_besshi01.htm',
      },
      NTA_GI_LIST,
    ],
    verifiedOn: '2026-10-22',
  },
  {
    slug: 'region-shiga',
    group: 'regions',
    kanji: '滋賀県',
    romaji: 'Shiga',
    facts: [
      { id: 'character' },
      { id: 'water' },
      { id: 'rice', kanji: '近江米', romaji: 'Ōmi-mai' },
      { id: 'winter', kanji: '底冷え', romaji: 'sokobie' },
      { id: 'gi', kanji: '地理的表示「滋賀」' },
    ],
    paragraphs: 2,
    related: ['sake-rice', 'serving-temperatures'],
    sources: [
      {
        label: 'National Tax Agency, geographical indication “滋賀” for sake, production standard',
        url: 'https://www.nta.go.jp/taxes/sake/hyoji/chiri/220413_shiga_besshi01.htm',
      },
      NTA_GI_LIST,
    ],
    verifiedOn: '2026-10-22',
  },
] as const satisfies ReadonlyArray<
  Omit<GuideEntry, 'source' | 'verifiedOn' | 'facts'> & {
    verifiedOn?: string
    facts: ReadonlyArray<{ id: string; kanji?: string; romaji?: string; note?: boolean }>
  }
>

export type GuideSlug = (typeof ENTRIES)[number]['slug']

/** Every entry, parsed, in index order. */
export const GUIDE_ENTRIES: readonly GuideEntry[] = ENTRIES.map((entry) =>
  GuideEntrySchema.parse({ verifiedOn: VERIFIED, ...entry, source: 'manual_curation' }),
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
