import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signOut = vi.fn(() => new Promise<void>(() => {}))
vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut }),
}))

const beginAuthTransition = vi.fn()
const endAuthTransition = vi.fn()
vi.mock('@/lib/auth/auth-transition', () => ({
  beginAuthTransition: () => beginAuthTransition(),
  endAuthTransition: () => endAuthTransition(),
}))

const reload = vi.fn()

const { SignOutRow } = await import('./sign-out-row')

describe('the Account sign-out row', () => {
  beforeEach(() => {
    signOut.mockReset()
    signOut.mockImplementation(() => new Promise<void>(() => {}))
    beginAuthTransition.mockClear()
    reload.mockClear()
    window.history.replaceState(null, '', '/en/account')
  })

  it('is one button across the whole row, not a small one at its end', () => {
    render(<SignOutRow label="Sign out" pendingLabel="Signing out…" reload={reload} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].textContent).toContain('Sign out')
    expect(buttons[0].className).toContain('w-full')
  })

  it('signs out and brings the visitor back to the page they were on', () => {
    render(<SignOutRow label="Sign out" pendingLabel="Signing out…" reload={reload} />)
    fireEvent.click(screen.getByRole('button'))
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/en/account' })
  })

  it('puts the wall up before asking Clerk, so the page never shows half-signed-out', () => {
    render(<SignOutRow label="Sign out" pendingLabel="Signing out…" reload={reload} />)
    fireEvent.click(screen.getByRole('button'))
    expect(beginAuthTransition).toHaveBeenCalled()
    expect(beginAuthTransition.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    )
  })

  it('finishes with one fresh load of the page the visitor was on', async () => {
    signOut.mockImplementation(() => Promise.resolve())
    render(<SignOutRow label="Sign out" pendingLabel="Signing out…" reload={reload} />)
    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => expect(reload).toHaveBeenCalledWith('/en/account'))
  })

  it('acknowledges the tap at once, while the sign-out is in flight', () => {
    render(<SignOutRow label="Sign out" pendingLabel="Signing out…" reload={reload} />)
    fireEvent.click(screen.getByRole('button'))
    const button = screen.getByRole('button')
    expect(button.textContent).toContain('Signing out…')
    expect(button.hasAttribute('disabled')).toBe(true)
  })
  it('takes the wall down again if the sign-out fails', async () => {
    signOut.mockImplementation(() => Promise.reject(new Error('network')))
    render(<SignOutRow label="Sign out" pendingLabel="Signing out…" reload={reload} />)
    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => expect(endAuthTransition).toHaveBeenCalled())
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('button').textContent).toContain('Sign out')
  })
})
