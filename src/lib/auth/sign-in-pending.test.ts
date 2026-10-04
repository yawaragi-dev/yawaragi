import { afterEach, describe, expect, it } from 'vitest'
import {
  SIGN_IN_PENDING_COOKIE,
  clearSignInPending,
  isSignInPending,
  markSignInPending,
} from './sign-in-pending'

const jar = () => {
  const map = new Map(
    document.cookie
      .split('; ')
      .filter(Boolean)
      .map((pair) => pair.split('=') as [string, string]),
  )
  return { get: (name: string) => (map.has(name) ? { value: map.get(name)! } : undefined) }
}

describe('the Google sign-in marker', () => {
  afterEach(() => clearSignInPending())

  it('is absent until a sign-in starts', () => {
    expect(isSignInPending(jar())).toBe(false)
  })

  it('tells the server a sign-in is under way once one starts', () => {
    markSignInPending()
    expect(document.cookie).toContain(`${SIGN_IN_PENDING_COOKIE}=1`)
    expect(isSignInPending(jar())).toBe(true)
  })

  it('is gone once cleared', () => {
    markSignInPending()
    clearSignInPending()
    expect(isSignInPending(jar())).toBe(false)
  })
})
