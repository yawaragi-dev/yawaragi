import type { JournalEntry } from '@/lib/schemas/journal-entry'

/**
 * A month bucket of journal entries for the timeline view (ADR-0020, P5.5-C).
 * `key` is a stable `YYYY-MM` (UTC) for React keys + grouping; `firstDay` is a
 * timestamp on the first of that month, handed to the locale formatter for the
 * heading ("July 2026" / "Juli 2026").
 */
export interface JournalMonthGroup {
  key: string
  firstDay: number
  entries: JournalEntry[]
}

/**
 * Group entries into months, newest-first (both the months and the entries
 * within each), for the timeline. Buckets by the UTC year+month of `triedAt`
 * (the tasting time), so the grouping is deterministic and TZ-stable in tests.
 *
 * Input may be in any order; `resolveMaintainerJournal` supplies oldest→newest,
 * which this reverses so the most recent tasting sits at the top of the page.
 */
export function groupJournalByMonth(entries: readonly JournalEntry[]): JournalMonthGroup[] {
  const byKey = new Map<string, JournalMonthGroup>()

  for (const entry of entries) {
    const date = new Date(entry.triedAt)
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() // 0-based
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    let group = byKey.get(key)
    if (!group) {
      group = { key, firstDay: Date.UTC(year, month, 1), entries: [] }
      byKey.set(key, group)
    }
    group.entries.push(entry)
  }

  const groups = [...byKey.values()].sort((a, b) => b.firstDay - a.firstDay)
  for (const group of groups) {
    group.entries.sort((a, b) => b.triedAt - a.triedAt)
  }
  return groups
}
