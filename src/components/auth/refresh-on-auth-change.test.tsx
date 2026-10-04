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

describe('re-rendering the server when the visitor signs in or out', () => {
  beforeEach(() => refresh.mockClear())

  it('leaves the page alone while Clerk loads and settles on who is here', () => {
    auth = { isLoaded: false, userId: undefined }
    const { rerender } = render(<RefreshOnAuthChange />)
    auth = { isLoaded: true, userId: null }
    rerender(<RefreshOnAuthChange />)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes the page once the visitor has signed in', () => {
    auth = { isLoaded: true, userId: null }
    const { rerender } = render(<RefreshOnAuthChange />)
    auth = { isLoaded: true, userId: 'user_123' }
    rerender(<RefreshOnAuthChange />)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes the page once the visitor has signed out', () => {
    auth = { isLoaded: true, userId: 'user_123' }
    const { rerender } = render(<RefreshOnAuthChange />)
    auth = { isLoaded: true, userId: null }
    rerender(<RefreshOnAuthChange />)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does nothing on a re-render where nobody changed', () => {
    auth = { isLoaded: true, userId: 'user_123' }
    const { rerender } = render(<RefreshOnAuthChange />)
    rerender(<RefreshOnAuthChange />)
    expect(refresh).not.toHaveBeenCalled()
  })
})
