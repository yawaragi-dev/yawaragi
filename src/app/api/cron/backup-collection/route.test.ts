import { describe, expect, it, vi } from 'vitest'
import { type BackupRouteDeps, handleBackupRequest } from './route'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'
import type { BackupStorage } from '@/lib/collection/backup-storage'

const SECRET = 'aaaaaaaaaaaaaaaa'

const request = (auth?: string) =>
  new Request('http://localhost/api/cron/backup-collection', {
    method: 'GET',
    headers: auth ? { authorization: auth } : {},
  })

const storage = (): BackupStorage & { uploads: string[] } => {
  const uploads: string[] = []
  return {
    uploads,
    upload: async (path) => {
      uploads.push(path)
    },
    list: async () => [],
    remove: async () => {},
    download: async () => '',
  }
}

const deps = (over: Partial<BackupRouteDeps> = {}): BackupRouteDeps => ({
  expectedSecret: SECRET,
  userIds: ['user_a'],
  build: () => ({
    journal: new InMemoryJournalStore(),
    cellar: new InMemoryCellarStore(),
    storage: storage(),
  }),
  now: () => Date.UTC(2026, 9, 5),
  ...over,
})

describe('/api/cron/backup-collection', () => {
  it('refuses a request without the cron secret, before touching any store', async () => {
    const build = vi.fn()
    const res = await handleBackupRequest(request(), () => deps({ build }))
    expect(res.status).toBe(401)
    expect(build).not.toHaveBeenCalled()
    const wrong = await handleBackupRequest(request('Bearer nope-nope-nope-nope'), () => deps({ build }))
    expect(wrong.status).toBe(401)
  })

  it('fails loudly when the stores or the bucket are not configured — a skipped backup must show', async () => {
    const res = await handleBackupRequest(request(`Bearer ${SECRET}`), () => deps({ build: () => null }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not_configured', status: 'skipped' })
  })

  it('backs up every maintainer and reports counts, never contents', async () => {
    const bucket = storage()
    const res = await handleBackupRequest(request(`Bearer ${SECRET}`), () =>
      deps({
        userIds: ['user_a', 'user_b'],
        build: () => ({ journal: new InMemoryJournalStore(), cellar: new InMemoryCellarStore(), storage: bucket }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('success')
    expect(body.users.map((u: { userId: string }) => u.userId)).toEqual(['user_a', 'user_b'])
    expect(bucket.uploads).toEqual([
      'user_a/2026-10-05T00-00-00Z.json',
      'user_b/2026-10-05T00-00-00Z.json',
    ])
  })

  it('answers 500 when any user failed, so the cron log shows red', async () => {
    const failing = { ...storage(), upload: async () => Promise.reject(new Error('down')) }
    const res = await handleBackupRequest(request(`Bearer ${SECRET}`), () =>
      deps({ build: () => ({ journal: new InMemoryJournalStore(), cellar: new InMemoryCellarStore(), storage: failing }) }),
    )
    expect(res.status).toBe(500)
    expect((await res.json()).users[0]).toMatchObject({ ok: false, error: 'down' })
  })
})
