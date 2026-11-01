// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isCrossSite } from './cross-site'

const post = (origin?: string) =>
  new Request('https://yawaragi.dev/en/scan/list', {
    method: 'POST',
    headers: origin === undefined ? {} : { origin },
  })

describe('isCrossSite', () => {
  it('lets a POST from the app itself through', () => {
    expect(isCrossSite(post('https://yawaragi.dev'))).toBe(false)
  })

  it('lets a POST with no Origin through, as Next does for a Server Action', () => {
    expect(isCrossSite(post())).toBe(false)
  })

  it('refuses a POST from another site', () => {
    expect(isCrossSite(post('https://evil.example'))).toBe(true)
  })

  it('refuses a POST from an opaque origin', () => {
    expect(isCrossSite(post('null'))).toBe(true)
  })
})
