import { gradeLabel } from '@/lib/scan/read-bottling'
import type { Expression, Koji } from '@/lib/schemas/expression'

/** What §9a's page has for one own bottling, before it decides anything. */
export interface BottlingPageInput {
  bottling: Expression
  /** All the visitor's own bottlings. */
  expressions: readonly Expression[]
  /** Tag words in the visitor's locale. */
  labels: { polishedTo: (n: number) => string; koji: (koji: Koji) => string }
}

/** The sake a bottling belongs to, as §9a names it. */
export interface BottlingLine {
  brandId: number
  /** The Latin name, or the kanji where there is none. */
  name: string
  /** The kanji shown beside a Latin name — `null` when `name` is the kanji. */
  kanji: string | null
}

export interface BottlingPageModel {
  /**
   * The sake behind the bottling, or `null` for one with no sake ("Keep it
   * anyway", "Add it yourself"): no line link, no line block, no chart.
   */
  line: BottlingLine | null
  /**
   * Design v1.7 D5: the identity block's tags — grade, styles, polishing,
   * koji — from the bottling's own fields, the visitor's words, not catalogue
   * data.
   */
  tags: string[]
  /** v1.7.1: the name or brewery is still the Latin reading the scan's model
   *  gave, until the visitor renames it. */
  showReadingByAi: boolean
  /**
   * §9a.7: the visitor's other bottlings of the same sake ("Own bottlings of
   * the same line appear here too, for their author"). Without a sake there
   * is no line for others to share.
   */
  others: Expression[]
  /**
   * Rule 15: with no sake, nothing on this screen is the catalogue's, and the
   * page marks itself `data-no-catalogue-data` so the end-of-screen block
   * drops its Sakenowa credit line.
   */
  noCatalogueData: boolean
  /**
   * §9a gives an own bottling no credit line of its own. One that belongs to
   * a sake shows that sake's name, which is Sakenowa's, so the above-the-fold
   * credit stays (CLAUDE.md, Sakenowa attribution). With no sake there is
   * nothing of Sakenowa's to credit.
   */
  showSakenowaAttribution: boolean
}

export function bottlingPageModel(input: BottlingPageInput): BottlingPageModel {
  const { brandId, line: stored } = input.bottling
  const hasSake = brandId !== null
  const line: BottlingLine | null =
    brandId !== null && stored !== null
      ? {
          brandId,
          name: stored.nameRomaji ?? stored.nameKanji,
          kanji: stored.nameRomaji !== null ? stored.nameKanji : null,
        }
      : null
  const { bottling, labels } = input
  const tags = [
    ...(bottling.grade ? [gradeLabel(bottling.grade)] : []),
    ...(bottling.styles ?? []),
    ...(bottling.polishingPct ? [labels.polishedTo(bottling.polishingPct)] : []),
    ...(bottling.koji ? [labels.koji(bottling.koji)] : []),
  ]
  const others =
    brandId === null
      ? []
      : input.expressions.filter((e) => e.brandId === brandId && e.id !== bottling.id)
  return {
    line,
    tags,
    showReadingByAi: Boolean(bottling.aiName || bottling.aiBrewery),
    others,
    noCatalogueData: !hasSake,
    showSakenowaAttribution: hasSake,
  }
}
