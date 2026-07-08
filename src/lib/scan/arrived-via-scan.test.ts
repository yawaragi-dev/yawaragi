import { afterEach, describe, expect, it } from 'vitest'
import {
  ARRIVED_VIA_SCAN_KEY,
  hasArrivedViaScan,
  markArrivedViaScan,
} from './arrived-via-scan'

describe('arrived-via-scan marker', () => {
  afterEach(() => {
    sessionStorage.clear()
  })

  it('reports false for a visitor who navigated directly (no marker set)', () => {
    expect(hasArrivedViaScan()).toBe(false)
  })

  it('reports true after a scan surface marks the arrival', () => {
    markArrivedViaScan()
    expect(hasArrivedViaScan()).toBe(true)
  })

  it('persists the marker under a stable, namespaced sessionStorage key', () => {
    markArrivedViaScan()
    // Pinned so a rename can't silently split the writer (scan surfaces)
    // from the reader (<ScanReturnHint />).
    expect(sessionStorage.getItem(ARRIVED_VIA_SCAN_KEY)).toBe('1')
  })
})
