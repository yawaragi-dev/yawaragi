import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { summarizeZodError } from './zod-error-summary'

const Item = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  kind: z.enum(['alpha', 'beta']),
})

function parseExpectError<T>(schema: z.ZodType<T>, input: unknown): z.ZodError {
  const result = schema.safeParse(input)
  if (result.success) throw new Error('expected parse to fail')
  return result.error
}

describe('summarizeZodError', () => {
  it('names the path and code for a too_small string', () => {
    const err = parseExpectError(Item, { id: 1, name: '', kind: 'alpha' })
    const out = summarizeZodError(err)
    expect(out).toContain('[name]')
    expect(out).toContain('too_small')
    expect(out).toContain('>=')
  })

  it('names the path and expected type for an invalid_type', () => {
    const err = parseExpectError(Item, { id: 'not-a-number', name: 'x', kind: 'alpha' })
    const out = summarizeZodError(err)
    expect(out).toContain('[id]')
    expect(out).toContain('invalid_type')
    expect(out).toContain('number')
  })

  it('reports invalid enum without disclosing the rejected value', () => {
    const out = summarizeZodError(
      parseExpectError(Item, { id: 1, name: 'x', kind: 'super-secret-pii-payload' }),
    )
    expect(out).toContain('[kind]')
    expect(out).not.toContain('super-secret-pii-payload')
  })

  it('does not leak received values for primitives', () => {
    // Common path: a malformed brand row carries kanji that we treat as
    // public reference data today, but the *same* parser will later be
    // used on LLM-extracted label-scan output. Make sure the error
    // summary doesn't drag the raw value into a log line.
    const SENTINEL = 'CUSTOMER-EMAIL@example.com'
    const out = summarizeZodError(parseExpectError(Item, { id: -1, name: SENTINEL, kind: 'alpha' }))
    expect(out).not.toContain(SENTINEL)
  })

  it('caps at the sample size and reports the remainder', () => {
    const Bag = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      e: z.string(),
      f: z.string(),
    })
    const out = summarizeZodError(parseExpectError(Bag, {}), { sampleSize: 2 })
    expect(out).toMatch(/^6 issue\(s\):/)
    expect(out).toMatch(/\(\+4 more\)$/)
  })

  it('walks into nested paths with dots', () => {
    const Envelope = z.object({ items: z.array(Item) })
    const out = summarizeZodError(
      parseExpectError(Envelope, { items: [{ id: 1, name: 'x', kind: 'alpha' }, { id: 1, name: '', kind: 'alpha' }] }),
    )
    expect(out).toContain('[items.1.name]')
  })
})
