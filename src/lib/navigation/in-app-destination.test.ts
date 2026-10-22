import { describe, expect, it } from 'vitest'
import { inAppDestination } from './in-app-destination'

const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
const here = 'https://yawaragi.dev/en/home'
const link = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) => ({
  href,
  target: '',
  download: false,
  ...extra,
})

describe('which taps are a move to another screen', () => {
  it('is a tap on a link to another screen of the app', () => {
    expect(inAppDestination(link('/en/collection?tab=cellar'), plain, here)).toBe('/en/collection?tab=cellar')
  })

  it('is not a link to the screen already open, or a jump within it', () => {
    expect(inAppDestination(link('/en/home'), plain, here)).toBeNull()
    expect(inAppDestination(link('/en/home#recent'), plain, here)).toBeNull()
  })

  it('is not another site, a new tab, a download or a file', () => {
    expect(inAppDestination(link('https://sakenowa.com'), plain, here)).toBeNull()
    expect(inAppDestination(link('/en/sake/1', { target: '_blank' }), plain, here)).toBeNull()
    expect(inAppDestination(link('/en/export', { download: true }), plain, here)).toBeNull()
    expect(inAppDestination(link('/sw.js'), plain, here)).toBeNull()
    expect(inAppDestination(link('/api/sample-collection?locale=en'), plain, here)).toBeNull()
  })

  it('is not a click that opens elsewhere or was already handled', () => {
    expect(inAppDestination(link('/en/scan'), { ...plain, metaKey: true }, here)).toBeNull()
    expect(inAppDestination(link('/en/scan'), { ...plain, button: 1 }, here)).toBeNull()
    expect(inAppDestination(link('/en/scan'), { ...plain, defaultPrevented: true }, here)).toBeNull()
  })
})
