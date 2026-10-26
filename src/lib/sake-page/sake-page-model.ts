import { requiresSakenowaAttribution } from '@/components/sake/sakenowa-attribution'
import type { GuideSlug } from '@/lib/guide/entries'
import { regionEntryFor } from '@/lib/guide/regions'
import { formerBreweryNameOf, type FormerBreweryName } from '@/lib/sakenowa/former-brewery-names'
import { getPrefectureNames, type PrefectureNames } from '@/lib/sakenowa/prefecture'
import { isPlaceholderBrewery, type Brewery } from '@/lib/schemas/brewery'
import type { Brand } from '@/lib/schemas/brand'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'

/** What §9's page has fetched for one Sake, before it decides anything. */
export interface SakePageInput {
  brand: Brand
  brewery: Brewery | null
  flavorChart: FlavorChart | null
  /** The brewery's other Sakes in the mirror. */
  siblings: readonly Brand[]
  /** A Learn entry's answer, in the visitor's locale. */
  regionAnswer: (slug: GuideSlug) => string
}

/** The brewery as §9.1's line and §9.9's section show it. */
export interface BreweryLine {
  nameKanji: string
  /** Machine transliteration (covered by the page's romaji caveat), or `null`. */
  nameRomaji: string | null
  /** Editorial English and Japanese names (`manual_curation`), or `null`. */
  prefecture: PrefectureNames | null
  /** v1.6 §9: the name older bottles carry, when a rename is on record. */
  former: FormerBreweryName | null
}

/** Design question Y: one sentence on the prefecture's sake, and the link to
 *  its Learn entry ("About Niigata ›"). Our text (`manual_curation`). */
export interface RegionLine {
  slug: GuideSlug
  lead: string
  prefectureEn: string
}

export interface SakePageModel {
  /**
   * The sake's name where one line is all there is room for (the top bar,
   * the rating panel, the cellar sheet): the Latin name, or the kanji where
   * the ingest has not produced a transliteration yet (#121).
   */
  displayName: string
  /** The brewery line, or `null` when the page hides the brewery. */
  brewery: BreweryLine | null
  /**
   * §9.9 "The brewery": the same line as {@link brewery}, or `null` when the
   * section is left out. §9.9 is "story plus a row of its other sakes. Hidden
   * without data." There is no story, so the row is the section: a brewery
   * with no other Sake in the mirror gets none, rather than one repeating §9.1.
   */
  brewerySection: BreweryLine | null
  /**
   * The page's ONE transliteration caveat covers every Latin name on it — the
   * sake's, its brewery's and the other sakes' in §9.9 — so it shows when any
   * of them does.
   */
  showRomajiDisclosure: boolean
  /** The region line, or `null` when Learn has no entry for the prefecture. */
  region: RegionLine | null
  /**
   * §9.1's "Little published" outline tag. The design attaches it to a bottle
   * whose data is thin; the flavor chart is the bulk of what the mirror
   * carries, so its absence is the honest proxy — ADR-0016 records that
   * roughly half the catalogue has none. The same absence makes §9.6 state
   * rule 4's empty-chart sentence. A statement about our knowledge, not about
   * the sake.
   */
  littlePublished: boolean
  /**
   * §9.2's "Similar" ranks by distance over the six flavor axes, so a sake
   * with no chart has nothing to be similar BY — §6 would open on its empty
   * state. The page does not offer the tap.
   */
  offerSimilar: boolean
  showSakenowaAttribution: boolean
}

export function sakePageModel(input: SakePageInput): SakePageModel {
  const { brand, flavorChart } = input
  // Hide the brewery entirely for Sakenowa placeholder rows (~48 in the
  // dataset). "Brewery:" with no name reads worse than no section.
  const shown = input.brewery !== null && !isPlaceholderBrewery(input.brewery) ? input.brewery : null
  const brewery: BreweryLine | null = shown && {
    nameKanji: shown.nameKanji,
    nameRomaji: shown.nameRomaji,
    // Prefecture is editorially mapped (manual_curation per ADR-0005) because
    // Sakenowa's /areas endpoint publishes Japanese names only.
    prefecture: getPrefectureNames(shown.areaId),
    former: formerBreweryNameOf(shown),
  }

  // ADR-0014: the Sakenowa credit shows only when at least one RENDERED
  // record on the page is Sakenowa-sourced. A hidden brewery is not rendered.
  const renderedSources = new Set<string>([brand.source])
  if (shown) renderedSources.add(shown.source)
  if (flavorChart) renderedSources.add(flavorChart.source)

  // A hidden brewery has no prefecture, so no region line either.
  const regionSlug = shown ? regionEntryFor(shown.areaId) : null
  const regionLead = regionSlug ? firstSentence(input.regionAnswer(regionSlug)) : ''
  const region: RegionLine | null =
    regionSlug && regionLead && brewery?.prefecture
      ? { slug: regionSlug, lead: regionLead, prefectureEn: brewery.prefecture.nameEn }
      : null

  const brewerySection = brewery && input.siblings.length > 0 ? brewery : null
  const showRomajiDisclosure =
    brand.nameRomaji !== null ||
    (brewery !== null && brewery.nameRomaji !== null) ||
    (brewerySection !== null && input.siblings.some((sibling) => sibling.nameRomaji !== null))

  return {
    displayName: brand.nameRomaji ?? brand.nameKanji,
    brewery,
    brewerySection,
    showRomajiDisclosure,
    region,
    littlePublished: flavorChart === null,
    offerSimilar: flavorChart !== null,
    showSakenowaAttribution: requiresSakenowaAttribution(renderedSources),
  }
}

/** A Learn entry's answer up to its first full stop, for a one-line lead. */
export function firstSentence(text: string): string {
  const end = text.search(/[.!?](\s|$)/)
  return end === -1 ? text : text.slice(0, end + 1)
}
