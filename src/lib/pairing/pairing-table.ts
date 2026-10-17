import { type GuideSource } from '@/lib/schemas/guide-entry'
import { PairingRowSchema, type PairingRow } from '@/lib/schemas/pairing'

/**
 * What a kind of sake is commonly served with — §9.7 "Goes with" (#336).
 *
 * Hand-curated from named sources, read on 2026-10-17 (research summary on
 * #336). Three rows are the Sake Service Institute's types, which a sake's
 * flavor chart can point to; the rest are styles a bottling names. A row is
 * kept only where several sources agree; where they do not (taruzake,
 * genshu, hiyaoroshi, muroka, a plain junmai or honjozo), there is no row and
 * the app says nothing.
 *
 * Wording rules (CLAUDE.md, Regulation (EC) 1924/2006 Art. 4(3)): "often
 * served with", never "perfect with"; no claim about digestion or health.
 */

const SSI_TYPES: GuideSource = {
  label: 'Haruyuki Hioki (Sake Service Institute), interview in Money Post, 2024',
  url: 'https://www.moneypost.jp/1100566',
}
const SSI_TEMPERATURES: GuideSource = {
  label: 'Haruyuki Hioki (Sake Service Institute), on serving temperatures, Money Post, 2024',
  url: 'https://www.moneypost.jp/1101435',
}
const NRIB_GUIDE: GuideSource = {
  label:
    'Japan Sake and Shochu Makers Association and National Research Institute of Brewing, “A Comprehensive Guide to Japanese Sake” (2011)',
  url: 'https://www.nrib.go.jp/English/sake/pdf/guidesse01.pdf',
}
const WSET_CHEESE: GuideSource = {
  label: 'WSET, “Sake and cheese: your new favourite pairing” (2024)',
  url: 'https://www.wsetglobal.com/knowledge-centre/blog/2024/sake-cheese-your-new-favourite-pairing',
}
const PALATE_PROJECT: GuideSource = {
  label: 'Palate Project, “Sake guide, lesson 7: sake and food pairing”',
  url: 'https://palateproject.co/blogs/sake-guide/sake-guide-lesson-7-sake-and-food-pairing-guide',
}
const TRUE_SAKE_KIJOSHU: GuideSource = {
  label: 'True Sake, Hanahato Kijoushu',
  url: 'https://www.truesake.com/products/hanahato-kijoushu',
}
const GINZA_BERLIN_SPARKLING: GuideSource = {
  label: 'Ginza Berlin, Hana Awaka',
  url: 'https://en.ginza-berlin.com/products/hana-awaka',
}

const VERIFIED_ON = '2026-10-17'

const ROWS = [
  // 薫酒 — fragrant: daiginjo and ginjo, or a chart that leads on hanayaka.
  {
    id: 'kunshu',
    foods: ['sashimi', 'crab', 'freshCheese'],
    serve: ['hanabie', 'suzuhie'],
    sources: [SSI_TYPES, SSI_TEMPERATURES, PALATE_PROJECT],
  },
  // 醇酒 — rich: kimoto and yamahai, or a chart that leads on hojun or juko.
  {
    id: 'junshu',
    foods: ['oden', 'sukiyaki', 'agedCheese'],
    serve: ['joon', 'nurukan'],
    sources: [SSI_TYPES, SSI_TEMPERATURES, WSET_CHEESE],
  },
  // 爽酒 — light and smooth: nama, or a chart that leads on dry or keikai.
  {
    id: 'soshu',
    foods: ['coldTofu', 'oysters', 'friedFish'],
    serve: ['yukibie', 'hanabie'],
    sources: [SSI_TYPES, SSI_TEMPERATURES, NRIB_GUIDE],
  },
  // 熟酒 — aged. No axis shows it; only a bottling that says koshu.
  {
    id: 'koshu',
    foods: ['agedCheese', 'unagi', 'driedFruit'],
    serve: ['joon'],
    sources: [SSI_TYPES, NRIB_GUIDE, WSET_CHEESE],
  },
  {
    id: 'kijoshu',
    foods: ['darkChocolate', 'desserts'],
    serve: ['suzuhie'],
    sources: [TRUE_SAKE_KIJOSHU],
  },
  {
    id: 'sparkling',
    foods: ['aperitif', 'freshCheese', 'lightDishes'],
    serve: ['yukibie'],
    sources: [NRIB_GUIDE, WSET_CHEESE, GINZA_BERLIN_SPARKLING],
  },
  {
    id: 'nigori',
    foods: ['spicyDishes', 'washedRindCheese'],
    serve: ['hanabie'],
    sources: [PALATE_PROJECT, WSET_CHEESE],
  },
] as const

export const PAIRING_ROWS: readonly PairingRow[] = ROWS.map((row) =>
  PairingRowSchema.parse({ ...row, source: 'manual_curation', verifiedOn: VERIFIED_ON }),
)

export type PairingRowId = (typeof ROWS)[number]['id']

export function pairingRow(id: PairingRowId): PairingRow {
  return PAIRING_ROWS.find((row) => row.id === id)!
}
