import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

let auth: { isLoaded: boolean; userId: string | null | undefined } = {
  isLoaded: false,
  userId: undefined,
}
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => auth,
}))

const clearSignInPending = vi.fn()
vi.mock('@/lib/auth/sign-in-pending', () => ({
  clearSignInPending: () => clearSignInPending(),
}))

const { RefreshOnAuthChange } = await import('./refresh-on-auth-change')

const wall = () => screen.queryByTestId('auth-transition-wall')

describe('keeping the server-rendered page in step with who is signed in', () => {
  beforeEach(() => {
    refresh.mockClear()
    clearSignInPending.mockClear()
    window.location.hash = ''
  })
  afterEach(() => vi.useRealTimers())

  it('leaves the page alone when the server rendered it for the right person', () => {
    auth = { isLoaded: true, userId: 'user_123' }
    render(<RefreshOnAuthChange serverUserId="user_123" signInPending={false} label="Signing you in" />)
    expect(refresh).not.toHaveBeenCalled()
    expect(wall()).toBeNull()
  })

  it('hides and re-renders a page the server drew signed-out once Clerk has a user', () => {
    auth = { isLoaded: true, userId: 'user_123' }
    render(<RefreshOnAuthChange serverUserId={null} signInPending={false} label="Signing you in" />)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(wall()).not.toBeNull()
  })

  it('takes the wall down once the server has caught up', () => {
    auth = { isLoaded: true, userId: 'user_123' }
    const { rerender } = render(<RefreshOnAuthChange serverUserId={null} signInPending label="Signing you in" />)
    expect(wall()).not.toBeNull()
    rerender(<RefreshOnAuthChange serverUserId="user_123" signInPending label="Signing you in" />)
    expect(wall()).toBeNull()
    expect(clearSignInPending).toHaveBeenCalled()
  })

  it('asks once per mismatch, so a server that cannot see the session does not loop', () => {
    auth = { isLoaded: true, userId: 'user_123' }
    const { rerender } = render(<RefreshOnAuthChange serverUserId={null} signInPending={false} label="Signing you in" />)
    rerender(<RefreshOnAuthChange serverUserId={null} signInPending={false} label="Signing you in" />)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('covers the page while Clerk finishes a Google sign-in', () => {
    // Back from Google: a fresh load on the callback, Clerk has no user yet.
    window.location.hash = '#/sso-callback'
    auth = { isLoaded: true, userId: null }
    render(<RefreshOnAuthChange serverUserId={null} signInPending label="Signing you in" />)
    expect(wall()).not.toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('takes the wall down at once when the visitor came back from Google without signing in', () => {
    window.location.hash = ''
    auth = { isLoaded: true, userId: null }
    render(<RefreshOnAuthChange serverUserId={null} signInPending label="Signing you in" />)
    expect(wall()).toBeNull()
    expect(clearSignInPending).toHaveBeenCalled()
  })

  it('never leaves the visitor behind a wall for good', () => {
    vi.useFakeTimers()
    window.location.hash = '#/sso-callback'
    auth = { isLoaded: true, userId: null }
    render(<RefreshOnAuthChange serverUserId={null} signInPending label="Signing you in" />)
    expect(wall()).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(wall()).toBeNull()
  })

  it('is a wall: it blocks the page under it and says what is happening', () => {
    auth = { isLoaded: true, userId: 'user_123' }
    render(<RefreshOnAuthChange serverUserId={null} signInPending={false} label="Signing you in" />)
    const el = wall()!
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-busy')).toBe('true')
    expect(el.className).toContain('fixed')
  })
})
