/**
 * Breweries that renamed themselves after their labels were printed
 * (`manual_curation`). Sakenowa lists the current name only, so a bottle
 * from before the rename reads as "found the sake, not its brewery" (§5a)
 * although nothing was misread (#387), and the sake page shows a brewery
 * name the bottle in hand does not carry (design v1.6 §9, B3).
 *
 * One row per rename, each with its source. Add a row only for a rename
 * that is on record, not for a name the model happened to misread.
 */
interface BreweryRename {
  /** The Sakenowa brewery, under its current name. */
  breweryId: number
  currentKanji: string
  formerKanji: string
  /** Hand-written, so it carries no transliteration caveat. */
  formerRomaji: string
}

const RENAMES: readonly BreweryRename[] = [
  // Asahi Shuzo (Yamaguchi) → 株式会社獺祭 from 1 June 2025, announced
  // 23 Jan 2025 (news.mynavi.jp/article/20250124-3114336).
  { breweryId: 679, currentKanji: '獺祭', formerKanji: '旭酒造', formerRomaji: 'Asahi Shuzō' },
]

/**
 * `variants` plus the current name of any former brewery name among them.
 *
 * Applied only where the brand name also has to match — the first lookup
 * pass, brand AND brewery — never on the brewery alone: 旭酒造 is also the
 * current name of another brewery (伊勢旭, Mie), and a brewery-only lookup
 * on it must not start returning Dassai.
 */
export function withFormerBreweryNames(variants: readonly string[]): string[] {
  const out = [...variants]
  for (const variant of variants) {
    for (const rename of RENAMES) {
      if (rename.formerKanji === variant && !out.includes(rename.currentKanji)) {
        out.push(rename.currentKanji)
      }
    }
  }
  return out
}

export interface FormerBreweryName {
  nameKanji: string
  nameRomaji: string
}

/**
 * The name a brewery's older bottles carry, or `null` when no rename is on
 * record. Matches on the id AND the current name, so a row can never label
 * a different brewery if Sakenowa reassigns the id.
 */
export function formerBreweryNameOf(brewery: {
  breweryId: number
  nameKanji: string
}): FormerBreweryName | null {
  const rename = RENAMES.find(
    (row) => row.breweryId === brewery.breweryId && row.currentKanji === brewery.nameKanji,
  )
  return rename ? { nameKanji: rename.formerKanji, nameRomaji: rename.formerRomaji } : null
}
