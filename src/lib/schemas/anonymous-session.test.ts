import { describe, expect, it } from 'vitest'
import { AnonymousSessionPayloadSchema } from './anonymous-session'

describe('AnonymousSessionPayloadSchema', () => {
  it('accepts a well-shaped payload', () => {
    const result = AnonymousSessionPayloadSchema.parse({
      v: 1,
      ts: 1_700_000_000_000,
      sid: 'abc123',
    })
    expect(result).toEqual({ v: 1, ts: 1_700_000_000_000, sid: 'abc123' })
  })

  it('rejects a negative timestamp', () => {
    expect(() =>
      AnonymousSessionPayloadSchema.parse({ v: 1, ts: -1, sid: 'abc' }),
    ).toThrow()
  })

  it('rejects an empty sid', () => {
    expect(() =>
      AnonymousSessionPayloadSchema.parse({ v: 1, ts: 0, sid: '' }),
    ).toThrow()
  })

  it('rejects a missing version', () => {
    expect(() =>
      AnonymousSessionPayloadSchema.parse({ ts: 0, sid: 'abc' }),
    ).toThrow()
  })

  it('rejects a non-integer version', () => {
    expect(() =>
      AnonymousSessionPayloadSchema.parse({ v: 1.5, ts: 0, sid: 'abc' }),
    ).toThrow()
  })
})
