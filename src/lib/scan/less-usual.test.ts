import { describe, expect, it } from 'vitest'
import { lessUsualStyle } from './less-usual'

describe('lessUsualStyle', () => {
  it('names the one less usual style a row carries, from the fixed short list', () => {
    expect(lessUsualStyle([{ styles: ['nama', 'koshu'] }])).toBe('koshu')
    expect(lessUsualStyle([{ styles: ['genshu'] }, { styles: ['hiyaoroshi'] }])).toBe('hiyaoroshi')
  })

  it('says nothing for what is the norm on a bar list: nama, genshu, muroka', () => {
    expect(lessUsualStyle([{ styles: ['nama', 'genshu', 'muroka'] }])).toBeNull()
    expect(lessUsualStyle([{}])).toBeNull()
  })

  it('names one at most, in the list’s order', () => {
    expect(lessUsualStyle([{ styles: ['taruzake', 'kijoshu'] }])).toBe('kijoshu')
  })
})
