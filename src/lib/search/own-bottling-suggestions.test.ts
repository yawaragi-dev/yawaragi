import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Viewer } from '@/lib/collection/viewer'

const bottlings = [
  { id: 'b1', name: 'Rihaku Wandering Poet' },
  { id: 'b2', name: 'Rihaku Dreamy Clouds' },
  { id: 'b3', name: 'Rihaku Origin of Purity' },
  { id: 'b4', name: 'Dassai 45' },
]

let viewer: Partial<Viewer>
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/collection/viewer', () => ({ resolveViewer: async () => viewer }))

const { ownBottlingSuggestions } = await import('./own-bottling-suggestions')

function as(kind: Viewer['kind'], canLog = kind === 'own') {
  viewer = { kind, canLog, read: (async () => ({ expressions: bottlings })) as unknown as Viewer['read'] }
}

beforeEach(() => as('own'))

describe('your own bottlings while you type in search', () => {
  it('lists at most two of the maintainer’s bottlings whose name holds the query, each with its page', async () => {
    const rows = await ownBottlingSuggestions('rihaku', 'en')

    expect(rows.map((r) => r.id)).toEqual(['b1', 'b2'])
    expect(rows[0].href).toContain('/bottling/b1')
  })

  it('waits for two letters', async () => {
    expect(await ownBottlingSuggestions('r', 'en')).toEqual([])
  })

  it('lists none from the sample collection or the E2E stub', async () => {
    as('sample')
    expect(await ownBottlingSuggestions('rihaku', 'en')).toEqual([])
    as('stub', true)
    expect(await ownBottlingSuggestions('rihaku', 'en')).toEqual([])
  })

  it('lists none when the maintainer’s stores are not set up', async () => {
    as('own', false)
    expect(await ownBottlingSuggestions('rihaku', 'en')).toEqual([])
  })
})
