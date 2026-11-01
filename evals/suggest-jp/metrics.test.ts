import { describe, expect, it } from 'vitest'
import { GROUND_TRUTH } from './ground-truth'
import { meanRecall, recallAtK } from './metrics'

// The metric is the only part of the suggest eval CI runs; the runner
// itself makes paid model calls and stays informational.

describe('recallAtK — a perfect top k scores 1.0 whatever the answer key size', () => {
  it('scores a perfect top 5 as 1.0 when the answer key holds 10 brands', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const score = recallAtK([1, 2, 3, 4, 5], expected, 5)
    expect(score.normalized).toBe(1)
    // The pre-#289 number stays visible, capped at 5/10.
    expect(score.raw).toBe(0.5)
    expect(score.attainable).toBe(0.5)
  })

  it('scores a perfect top 3 as 1.0 when the answer key holds exactly 3 brands', () => {
    const score = recallAtK([7, 8, 9], [9, 8, 7], 3)
    expect(score).toEqual({ hits: 3, raw: 1, attainable: 1, normalized: 1 })
  })

  it('needs only the one expected brand in the top k when the answer key is smaller than k', () => {
    const score = recallAtK([42, 887, 43, 44, 45], [887], 5)
    expect(score).toEqual({ hits: 1, raw: 1, attainable: 1, normalized: 1 })
  })

  it('gives partial credit against what the top k could hold, not against the whole key', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8]
    const score = recallAtK([1, 99, 2, 98, 97], expected, 5)
    expect(score.hits).toBe(2)
    expect(score.normalized).toBeCloseTo(2 / 5)
    expect(score.raw).toBeCloseTo(2 / 8)
    expect(score.attainable).toBeCloseTo(5 / 8)
  })

  it('looks only at the first k returned brands', () => {
    expect(recallAtK([99, 98, 97, 1, 2], [1, 2], 3).hits).toBe(0)
    expect(recallAtK([99, 98, 97, 1, 2], [1, 2], 5).normalized).toBe(1)
  })

  it('counts a brand returned twice as one hit', () => {
    const score = recallAtK([1, 1, 1], [1, 2, 3], 3)
    expect(score.hits).toBe(1)
    expect(score.normalized).toBeCloseTo(1 / 3)
  })

  it('still holds a short answer list to k, so returning fewer brands is not rewarded', () => {
    const score = recallAtK([1], [1, 2, 3, 4, 5, 6], 5)
    expect(score.normalized).toBeCloseTo(1 / 5)
  })

  it('scores no returned brands as 0', () => {
    expect(recallAtK([], [1, 2, 3, 4, 5, 6, 7, 8], 5)).toEqual({ hits: 0, raw: 0, attainable: 5 / 8, normalized: 0 })
  })

  it('scores an empty answer key as 0 rather than dividing by zero', () => {
    expect(recallAtK([1, 2, 3], [], 3)).toEqual({ hits: 0, raw: 0, attainable: 0, normalized: 0 })
  })

  it('rejects a k that is not a positive whole number', () => {
    expect(() => recallAtK([1], [1], 0)).toThrow(RangeError)
    expect(() => recallAtK([1], [1], 2.5)).toThrow(RangeError)
  })
})

describe('meanRecall — the summary row', () => {
  it('averages each query equally', () => {
    const mean = meanRecall([recallAtK([1, 2, 3], [1, 2, 3], 3), recallAtK([9], [1, 2, 3, 4, 5, 6], 3)])
    expect(mean?.normalized).toBeCloseTo(0.5)
    expect(mean?.raw).toBeCloseTo(0.5)
    expect(mean?.attainable).toBeCloseTo((1 + 0.5) / 2)
  })

  it('has no mean for a run with no answered queries', () => {
    expect(meanRecall([])).toBeNull()
  })

  it('caps the current answer key at a raw mean of 0.514 at k=3 and 0.679 at k=5 — the ceiling #289 found', () => {
    // A run that returns exactly the answer key, in order, is a perfect run.
    const perfect = (k: number) =>
      meanRecall(GROUND_TRUTH.map((g) => recallAtK(g.expectedBrandIds, g.expectedBrandIds, k)))
    expect(perfect(3)?.raw).toBeCloseTo(0.514, 3)
    expect(perfect(3)?.attainable).toBeCloseTo(0.514, 3)
    expect(perfect(3)?.normalized).toBe(1)
    expect(perfect(5)?.raw).toBeCloseTo(0.679, 3)
    expect(perfect(5)?.normalized).toBe(1)
  })
})
