import { describe, expect, it } from 'vitest'
import { keepBracketsTogether } from './keep-brackets-together'

const WJ = '⁠'

describe('keepBracketsTogether', () => {
  it('stops a line from breaking between the kanji inside brackets', () => {
    expect(keepBracketsTogether('kunshu (薫酒), fragrant sake')).toBe(`kunshu (薫${WJ}酒), fragrant sake`)
  })

  it('leaves text outside brackets free to wrap', () => {
    expect(keepBracketsTogether('Ein Kunshu (貴醸酒) ist duftend')).toBe(`Ein Kunshu (貴${WJ}醸${WJ}酒) ist duftend`)
    expect(keepBracketsTogether('sparkling sake')).toBe('sparkling sake')
  })
})
