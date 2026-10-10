'use server'

import { compactDetailedNotes } from '@/lib/schemas/detailed-notes'
import {
  JOURNAL_ENTRY_SCHEMA_VERSION,
  type JournalEntry,
  JournalEntrySchema,
} from '@/lib/schemas/journal-entry'
import {
  type RateTastingInput,
  RateTastingInputSchema,
  type TastingPatch,
  TastingPatchSchema,
} from '@/lib/schemas/tasting-input'
import { lookupBrand, lookupFlavorChart } from '@/lib/sakenowa/lookup'
import { withMaintainerCollection } from '@/lib/taste/maintainer-collection'
import { tastingDayAt } from '@/lib/taste/tasting-day'

const HOUR = 3_600_000

/**
 * The one-tap tasting actions behind §5's log panel (design v1.4, rule 1:
 * "the star is the save"). Three of them, matching the three things the panel
 * does:
 *
 * - {@link rateNewTasting} — the first star tap logs a new JournalEntry.
 * - {@link updateTasting} — every later change to THAT entry: re-rating, the
 *   note, the quick tags, §10's detailed notes. "Re-rating updates the same
 *   entry; notes update live."
 * - {@link undoTasting} — the notice's Undo removes the entry.
 *
 * Maintainer-only (ADR-0020), via the shared gate. Not rate-limited, for the
 * reason the journal actions give: the gate narrows callers to the allowlist,
 * and nothing here calls a paid API.
 *
 * Results are deliberately small — the panel needs the entry id and the
 * tasting count, not the journal. Pages showing the journal re-read it with
 * `router.refresh()`.
 */

export type RateTastingResult =
  | {
      status: 'ok'
      entryId: string
      /** This tasting's number for this sake (or this bottling): 1 for the first time, 2 for the second… */
      tastingNumber: number
      loggedAt: number
    }
  | { status: 'invalid_input' }
  /** The brand id is not in the catalogue, or the bottling is not the caller's. */
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'unavailable' }

export type TastingUpdateResult =
  | { status: 'ok' }
  | { status: 'invalid_input' }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'unavailable' }

export async function rateNewTasting(input: RateTastingInput): Promise<RateTastingResult> {
  const parsed = RateTastingInputSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid_input' }
  const { brandId, rating, expressionId } = parsed.data

  return withMaintainerCollection(async ({ userId, journal, expressions }) => {
    const [brand, chart, bottlings] = await Promise.all([
      lookupBrand(brandId),
      lookupFlavorChart(brandId),
      expressionId === undefined ? [] : expressions.read(userId),
    ])
    if (brand == null) return { status: 'not_found' }
    // The bottling has to be the caller's own, and a bottling of this sake.
    const bottling = bottlings.find((e) => e.id === expressionId && e.brandId === brandId)
    if (expressionId !== undefined && !bottling) return { status: 'not_found' }

    const now = Date.now()
    const entry: JournalEntry = {
      schemaVersion: JOURNAL_ENTRY_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      event: {
        kind: 'rating',
        rating,
        brandId,
        // A chartless sake is still a tasting (ADR-0024): logged and counted,
        // skipped by the Palate fold.
        target: chart
          ? { f1: chart.f1, f2: chart.f2, f3: chart.f3, f4: chart.f4, f5: chart.f5, f6: chart.f6 }
          : null,
        occurredAt: now,
      },
      sake: { nameKanji: brand.nameKanji, nameRomaji: brand.nameRomaji },
      ...(bottling ? { expression: { id: bottling.id, name: bottling.name } } : {}),
      triedAt: now,
      createdAt: now,
    }
    await journal.put(userId, entry)

    const entries = await journal.read(userId)
    // A bottling's tastings are counted on their own: "2nd time" is about
    // what is in the glass.
    const tastingNumber = entries.filter((e) =>
      bottling
        ? e.expression?.id === bottling.id
        : e.event.kind === 'rating' && e.event.brandId === brandId,
    ).length
    return { status: 'ok', entryId: entry.id, tastingNumber, loggedAt: now }
  })
}

export async function updateTasting(
  entryId: string,
  patch: TastingPatch,
): Promise<TastingUpdateResult> {
  if (typeof entryId !== 'string' || entryId.length === 0) return { status: 'invalid_input' }
  const parsed = TastingPatchSchema.safeParse(patch)
  if (!parsed.success) return { status: 'invalid_input' }
  const p = parsed.data

  return withMaintainerCollection(async ({ userId, journal }) => {
    const existing = (await journal.read(userId)).find((e) => e.id === entryId)
    if (!existing) return { status: 'not_found' }

    const next: Record<string, unknown> = { ...existing, updatedAt: Date.now() }
    let event = existing.event
    if (p.rating !== undefined && event.kind === 'rating') event = { ...event, rating: p.rating }
    if (p.notes !== undefined) next.notes = p.notes.trim() || undefined
    if (p.tags !== undefined) next.tags = p.tags.length > 0 ? [...new Set(p.tags)] : undefined
    if (p.detail !== undefined) next.detail = compactDetailedNotes(p.detail)
    if (p.triedOn !== undefined) {
      const triedAt = tastingDayAt(p.triedOn)
      // "Today" anywhere on Earth is at most 14 hours ahead of UTC.
      if (triedAt - 12 * HOUR > Date.now() + 14 * HOUR) return { status: 'invalid_input' }
      next.triedAt = triedAt
      // The palate replays tastings by `occurredAt`, which the journal keeps
      // equal to `triedAt` — so a backdated tasting weighs as an older one.
      event = { ...event, occurredAt: triedAt }
    }
    next.event = event

    const checked = JournalEntrySchema.safeParse(next)
    if (!checked.success) return { status: 'invalid_input' }
    await journal.put(userId, checked.data)
    return { status: 'ok' }
  })
}

export async function undoTasting(entryId: string): Promise<TastingUpdateResult> {
  if (typeof entryId !== 'string' || entryId.length === 0) return { status: 'invalid_input' }

  return withMaintainerCollection(async ({ userId, journal }) => {
    const entries = await journal.read(userId)
    if (!entries.some((e) => e.id === entryId)) return { status: 'not_found' }
    await journal.remove(userId, entryId)
    return { status: 'ok' }
  })
}
