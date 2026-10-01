import { describe, expect, it } from 'vitest'
import { ARRIVED_VIA_SCAN_QUERY, hasArrivedViaScan } from './arrived-via-scan'

describe('arrived-via-scan', () => {
  it('reports false for a visitor who navigated directly (no query)', () => {
    expect(hasArrivedViaScan({})).toBe(false)
  })

  it('reports true for the query a scan result links with', () => {
    expect(hasArrivedViaScan(ARRIVED_VIA_SCAN_QUERY)).toBe(true)
  })

  it('ignores any other value of the same parameter', () => {
    expect(hasArrivedViaScan({ from: 'search' })).toBe(false)
    expect(hasArrivedViaScan({ from: ['scan', 'scan'] })).toBe(false)
  })
})
