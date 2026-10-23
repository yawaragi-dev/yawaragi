import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { JournalEntry } from '@/lib/schemas/journal-entry'

/**
 * The read-only copy of a visitor's journal and cellar kept on their own
 * device, shown when Collection cannot load for want of a network (design
 * question Z). Only what the offline page draws: names, stars, the note, the
 * date; bottle counts and sizes. Never detailed notes, tags or ids of other
 * people. It lives in this browser's IndexedDB, is replaced on every online
 * visit to Collection and is wiped when the visitor signs out (ADR-0009).
 *
 * The offline page (`/api/offline/[locale]/collection`) reads it with its own
 * few lines of script, so the stored shape is a contract: bump `v` and teach
 * that page the new shape together.
 */
/** v2 adds each tasting's id and brewery (design v1.9 Z3's row sheet); v1 copies still read. */
export const OFFLINE_COPY_VERSION = 2 as const

export interface OfflineCollectionCopy {
  v: 1 | typeof OFFLINE_COPY_VERSION
  /** Whose copy it is: the Clerk user id the server rendered for, or null. */
  owner: string | null
  /** Epoch ms of the online visit that wrote it. */
  savedAt: number
  journal: {
    /** v2: the tasting's id, so a row tapped offline finds its own entry. */
    id?: string
    name: string
    kanji: string | null
    /** v2: the brewery's name as shown, for the row's sheet (Z3). */
    brewery?: string | null
    rating: number | null
    note: string | null
    triedAt: number
  }[]
  cellar: { name: string; kanji: string | null; count: number; sizeMl: number | null; open: boolean; nama: boolean }[]
}

function names(sake: { nameKanji: string; nameRomaji: string | null }, bottling?: { name: string }) {
  const name = bottling?.name ?? sake.nameRomaji ?? sake.nameKanji
  return { name, kanji: name === sake.nameKanji ? null : sake.nameKanji }
}

export function toOfflineCopy(
  entries: readonly JournalEntry[],
  cellar: readonly CellarBottle[],
  owner: string | null,
  savedAt: number,
  breweryOf: (entry: JournalEntry) => string | null = () => null,
): OfflineCollectionCopy {
  return {
    v: OFFLINE_COPY_VERSION,
    owner,
    savedAt,
    journal: entries.map((entry) => ({
      id: entry.id,
      ...names(entry.sake, entry.expression),
      brewery: breweryOf(entry),
      rating: entry.event.kind === 'rating' ? entry.event.rating : null,
      note: entry.notes ?? null,
      triedAt: entry.triedAt,
    })),
    cellar: cellar.map((row) => ({
      ...names(row.sake, row.expression),
      count: row.count,
      sizeMl: row.sizeMl,
      open: row.openedAt !== null,
      nama: row.nama,
    })),
  }
}

// IndexedDB, one record. The names are shared with the offline page's script.
export const OFFLINE_DB = 'yawaragi-offline'
export const OFFLINE_STORE = 'copy'
export const OFFLINE_KEY = 'collection'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(OFFLINE_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const request = act(db.transaction(OFFLINE_STORE, mode).objectStore(OFFLINE_STORE))
        request.onsuccess = () => {
          resolve(request.result)
          db.close()
        }
        request.onerror = () => {
          reject(request.error)
          db.close()
        }
      }),
  )
}

export function saveOfflineCopy(copy: OfflineCollectionCopy): Promise<unknown> {
  return run('readwrite', (store) => store.put(copy, OFFLINE_KEY))
}

export function readOfflineCopy(): Promise<OfflineCollectionCopy | undefined> {
  return run('readonly', (store) => store.get(OFFLINE_KEY)) as Promise<OfflineCollectionCopy | undefined>
}

export function clearOfflineCopy(): Promise<unknown> {
  return run('readwrite', (store) => store.delete(OFFLINE_KEY))
}

/**
 * A marker in localStorage that a copy exists, so a page can decide to clear
 * it without opening (and so creating) the database for every visitor.
 */
const MARKER = 'yawaragi-offline-copy'

export function markOfflineCopy(on: boolean): void {
  try {
    if (on) localStorage.setItem(MARKER, '1')
    else localStorage.removeItem(MARKER)
  } catch {
    // Storage blocked: the copy may outlive a sign-out until the next save.
  }
}

export function hasOfflineCopyMarker(): boolean {
  try {
    return localStorage.getItem(MARKER) === '1'
  } catch {
    return false
  }
}
