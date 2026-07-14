import {
  CROSS_BEVERAGE_DESCRIPTOR_ALIASES,
  CROSS_BEVERAGE_MAP,
} from '@/lib/ai/tools/cross-beverage-data'
import type { CrossBeverageMap } from '@/lib/schemas/cross-beverage-map'

/**
 * Forward cross-beverage lookup: a Western descriptor + beverage category →
 * the matching CrossBeverageMap row (its 6-axis FlavorProfile target +
 * provenance), deterministically. The forward twin of `reverse-lookup.ts`.
 *
 * This logic used to live inside the AI-SDK `mapCrossBeverage` tool's
 * `execute`. It was extracted here so a caller can resolve a descriptor
 * WITHOUT going through the LLM tool wrapper — the Phase 5 `applyCrossBeverage`
 * taste action seeds a TasteEvent from a descriptor directly, and the tool now
 * calls this too (single source of truth for the mapping). The LLM-invention
 * ban still lives at the tool boundary (its input enum); this module is pure
 * table lookup.
 */

type Beverage = CrossBeverageMap['beverage']

/**
 * Normalise + alias-resolve a raw descriptor to its canonical form. `Peaty `
 * and `peaty` both resolve to `peated`. Aliases are keyed lowercase-trimmed,
 * matching the canonical-descriptor convention in `cross-beverage-data.ts`.
 */
export function resolveCrossBeverageDescriptor(input: string): string {
  const normalised = input.trim().toLowerCase()
  return CROSS_BEVERAGE_DESCRIPTOR_ALIASES[normalised] ?? normalised
}

/**
 * The CrossBeverageMap row for a descriptor + beverage, or `null` when the
 * pair is not in the table. Beverage is part of the key because a descriptor
 * like "dry" means different things across categories.
 */
export function resolveCrossBeverageTarget(
  descriptor: string,
  beverage: Beverage,
): CrossBeverageMap | null {
  const canonical = resolveCrossBeverageDescriptor(descriptor)
  return (
    CROSS_BEVERAGE_MAP.find((row) => row.descriptor === canonical && row.beverage === beverage) ??
    null
  )
}

/**
 * The descriptors known for a beverage category — the category-appropriate
 * hint surfaced to the caller (LLM or taste action) when a lookup misses.
 */
export function knownCrossBeverageDescriptors(beverage: Beverage): string[] {
  return CROSS_BEVERAGE_MAP.filter((row) => row.beverage === beverage).map((row) => row.descriptor)
}
