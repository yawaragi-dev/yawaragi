import type { BottleEvent } from '@/lib/schemas/bottle-event'

/**
 * "Bottles you've had" (design v1.10, AB6; 131, 132): the bottles that are no
 * longer in the cellar, one per bottle, newest first — read off the bottle
 * history. Pure.
 *
 * The history records what happened to bottle *counts* ("2 added", "1
 * finished"), not to named bottles, so this pairs them up: every `added`
 * event is that many bottles, and every `opened`, `finished` or `removed`
 * event takes its bottles from the ones of the same thing still there —
 * first those of the same size and kind (nama or not), then any; for
 * `finished` the open ones first, for `removed` the sealed ones; the oldest
 * first within each. That is the cellar's own rule (a finish takes the open
 * bottle, a remove a sealed one), so the dates read the way the visitor
 * remembers them. An end with no bottle left to take (a history that began
 * after the bottle was added) still lists, with no "Added" date.
 *
 * No totals and no grouping by month, on purpose (AB6, X5): the list is a
 * memory aid, not a tally of what was drunk.
 */

export interface HadBottle {
  /** Stable for this history: `<end event id>#<n>`, n counting from 0 within that event. */
  id: string
  how: 'finished' | 'removed'
  /** When it went into the cellar; `null` when the history does not say. */
  addedAt: number | null
  endedAt: number
  thing: BottleEvent['thing']
  sake: BottleEvent['sake']
}

/** One bottle, while it is being followed through the history. */
interface Unit {
  thingKey: string
  sizeMl: BottleEvent['sizeMl']
  nama: boolean
  addedId: string
  addedAt: number
  openedId: string | null
  /** Its place among the units of its `added` event. */
  order: number
}

/** The events a bottle's history is made of, for {@link forgetHadBottle}. */
interface Paired {
  bottle: HadBottle
  addedId: string | null
  openedId: string | null
  endId: string
}

export const thingKey = (thing: BottleEvent['thing']): string =>
  thing.expression ? `x:${thing.expression.id}` : `s:${thing.brandId}`

function pairUp(events: readonly BottleEvent[]): Paired[] {
  const ordered = [...events].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const there: Unit[] = []
  const had: Paired[] = []

  /** Up to `count` of the bottles of `event`'s thing still there, in the order described above. */
  const take = (event: BottleEvent, count: number, prefer: (u: Unit) => boolean): Unit[] => {
    const key = thingKey(event.thing)
    const sameKind = (u: Unit) => u.sizeMl === event.sizeMl && u.nama === event.nama
    const rank = (u: Unit) => (sameKind(u) ? 0 : 2) + (prefer(u) ? 0 : 1)
    const candidates = there
      .filter((u) => u.thingKey === key)
      .sort((a, b) => rank(a) - rank(b) || a.addedAt - b.addedAt || a.order - b.order)
    return candidates.slice(0, count)
  }

  for (const event of ordered) {
    if (event.kind === 'added') {
      for (let i = 0; i < event.count; i++) {
        there.push({
          thingKey: thingKey(event.thing),
          sizeMl: event.sizeMl,
          nama: event.nama,
          addedId: event.id,
          addedAt: event.at,
          openedId: null,
          order: i,
        })
      }
      continue
    }
    if (event.kind === 'opened') {
      for (const unit of take(event, event.count, (u) => u.openedId === null)) {
        if (unit.openedId === null) unit.openedId = event.id
      }
      continue
    }
    const how = event.kind
    const taken = take(event, event.count, (u) => (how === 'finished' ? u.openedId !== null : u.openedId === null))
    for (let i = 0; i < event.count; i++) {
      const unit = taken[i]
      if (unit) there.splice(there.indexOf(unit), 1)
      had.push({
        bottle: {
          id: `${event.id}#${i}`,
          how,
          addedAt: unit?.addedAt ?? null,
          endedAt: event.at,
          thing: event.thing,
          sake: event.sake,
        },
        addedId: unit?.addedId ?? null,
        openedId: unit?.openedId ?? null,
        endId: event.id,
      })
    }
  }
  return had
}

/** The bottles no longer in the cellar, the most recently finished or removed first. */
export function bottlesHad(events: readonly BottleEvent[]): HadBottle[] {
  return pairUp(events)
    .map((p) => p.bottle)
    .reverse()
}

/** What taking one bottle off the list changes in the stored history. */
export interface HistoryRewrite {
  /** Events to store again with one bottle fewer. */
  put: BottleEvent[]
  /** Ids of events that held only this bottle, to delete. */
  drop: string[]
}

/**
 * Take one bottle off "Bottles you've had" (AB6: "rows are removed one by
 * one"): its `added`, `opened` and `finished`/`removed` lines lose that
 * bottle — an event of one bottle is deleted, a larger one stored again one
 * bottle smaller. Afterwards the bottle is gone from the list, from "Bottles
 * you've kept" and from the export, as if it had never been logged; the
 * other bottles pair up exactly as before. `null` when there is no such row.
 */
export function forgetHadBottle(events: readonly BottleEvent[], bottleId: string): HistoryRewrite | null {
  const row = pairUp(events).find((p) => p.bottle.id === bottleId)
  if (!row) return null
  const byId = new Map(events.map((e) => [e.id, e]))
  const rewrite: HistoryRewrite = { put: [], drop: [] }
  for (const id of [row.endId, row.addedId, row.openedId]) {
    const stored = id === null ? undefined : byId.get(id)
    if (!stored) continue
    if (stored.count <= 1) rewrite.drop.push(stored.id)
    else rewrite.put.push({ ...stored, count: stored.count - 1 })
  }
  return rewrite
}
