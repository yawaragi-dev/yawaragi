import { describe, expect, it } from 'vitest'
import { defaultExportFilename, resolveExportUserId } from '~/scripts/export-journal'

describe('resolveExportUserId', () => {
  it('uses the explicitly requested user, even if they are no longer a maintainer', () => {
    // Erasure and portability outlive allowlist membership: a user removed
    // from MAINTAINER_USER_IDS still has a right to the data we hold, so an
    // explicit --user is never checked against the allowlist.
    const resolved = resolveExportUserId('user_departed', 'user_admin')
    expect(resolved).toEqual({ ok: true, userId: 'user_departed' })
  })

  it('defaults to the sole maintainer, so the single-maintainer beta needs no flag', () => {
    const resolved = resolveExportUserId(undefined, 'user_admin')
    expect(resolved).toEqual({ ok: true, userId: 'user_admin' })
  })

  it('refuses to guess when several maintainers are configured', () => {
    const resolved = resolveExportUserId(undefined, 'user_a, user_b')
    expect(resolved.ok).toBe(false)
    if (resolved.ok) throw new Error('expected a refusal')
    expect(resolved.reason).toMatch(/--user/)
  })

  it('explains what to set when no maintainer is configured at all', () => {
    const resolved = resolveExportUserId(undefined, undefined)
    expect(resolved.ok).toBe(false)
    if (resolved.ok) throw new Error('expected a refusal')
    expect(resolved.reason).toMatch(/MAINTAINER_USER_IDS/)
  })
})

describe('defaultExportFilename', () => {
  it('stamps the instant so repeat exports on one day do not overwrite each other', () => {
    const a = defaultExportFilename('user_admin', Date.UTC(2026, 7, 17, 9, 0, 0))
    const b = defaultExportFilename('user_admin', Date.UTC(2026, 7, 17, 14, 30, 0))

    expect(a).toBe('journal-export-user_admin-2026-08-17T09-00-00Z.json')
    expect(a).not.toBe(b)
  })

  it('strips path separators from the user id so a crafted --user cannot escape the cwd', () => {
    const name = defaultExportFilename('../../etc/passwd', Date.UTC(2026, 7, 17, 9, 0, 0))
    expect(name).not.toContain('/')
    expect(name).not.toContain('..')
  })
})
