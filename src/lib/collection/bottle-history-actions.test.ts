import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ source: null as unknown as InMemoryCollectionSource }))

vi.mock('@/lib/collection/collection-source', () => ({ collectionSource: () => h.source }))

import { forgetBottleHad } from '@/lib/collection/bottle-history-actions'
import { bottlesHad } from '@/lib/collection/bottles-had'
import { InMemoryCollectionSource } from '@/lib/collection/in-memory-collection'
import type { InMemoryBottleHistoryStore } from '@/lib/collection/in-memory-record-store'
import type { BottleEvent } from '@/lib/schemas/bottle-event'

const USER = 'user_admin'
const history = () => h.source.history as InMemoryBottleHistoryStore
const event = (id: string, at: number, over: Partial<BottleEvent> = {}): BottleEvent => ({
  schemaVersion: 1,
  id,
  at,
  kind: 'added',
  count: 1,
  thing: { brandId: 7 },
  sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
  sizeMl: 720,
  nama: false,
  ...over,
})

beforeEach(async () => {
  h.source = new InMemoryCollectionSource(USER)
  await history().append(USER, [
    event('a', 1, { count: 2 }),
    event('f', 2, { kind: 'finished' }),
    event('r', 3, { kind: 'removed' }),
  ])
})

describe('taking a bottle off "Bottles you\'ve had"', () => {
  it('removes that bottle from the history and leaves the other one listed', async () => {
    const [removed, finished] = bottlesHad(await history().read(USER))
    expect(await forgetBottleHad(removed!.id)).toEqual({ status: 'ok' })
    expect(bottlesHad(await history().read(USER))).toEqual([finished])
  })

  it('says so when the row is already gone', async () => {
    expect(await forgetBottleHad('gone#0')).toEqual({ status: 'not_found' })
  })

  it('is refused for anyone who cannot keep a collection', async () => {
    h.source.ownerId = false
    expect(await forgetBottleHad('r#0')).toEqual({ status: 'forbidden' })
    expect(await history().read(USER)).toHaveLength(3)
  })

  it('answers unavailable, not a thrown error, when the history cannot be reached', async () => {
    history().failWrites = true
    expect(await forgetBottleHad('r#0')).toEqual({ status: 'unavailable' })
  })
})
