import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const { RefreshOnAuthChange } = await import('./refresh-on-auth-change')

describe('keeping the server-rendered page in step with who is signed in', () => {
  beforeEach(() => refresh.mockClear())

  it('waits for Clerk to load before judging anything', () => {
    auth = { isLoaded: false, userId: undefined }
    render(<RefreshOnAuthChange serverUserId={null} />)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('leaves the page alone when the server rendered it for the right person', () => {
    auth = { isLoaded: true, userId: 'user_123' }
    render(<RefreshOnAuthChange serverUserId="user_123" />)
    auth = { isLoaded: true, userId: null }
    render(<RefreshOnAuthChange serverUserId={null} />)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('re-renders a page the server drew signed-out once Clerk has a user (the Google return)', () => {
    // After the OAuth round trip the page is a fresh load, and Clerk already
    // has the session by the time it reports loaded. The server output is
    // still the signed-out one.
    auth = { isLoaded: true, userId: 'user_123' }
    render(<RefreshOnAuthChange serverUserId={null} />)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('re-renders after a sign-out the server has not seen yet', () => {
    auth = { isLoaded: true, userId: null }
    render(<RefreshOnAuthChange serverUserId="user_123" />)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('asks once per mismatch, so a server that cannot see the session does not loop', () => {
    auth = { isLoaded: true, userId: 'user_123' }
    const { rerender } = render(<RefreshOnAuthChange serverUserId={null} />)
    rerender(<RefreshOnAuthChange serverUserId={null} />)
    rerender(<RefreshOnAuthChange serverUserId={null} />)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
