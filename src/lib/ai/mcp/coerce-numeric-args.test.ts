import { describe, expect, it } from 'vitest'
import { coerceArgsForSchema } from '@/lib/ai/mcp/coerce-numeric-args'

// Trimmed from the real `find_sakes_by_flavor` schema (probed from
// @yawaragi/sakenowa-mcp@0.1.0). The `$ref` indirection is not incidental —
// the server defines the axis bound once and points every other bound at it.
const FLAVOR_SCHEMA = {
  type: 'object',
  properties: {
    f1Min: { type: 'number' },
    f6Min: { $ref: '#/properties/f1Min' },
    tags: { type: 'array', items: { type: 'integer' } },
    topK: { type: 'integer', exclusiveMinimum: 0 },
  },
  additionalProperties: false,
} as const

describe('coerceArgsForSchema', () => {
  it('turns the string numbers a model emits into the numbers the tool declares', () => {
    // The failure this exists for: Haiku called
    // find_sakes_by_flavor({f1Min:"0.55", topK:"30"}) and the server's Zod
    // schema rejected it — three times — burning the step budget.
    const coerced = coerceArgsForSchema({ f1Min: '0.55', topK: '30' }, FLAVOR_SCHEMA)

    expect(coerced).toEqual({ f1Min: 0.55, topK: 30 })
  })

  it('follows $ref so every flavor axis is covered, not just the one defined inline', () => {
    const coerced = coerceArgsForSchema({ f6Min: '0.4' }, FLAVOR_SCHEMA)

    expect(coerced).toEqual({ f6Min: 0.4 })
  })

  it('leaves a numeric-looking string alone when the field is declared a string', () => {
    // A sake really can be named "1234". Blanket coercion would corrupt the
    // query, which is why this is schema-driven rather than shape-guessing.
    const schema = { type: 'object', properties: { query: { type: 'string' } } }
    const coerced = coerceArgsForSchema({ query: '1234' }, schema)

    expect(coerced).toEqual({ query: '1234' })
  })

  it('coerces inside arrays of numbers', () => {
    const coerced = coerceArgsForSchema({ tags: ['1', '2'] }, FLAVOR_SCHEMA)

    expect(coerced).toEqual({ tags: [1, 2] })
  })

  it('passes through anything that is not a clean number, so the server still validates', () => {
    // "" and "abc" are genuinely invalid; silently turning "" into 0 would
    // invent a filter the model never asked for. Let the server reject them.
    const coerced = coerceArgsForSchema(
      { f1Min: 'abc', topK: '', tags: ['x'] },
      FLAVOR_SCHEMA,
    )

    expect(coerced).toEqual({ f1Min: 'abc', topK: '', tags: ['x'] })
  })

  it('leaves already-correct arguments untouched', () => {
    const coerced = coerceArgsForSchema({ f1Min: 0.55, topK: 30 }, FLAVOR_SCHEMA)

    expect(coerced).toEqual({ f1Min: 0.55, topK: 30 })
  })
})
