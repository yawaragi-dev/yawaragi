import { describe, expect, it } from 'vitest'
import { meanRowToProfile } from './catalogue-mean'

describe('the catalogue mean, as Postgres hands it over', () => {
  it('converts pg numeric strings to numbers', () => {
    // `AVG(numeric)` arrives as a string. Left unconverted, every comparison
    // against it would be a string/number comparison and every axis would
    // read "the same" — a row of six meaningless labels, with nothing to
    // notice on screen.
    expect(
      meanRowToProfile({
        f1: '0.4123',
        f2: '0.5000',
        f3: '0.3',
        f4: '0.45',
        f5: '0.52',
        f6: '0.48',
      }),
    ).toEqual({ f1: 0.4123, f2: 0.5, f3: 0.3, f4: 0.45, f5: 0.52, f6: 0.48 })
  })

  it('reports no reference when the mirror has no charts', () => {
    // `AVG` over zero rows is NULL, not 0. Mapped to 0 the tick would sit at
    // the far left and every axis would read "more than most sakes".
    expect(meanRowToProfile({ f1: null, f2: null, f3: null, f4: null, f5: null, f6: null })).toBeNull()
    expect(meanRowToProfile(undefined)).toBeNull()
  })

  it('reports no reference rather than a partial one', () => {
    expect(
      meanRowToProfile({ f1: '0.4', f2: null, f3: '0.3', f4: '0.4', f5: '0.5', f6: '0.5' }),
    ).toBeNull()
  })

  it('reports no reference when a value is not a number', () => {
    expect(
      meanRowToProfile({ f1: 'NaN', f2: '0.5', f3: '0.3', f4: '0.4', f5: '0.5', f6: '0.5' }),
    ).toBeNull()
  })
})
