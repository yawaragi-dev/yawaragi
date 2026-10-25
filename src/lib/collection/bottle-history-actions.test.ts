import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ history: null as unknown }))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_admin' })) }))
vi.mock('@/lib/auth/maintainer', () => ({ currentUserIsMaintainer: vi.fn(async () => true) }))
vi.mock('@/lib/taste/get-journal-store', async () => {
  const { InMemoryJournalStore } = await import('@/lib/taste/in-memory-journal-store')
  return { getJournalStore: vi.fn(() => new InMemoryJournalStore()) }
})
vi.mock('@/lib/collection/get-cellar-store', async () => {
  const { InMemoryCellarStore } = await import('@/lib/collection/in-memory-cellar-store')
  return { getCellarStore: vi.fn(() => new InMemoryCellarStore()) }
})
vi.mock('@/lib/collection/get-expression-store', async () => {
  const { InMemoryExpressionStore } = await import('@/lib/collection/in-memory-expression-store')
  return { getExpressionStore: vi.fn(() => new InMemoryExpressionStore()) }
})
vi.mock('@/lib/collection/get-bottle-history-store', () => ({ getBottleHistoryStore: vi.fn(() => h.history) }))

import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { forgetBottleHad } from '@/lib/collection/bottle-history-actions'
import { bottlesHad } from '@/lib/collection/bottles-had'
import { InMemoryBottleHistoryStore } from '@/lib/collection/in-memory-bottle-history-store'
import type { BottleEvent } from '@/lib/schemas/bottle-event'

const USER = 'user_admin'
const history = () => h.history as InMemoryBottleHistoryStore
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
  vi.clearAllMocks()
  vi.mocked(currentUserIsMaintainer).mockResolvedValue(true)
  h.history = new InMemoryBottleHistoryStore()
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
    vi.mocked(currentUserIsMaintainer).mockResolvedValue(false)
    expect(await forgetBottleHad('r#0')).toEqual({ status: 'forbidden' })
    expect(await history().read(USER)).toHaveLength(3)
  })

  it('answers unavailable, not a thrown error, when the history cannot be reached', async () => {
    history().failWrites = true
    expect(await forgetBottleHad('r#0')).toEqual({ status: 'unavailable' })
  })
})
