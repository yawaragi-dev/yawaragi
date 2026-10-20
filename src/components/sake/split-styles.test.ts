import { describe, expect, it } from 'vitest'
import { splitStyles } from './bottling-name-form'

describe('splitStyles — stored style words back into the bottling form', () => {
  it('puts each word where the form asks for it, without minding case', () => {
    expect(splitStyles(['nama', 'Kimoto', 'Genshu', 'MUROKA', 'Hand-pressed'])).toEqual({
      pasteurisation: 'nama',
      starter: 'kimoto',
      free: ['genshu', 'muroka'],
      other: ['Hand-pressed'],
    })
  })

  it('keeps a second pasteurisation or starter word in "Other" instead of losing it', () => {
    expect(splitStyles(['Nama', 'Namazume', 'Yamahai', 'Kimoto'])).toEqual({
      pasteurisation: 'nama',
      starter: 'yamahai',
      free: [],
      other: ['Namazume', 'Kimoto'],
    })
  })
})
