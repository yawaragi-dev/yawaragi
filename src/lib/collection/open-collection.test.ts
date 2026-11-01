import { describe, expect, it, vi } from 'vitest'
import { InMemoryCollectionSource } from '@/lib/collection/in-memory-collection'
import { openCollection } from '@/lib/collection/open-collection'

describe('opening a collection', () => {
  it('opens the maintainer their own collection, with all four stores', async () => {
    const source = new InMemoryCollectionSource('user_me')

    expect(await openCollection(source)).toEqual({
      userId: 'user_me',
      journal: source.journal,
      cellar: source.cellar,
      expressions: source.expressions,
      history: source.history,
    })
  })

  it('refuses a visitor who is not a maintainer without touching a store', async () => {
    const source = new InMemoryCollectionSource(false)
    const stores = vi.spyOn(source, 'stores')

    expect(await openCollection(source)).toEqual({ status: 'forbidden', maintainer: false })
    expect(stores).not.toHaveBeenCalled()
  })

  it('refuses a maintainer the sign-in could not name, saying they are one', async () => {
    expect(await openCollection(new InMemoryCollectionSource(null))).toEqual({ status: 'forbidden', maintainer: true })
  })

  it('says the collection is unavailable, for whom, when the stores are not configured', async () => {
    const source = new InMemoryCollectionSource('user_me')
    source.configured = false

    expect(await openCollection(source)).toEqual({ status: 'unavailable', userId: 'user_me' })
  })
})
