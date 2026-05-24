import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import de from '../../messages/de.json'
import { diffMessageKeys } from './messages-parity'

describe('diffMessageKeys', () => {
  it('reports a key missing from the second catalogue', () => {
    const a = { greet: { hi: 'Hi' } }
    const b = { greet: {} }
    expect(diffMessageKeys(a, b)).toEqual({
      missingInB: ['greet.hi'],
      missingInA: [],
    })
  })

  it('reports a key missing from the first catalogue', () => {
    const a = { greet: {} }
    const b = { greet: { hi: 'Hallo' } }
    expect(diffMessageKeys(a, b)).toEqual({
      missingInB: [],
      missingInA: ['greet.hi'],
    })
  })

  it('returns no diffs when catalogues mirror each other', () => {
    const a = { greet: { hi: 'Hi' }, common: { ok: 'OK' } }
    const b = { greet: { hi: 'Hallo' }, common: { ok: 'OK' } }
    expect(diffMessageKeys(a, b)).toEqual({ missingInB: [], missingInA: [] })
  })
})

describe('shipped catalogues', () => {
  it('en.json and de.json have identical key structures', () => {
    expect(diffMessageKeys(en, de)).toEqual({ missingInB: [], missingInA: [] })
  })
})
