import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BottleHistoryStore } from '@/lib/collection/bottle-history-store'
import { InMemoryCollectionSource } from '@/lib/collection/in-memory-collection'
import { STUB_BOTTLE_HISTORY, STUB_CELLAR, STUB_EXPRESSIONS, STUB_JOURNAL_ENTRIES, STUB_JOURNAL_NOW } from '@/lib/taste/journal-stub'

let source: InMemoryCollectionSource
vi.mock('@/lib/collection/collection-source', () => ({ collectionSource: () => source }))

const SAMPLE = {
  journal: { kind: 'journal' as const, entries: STUB_JOURNAL_ENTRIES.slice(0, 1), profile: {} },
  entries: STUB_JOURNAL_ENTRIES.slice(0, 1),
  cellar: STUB_CELLAR.slice(0, 1),
  expressions: [],
  history: [],
}
const readSampleJournal = vi.fn(async () => SAMPLE)
vi.mock('@/lib/demo/sample-mode', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/demo/sample-mode')>()),
  readSampleJournal: () => readSampleJournal(),
}))

const { resolveViewer } = await import('./viewer')

function jar(cookies: Record<string, string> = {}) {
  return { get: (name: string) => (name in cookies ? { name, value: cookies[name] } : undefined) } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  source = new InMemoryCollectionSource(false)
})

describe('who is looking at a collection', () => {
  it('is nobody for a visitor without an account who did not ask for the sample', async () => {
    const viewer = await resolveViewer(jar())

    expect(viewer).toMatchObject({ kind: 'none', canLog: false, canView: false, readOnly: false, copyOwner: undefined })
    expect(await viewer.read('journal', 'cellar')).toEqual({ journal: { kind: 'unavailable' }, cellar: [] })
  })

  it('is the maintainer, with their own collection, newest tasting first', async () => {
    source.ownerId = 'user_me'
    for (const entry of [...STUB_JOURNAL_ENTRIES].reverse()) await source.journal.put('user_me', entry)
    for (const bottle of STUB_CELLAR) await source.cellar.put('user_me', bottle)
    for (const bottling of STUB_EXPRESSIONS) await source.expressions.put('user_me', bottling)
    await source.history.append('user_me', STUB_BOTTLE_HISTORY)

    const viewer = await resolveViewer(jar())
    const { journal, cellar, expressions, history } = await viewer.read('journal', 'cellar', 'expressions', 'history')

    expect(viewer).toMatchObject({ kind: 'own', canLog: true, canView: true, readOnly: false, copyOwner: 'user_me' })
    expect(journal.kind === 'journal' && journal.entries.map((e) => e.triedAt)).toEqual(
      [...STUB_JOURNAL_ENTRIES].map((e) => e.triedAt).sort((a, b) => b - a),
    )
    expect(cellar).toHaveLength(STUB_CELLAR.length)
    expect(expressions).toHaveLength(STUB_EXPRESSIONS.length)
    expect(history).toHaveLength(STUB_BOTTLE_HISTORY.length)
  })

  it('always shows a signed-in maintainer their own collection, never the sample', async () => {
    source.ownerId = 'user_me'

    const viewer = await resolveViewer(jar({ yawaragi_sample: '1' }))

    expect(viewer.kind).toBe('own')
    expect(readSampleJournal).not.toHaveBeenCalled()
  })

  it('cannot log for a maintainer when the stores are not configured', async () => {
    source.ownerId = 'user_me'
    source.configured = false

    const viewer = await resolveViewer(jar())

    expect(viewer).toMatchObject({ kind: 'own', canLog: false, canView: false })
    expect((await viewer.read('journal')).journal).toEqual({ kind: 'unavailable' })
  })

  it('says the bottle history could not be read, rather than listing nothing', async () => {
    source.ownerId = 'user_me'
    source.history = { read: async () => Promise.reject(new Error('down')) } as unknown as BottleHistoryStore

    const viewer = await resolveViewer(jar())

    expect((await viewer.read('history')).history).toBeNull()
  })

  it('shows the sample, read-only and never saved offline, reading it once for every part', async () => {
    const viewer = await resolveViewer(jar({ yawaragi_sample: '1' }))
    const parts = await viewer.read('journal', 'cellar', 'expressions', 'history')

    expect(viewer).toMatchObject({ kind: 'sample', canLog: false, canView: true, readOnly: true, copyOwner: undefined })
    expect(parts.cellar).toEqual(SAMPLE.cellar)
    expect(parts.journal).toEqual(SAMPLE.journal)
    expect(readSampleJournal).toHaveBeenCalledTimes(1)
  })

  it('stands the E2E stub in for the maintainer, on its fixed clock, with its bottlings', async () => {
    const owner = vi.spyOn(source, 'owner')
    const viewer = await resolveViewer(jar({ yawaragi_journal_stub: 'populated' }))
    const { expressions, history } = await viewer.read('expressions', 'history')

    expect(viewer).toMatchObject({ kind: 'stub', canLog: true, canView: true, readOnly: false, now: STUB_JOURNAL_NOW })
    expect(expressions.length).toBeGreaterThan(0)
    expect(history).not.toBeNull()
    expect(owner).not.toHaveBeenCalled()
  })

  it('lets the stub play a journal that cannot be read', async () => {
    const viewer = await resolveViewer(jar({ yawaragi_journal_stub: 'unavailable' }))

    expect(viewer).toMatchObject({ kind: 'stub', canLog: false, canView: false })
  })
})
