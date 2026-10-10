/**
 * Breweries that renamed themselves after their labels were printed
 * (`manual_curation`). Sakenowa lists the current name only, so a bottle
 * from before the rename reads as "found the sake, not its brewery" (§5a)
 * although nothing was misread (#387).
 *
 * Applied only where the brand name also has to match — the first lookup
 * pass, brand AND brewery — never on the brewery alone: 旭酒造 is also the
 * current name of another brewery (伊勢旭, Mie), and a brewery-only lookup
 * on it must not start returning Dassai.
 *
 * One row per rename, each with its source. Add a row only for a rename
 * that is on record, not for a name the model happened to misread.
 */
const FORMER_TO_CURRENT: Readonly<Record<string, readonly string[]>> = {
  // Asahi Shuzo (Yamaguchi) → 株式会社獺祭 from 1 June 2025, announced
  // 23 Jan 2025 (news.mynavi.jp/article/20250124-3114336).
  旭酒造: ['獺祭'],
}

/** `variants` plus the current name of any former brewery name among them. */
export function withFormerBreweryNames(variants: readonly string[]): string[] {
  const out = [...variants]
  for (const variant of variants) {
    for (const current of FORMER_TO_CURRENT[variant] ?? []) {
      if (!out.includes(current)) out.push(current)
    }
  }
  return out
}
