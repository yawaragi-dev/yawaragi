import { describe, expect, it, vi } from 'vitest'
import { transliterateBatch } from './romaji'

describe('transliterateBatch', () => {
  it('returns one result per input, in the same order', async () => {
    const call = vi.fn(async (kanji: string) => `${kanji}-rom`)
    const result = await transliterateBatch(
      [
        { id: 1, nameKanji: '獺祭' },
        { id: 2, nameKanji: '久保田' },
        { id: 3, nameKanji: '八海山' },
      ],
      { call },
    )
    expect(result).toEqual([
      { id: 1, nameRomaji: '獺祭-rom' },
      { id: 2, nameRomaji: '久保田-rom' },
      { id: 3, nameRomaji: '八海山-rom' },
    ])
    expect(call).toHaveBeenCalledTimes(3)
  })

  it('short-circuits empty kanji to null without calling the LLM', async () => {
    // Sakenowa's ~48 placeholder brewery rows have empty `name_kanji` —
    // we shouldn't spend a model call on each one. Empty input maps to
    // `nameRomaji: null` directly.
    const call = vi.fn(async () => {
      throw new Error('should not be called for empty input')
    })
    const result = await transliterateBatch(
      [
        { id: 1, nameKanji: '' },
        { id: 2, nameKanji: '   ' }, // whitespace-only also counts
      ],
      { call },
    )
    expect(result).toEqual([
      { id: 1, nameRomaji: null },
      { id: 2, nameRomaji: null },
    ])
    expect(call).not.toHaveBeenCalled()
  })

  it('captures per-item failures without sinking the whole batch', async () => {
    let n = 0
    const call = vi.fn(async (kanji: string) => {
      n++
      if (kanji === '失敗') {
        const err = new Error('mocked transliteration failure')
        err.name = 'AI_TestError'
        throw err
      }
      return `${kanji}-rom`
    })

    const result = await transliterateBatch(
      [
        { id: 1, nameKanji: '獺祭' },
        { id: 2, nameKanji: '失敗' },
        { id: 3, nameKanji: '久保田' },
      ],
      { call },
    )
    expect(result[0]).toEqual({ id: 1, nameRomaji: '獺祭-rom' })
    expect(result[1]).toEqual({ id: 2, nameRomaji: null, error: 'AI_TestError' })
    expect(result[2]).toEqual({ id: 3, nameRomaji: '久保田-rom' })
    expect(n).toBe(3) // all three were attempted; only the middle failed
  })

  it('respects the concurrency cap', async () => {
    // Track simultaneous in-flight calls. A concurrency of 2 over 6
    // items means the in-flight counter should never exceed 2.
    let inFlight = 0
    let peakInFlight = 0
    const call = vi.fn(async (kanji: string) => {
      inFlight++
      peakInFlight = Math.max(peakInFlight, inFlight)
      // Yield a microtask so the workers actually contend.
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return `${kanji}-r`
    })

    await transliterateBatch(
      Array.from({ length: 6 }, (_, i) => ({ id: i + 1, nameKanji: `K${i}` })),
      { call, concurrency: 2 },
    )

    expect(peakInFlight).toBeLessThanOrEqual(2)
    expect(call).toHaveBeenCalledTimes(6)
  })

  it('fires onProgress in monotonically-increasing order with the running total', async () => {
    const call = async (kanji: string) => `${kanji}-r`
    const progress: Array<[number, number]> = []
    await transliterateBatch(
      Array.from({ length: 4 }, (_, i) => ({ id: i + 1, nameKanji: `K${i}` })),
      {
        call,
        concurrency: 2,
        onProgress: (completed, total) => progress.push([completed, total]),
      },
    )
    expect(progress.map(([c]) => c)).toEqual([1, 2, 3, 4])
    expect(progress.every(([, t]) => t === 4)).toBe(true)
  })

  it('returns an empty array immediately for an empty input', async () => {
    const call = vi.fn(async () => 'should not be called')
    const result = await transliterateBatch([], { call })
    expect(result).toEqual([])
    expect(call).not.toHaveBeenCalled()
  })
})
