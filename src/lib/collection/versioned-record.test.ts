import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  type VersionedRecordCodec,
  assertCodecComplete,
  decodeStoredFields,
  decodeVersionedRecord,
} from '@/lib/collection/versioned-record'

// A toy record whose v1 had `name`, v2 renamed it to `title`, v3 added `tags`.
const Current = z.object({ schemaVersion: z.literal(3), title: z.string(), tags: z.array(z.string()) })
const codec: VersionedRecordCodec<z.infer<typeof Current>> = {
  kind: 'toy',
  current: 3,
  upcasters: {
    1: ({ name, ...rest }) => ({ ...rest, title: name, schemaVersion: 2 }),
    2: (r) => ({ ...r, tags: [], schemaVersion: 3 }),
  },
  schema: Current,
}

describe('decodeVersionedRecord', () => {
  it('reads a record with no version as v1 and walks it up to the current shape', () => {
    expect(decodeVersionedRecord(JSON.stringify({ name: 'a' }), codec)).toEqual({
      ok: true,
      value: { schemaVersion: 3, title: 'a', tags: [] },
    })
  })

  it('starts the chain at the stored version, not at v1', () => {
    const v2 = { schemaVersion: 2, title: 'b' }
    expect(decodeVersionedRecord(JSON.stringify(v2), codec)).toEqual({
      ok: true,
      value: { schemaVersion: 3, title: 'b', tags: [] },
    })
  })

  it('passes a current record through untouched', () => {
    const v3 = { schemaVersion: 3, title: 'c', tags: ['x'] }
    expect(decodeVersionedRecord(JSON.stringify(v3), codec)).toEqual({ ok: true, value: v3 })
  })

  it('says a record from newer code is newer, not corrupt — the rollback case', () => {
    expect(decodeVersionedRecord(JSON.stringify({ schemaVersion: 4 }), codec)).toEqual({
      ok: false,
      reason: 'newer',
    })
  })

  it('tells corrupt JSON, a malformed version and a failed schema apart', () => {
    expect(decodeVersionedRecord('{nope', codec)).toEqual({ ok: false, reason: 'json' })
    expect(decodeVersionedRecord('[1]', codec)).toEqual({ ok: false, reason: 'shape' })
    expect(decodeVersionedRecord('{"schemaVersion":"2"}', codec)).toEqual({ ok: false, reason: 'shape' })
    expect(decodeVersionedRecord('{"schemaVersion":3,"title":1}', codec)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})

describe('decodeStoredFields', () => {
  it('keeps what it cannot read, raw and labelled, beside what it can', () => {
    const dump = decodeStoredFields(
      [
        ['a', JSON.stringify({ name: 'a' })],
        ['b', '{nope'],
      ],
      codec,
    )
    expect(dump.records).toEqual([{ schemaVersion: 3, title: 'a', tags: [] }])
    expect(dump.rejected).toEqual([{ store: 'toy', id: 'b', raw: '{nope', reason: 'json' }])
  })
})

describe('assertCodecComplete', () => {
  it('fails a codec whose version was bumped without the upcaster to reach it', () => {
    expect(() => assertCodecComplete({ ...codec, upcasters: { 1: codec.upcasters[1]! } })).toThrow(
      /no upcaster from v2 to v3/,
    )
    expect(() => assertCodecComplete(codec)).not.toThrow()
  })
})
