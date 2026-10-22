import { describe, expect, it } from 'vitest'
import { migrationConnectionString } from './migrate'

describe('pnpm migrate — which database it connects to', () => {
  it('uses MIGRATE_DATABASE_URL, the session pooler string', () => {
    expect(migrationConnectionString({ MIGRATE_DATABASE_URL: 'postgresql://session', DATABASE_URL: 'postgresql://tx' })).toEqual({
      ok: true,
      connectionString: 'postgresql://session',
    })
  })

  it('stops rather than migrating through the app’s DATABASE_URL when it is missing', () => {
    const result = migrationConnectionString({ DATABASE_URL: 'postgresql://tx' })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toContain('Session pooler')
  })
})
