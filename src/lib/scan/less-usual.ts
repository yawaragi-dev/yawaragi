import type { ScanStyle } from '@/lib/schemas/label-scan-extraction'

/**
 * The styles §7 calls "Less usual" on a menu or shelf (design v1.8, P3), in
 * the order it picks one: a fixed short list, because relative rarity on a
 * three-line list means nothing, and on bar lists nama, genshu and muroka are
 * the norm. Shizuku / fukurozuri and polishing of 40% or less are on the
 * design's list too, but the list reader does not read them yet.
 */
export const LESS_USUAL_STYLES = ['kijoshu', 'koshu', 'taruzake', 'hiyaoroshi'] as const satisfies readonly ScanStyle[]
export type LessUsualStyle = (typeof LESS_USUAL_STYLES)[number]

/** The one less usual style a row's lines carry, or `null`. Describes; never ranks. */
export function lessUsualStyle(lines: ReadonlyArray<{ styles?: readonly ScanStyle[] }>): LessUsualStyle | null {
  const read = new Set(lines.flatMap((line) => line.styles ?? []))
  return LESS_USUAL_STYLES.find((style) => read.has(style)) ?? null
}
