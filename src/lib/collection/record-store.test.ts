import { describe, expect, it } from 'vitest'
import { BOTTLE_HISTORY_RECORDS } from '@/lib/collection/bottle-history-store'
import { newCellarRow } from '@/lib/collection/cellar'
import { CELLAR_RECORDS } from '@/lib/collection/cellar-store'
import { EXPRESSION_RECORDS } from '@/lib/collection/expression-store'
import { InMemoryRecordStore } from '@/lib/collection/in-memory-record-store'
import { recordStoreKey } from '@/lib/collection/record-store'
import {
  type RecordStoreContractFixture,
  fakeUpstashRest,
  recordStoreContract,
} from '@/lib/collection/record-store-contract'
import { UpstashHash } from '@/lib/collection/upstash-hash'
import { UpstashRecordStore } from '@/lib/collection/upstash-record-store'
import { BOTTLE_EVENT_SCHEMA_VERSION, type BottleEvent } from '@/lib/schemas/bottle-event'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import { EXPRESSION_SCHEMA_VERSION, type Expression } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { JOURNAL_RECORDS } from '@/lib/taste/journal-store'

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }

type Kind<T> = Omit<RecordStoreContractFixture<T>, 'make'>

const journal: Kind<JournalEntry> = {
  spec: JOURNAL_RECORDS,
  record: (n) => ({
    schemaVersion: 3,
    id: `entry-${n}`,
    event: { kind: 'rating', rating: 4, brandId: n, target: TARGET, occurredAt: n * 10 },
    sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
    triedAt: n * 10,
    createdAt: n * 10,
  }),
  edit: (entry) => ({ ...entry, notes: 'edited' }),
}

const cellar: Kind<CellarBottle> = {
  spec: CELLAR_RECORDS,
  record: (n) =>
    newCellarRow({ brandId: n, nameKanji: '而今', nameRomaji: 'Jikon' }, { sizeMl: 720, nama: false }, 1, 1000),
  edit: (row) => ({ ...row, count: 2 }),
}

const expressions: Kind<Expression> = {
  spec: EXPRESSION_RECORDS,
  record: (n) => ({
    schemaVersion: EXPRESSION_SCHEMA_VERSION,
    id: `bottling-${n}`,
    own: true,
    brandId: null,
    line: null,
    name: `富久千代 ${n}`,
    createdAt: n,
    updatedAt: n,
  }),
  edit: (expression) => ({ ...expression, name: 'Nama 2025' }),
}

const bottleHistory: Kind<BottleEvent> = {
  spec: BOTTLE_HISTORY_RECORDS,
  record: (n) => ({
    schemaVersion: BOTTLE_EVENT_SCHEMA_VERSION,
    id: `event-${n}`,
    at: n,
    kind: 'added',
    count: 1,
    thing: { brandId: 7 },
    sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
    sizeMl: 720,
    nama: false,
  }),
  edit: (event) => ({ ...event, count: 2 }),
}

function inMemory<T>(kind: Kind<T>): RecordStoreContractFixture<T> {
  return {
    ...kind,
    make: () => {
      const store = new InMemoryRecordStore(kind.spec)
      return { store, putRaw: async (userId, field, raw) => store.putRaw(userId, field, raw) }
    },
  }
}

function upstash<T>(kind: Kind<T>): RecordStoreContractFixture<T> {
  return {
    ...kind,
    make: () => {
      const rest = fakeUpstashRest()
      const store = new UpstashRecordStore(kind.spec, 'https://kv', 'tok', rest)
      const hash = new UpstashHash('https://kv', 'tok', rest)
      return {
        store,
        putRaw: (userId, field, raw) => hash.set(recordStoreKey(kind.spec, userId), field, raw),
      }
    },
  }
}

recordStoreContract('tasting journal, in memory', inMemory(journal))
recordStoreContract('tasting journal, on Upstash', upstash(journal))
recordStoreContract('cellar, in memory', inMemory(cellar))
recordStoreContract('cellar, on Upstash', upstash(cellar))
recordStoreContract('own bottlings, in memory', inMemory(expressions))
recordStoreContract('own bottlings, on Upstash', upstash(expressions))
recordStoreContract('bottle history, in memory', inMemory(bottleHistory))
recordStoreContract('bottle history, on Upstash', upstash(bottleHistory))

describe('a store Upstash cannot answer', () => {
  it('throws rather than reporting an empty collection', async () => {
    const failing = (async () => ({ ok: false, status: 500 }) as Response) as unknown as typeof fetch
    const store = new UpstashRecordStore(JOURNAL_RECORDS, 'https://kv', 'tok', failing)
    await expect(store.read('u')).rejects.toThrow(/Upstash REST error 500/)
  })
})
