import { describe, expect, it } from 'vitest'
import { inactiveSince, lastActivity } from './inactive-accounts'

const NOW = Date.UTC(2026, 9, 22)
const day = 24 * 60 * 60 * 1000

describe('pnpm accounts:inactive — who has not been seen for 24 months', () => {
  it('lists an account last active more than 24 months ago, oldest first', () => {
    const users = [
      { id: 'user_recent', createdAt: Date.UTC(2023, 0, 1), lastSignInAt: null, lastActiveAt: NOW - 30 * day },
      { id: 'user_2023', createdAt: Date.UTC(2023, 0, 1), lastSignInAt: null, lastActiveAt: Date.UTC(2024, 5, 1) },
      { id: 'user_2022', createdAt: Date.UTC(2022, 0, 1), lastSignInAt: null, lastActiveAt: Date.UTC(2023, 5, 1) },
    ]

    expect(inactiveSince(users, { now: NOW, months: 24 }).map((u) => u.id)).toEqual(['user_2022', 'user_2023'])
  })

  it('keeps an account that is exactly at the line', () => {
    const atTheLine = Date.UTC(2024, 9, 22)
    const users = [{ id: 'user_line', createdAt: atTheLine, lastSignInAt: null, lastActiveAt: atTheLine }]

    expect(inactiveSince(users, { now: NOW, months: 24 })).toEqual([])
  })

  it('falls back to the last sign-in, then to sign-up, when Clerk has no activity on record', () => {
    expect(lastActivity({ id: 'a', createdAt: 1, lastSignInAt: 5, lastActiveAt: null })).toBe(5)
    expect(lastActivity({ id: 'b', createdAt: 1, lastSignInAt: null, lastActiveAt: null })).toBe(1)
    expect(lastActivity({ id: 'c', createdAt: 1, lastSignInAt: 9, lastActiveAt: 7 })).toBe(9)
  })
})
