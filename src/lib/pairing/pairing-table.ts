import { PairingRowSchema, type PairingRow, type PairingSource } from '@/lib/schemas/pairing'

/**
 * What a kind of sake is commonly served with — §9.7 "Goes with" (#336).
 *
 * Hand-curated from named sources (research summary on #336). Three rows are
 * the Sake Service Institute's types, which a sake's flavor chart or grade
 * can point to; the rest are styles a bottling names. A row needs at least
 * two independent sources; where they are missing (taruzake, genshu,
 * muroka, hiyaoroshi, a plain junmai or honjozo) there is no row and the app
 * says nothing. A reason names why the two go together where a source says
 * so (NRIB on fish and cheese, the umami synergy of dashi), and stays plain
 * where none does.
 *
 * Wording rules (CLAUDE.md, Regulation (EC) 1924/2006 Art. 4(3)): "often
 * served with", never "perfect with"; nothing about digestion or health.
 */

const SSI_TYPES: PairingSource = {
  label: 'Haruyuki Hioki (Sake Service Institute), interview in Money Post, 2024',
  url: 'https://www.moneypost.jp/1100566',
  verifiedOn: '2026-10-17',
}
const SSI_TEMPERATURES: PairingSource = {
  label: 'Haruyuki Hioki (Sake Service Institute), on serving temperatures, Money Post, 2024',
  url: 'https://www.moneypost.jp/1101435',
  verifiedOn: '2026-10-17',
}
const NRIB_GUIDE: PairingSource = {
  label:
    'Japan Sake and Shochu Makers Association and National Research Institute of Brewing, “A Comprehensive Guide to Japanese Sake” (2011), §5.2, §5.4, Q17, Q18',
  url: 'https://www.nrib.go.jp/English/sake/pdf/guidesse01.pdf',
  verifiedOn: '2026-10-17',
}
const WSET_CHEESE: PairingSource = {
  label: 'WSET, “Sake and cheese: your new favourite pairing” (2024)',
  url: 'https://www.wsetglobal.com/knowledge-centre/blog/2024/sake-cheese-your-new-favourite-pairing',
  verifiedOn: '2026-10-17',
}
const PALATE_PROJECT: PairingSource = {
  label: 'Palate Project, “Sake guide, lesson 7: sake and food pairing”',
  url: 'https://palateproject.co/blogs/sake-guide/sake-guide-lesson-7-sake-and-food-pairing-guide',
  verifiedOn: '2026-10-17',
}
const UMAMI_SYNERGY: PairingSource = {
  label: 'Umami Information Center, “Dashi and umami” lecture at Tohoku University (2024)',
  url: 'https://www.umamiinfo.com/topics/2024/01/umami-lecture-dashi-and-umami-in-tohoku-university.html',
  verifiedOn: '2026-10-17',
}
// Kijoshu has no category-level source we could find; two breweries'
// kijoshu, described independently, agree.
const KIJOSHU_HANAHATO: PairingSource = {
  label: 'True Sake on Enoki Shuzo’s Hanahato Kijoshu',
  url: 'https://www.truesake.com/products/hanahato-kijoushu',
  verifiedOn: '2026-10-17',
}
const KIJOSHU_MIZUBASHO: PairingSource = {
  label: 'Skurnik Wines & Spirits on Nagai Shuzo’s Mizubasho Kijoshu',
  url: 'https://www.skurnik.com/sku/kijoshu-sake-mizubasho',
  verifiedOn: '2026-10-17',
}

const ROWS = [
  // 薫酒 — fragrant: daiginjo and ginjo, or a chart that leads on hanayaka.
  { id: 'kunshu', foods: ['sashimi', 'crab', 'freshCheese'], serve: ['hanabie', 'suzuhie'], sources: [SSI_TYPES, SSI_TEMPERATURES, NRIB_GUIDE, PALATE_PROJECT] },
  // 醇酒 — rich: kimoto and yamahai, or a chart that leads on hojun or juko.
  { id: 'junshu', foods: ['oden', 'sukiyaki', 'porkDaikon'], serve: ['joon', 'nurukan'], sources: [SSI_TYPES, SSI_TEMPERATURES, NRIB_GUIDE, UMAMI_SYNERGY] },
  // 爽酒 — light and smooth: nama, or a chart that leads on dry or keikai.
  { id: 'soshu', foods: ['coldTofu', 'oysters', 'friedFish'], serve: ['yukibie', 'hanabie'], sources: [SSI_TYPES, SSI_TEMPERATURES, NRIB_GUIDE] },
  // 熟酒 — aged. No axis shows it; only a bottling that says koshu.
  { id: 'koshu', foods: ['hardCheese', 'unagi', 'driedFruit'], serve: ['joon'], sources: [SSI_TYPES, NRIB_GUIDE, WSET_CHEESE] },
  { id: 'kijoshu', foods: ['darkChocolate', 'iceCream', 'foieGras'], serve: ['suzuhie'], sources: [KIJOSHU_HANAHATO, KIJOSHU_MIZUBASHO] },
  { id: 'sparkling', foods: ['freshCheese', 'fruitDesserts'], note: true, serve: ['yukibie'], sources: [NRIB_GUIDE, WSET_CHEESE, PALATE_PROJECT] },
  { id: 'nigori', foods: ['spicyDishes', 'washedRindCheese'], note: true, serve: ['hanabie'], sources: [PALATE_PROJECT, WSET_CHEESE, NRIB_GUIDE] },
] as const

export const PAIRING_ROWS: readonly PairingRow[] = ROWS.map((row) => PairingRowSchema.parse({ ...row, source: 'manual_curation' }))

export type PairingRowId = (typeof ROWS)[number]['id']

export function pairingRow(id: PairingRowId): PairingRow {
  return PAIRING_ROWS.find((row) => row.id === id)!
}
