import { describe, expect, it, vi } from 'vitest'
import { SupabaseBackupStorage } from '@/lib/collection/supabase-backup-storage'

type Call = { url: string; method: string; body?: string; headers: Record<string, string> }

function fakeFetch(responses: Array<{ status: number; json?: unknown; text?: string }>) {
  const calls: Call[] = []
  let i = 0
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body as string | undefined,
      headers: init?.headers as Record<string, string>,
    })
    const r = responses[i++] ?? { status: 200 }
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.json,
      text: async () => r.text ?? '',
    } as Response
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

describe('Supabase backup storage', () => {
  it('creates the bucket private when it is missing, then uploads without overwriting', async () => {
    const { impl, calls } = fakeFetch([{ status: 400 }, { status: 200 }, { status: 200 }])
    const storage = new SupabaseBackupStorage('https://p.supabase.co/', 'srk', 'collection-backups', impl)

    await storage.upload('user_a/2026-10-05T03-30-00Z.json', '{}')

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://p.supabase.co/storage/v1/bucket/collection-backups',
      'POST https://p.supabase.co/storage/v1/bucket',
      'POST https://p.supabase.co/storage/v1/object/collection-backups/user_a/2026-10-05T03-30-00Z.json',
    ])
    expect(JSON.parse(calls[1]!.body!)).toEqual({
      id: 'collection-backups',
      name: 'collection-backups',
      public: false,
    })
    expect(calls[2]!.headers['x-upsert']).toBe('false')
    expect(calls[2]!.headers.apikey).toBe('srk')
    expect(calls[2]!.headers.authorization).toBeUndefined()
  })

  it('checks the bucket once per instance, not on every call', async () => {
    const { impl, calls } = fakeFetch([{ status: 200 }, { status: 200 }, { status: 200, json: [] }])
    const storage = new SupabaseBackupStorage('https://p.supabase.co', 'srk', 'b', impl)
    await storage.upload('u/x.json', '{}')
    await storage.list('u')
    expect(calls.filter((c) => c.url.endsWith('/bucket/b'))).toHaveLength(1)
  })

  it('lists file names under a prefix and deletes by full path', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200 },
      { status: 200, json: [{ name: 'a.json' }, { name: 'b.json' }] },
      { status: 200 },
    ])
    const storage = new SupabaseBackupStorage('https://p.supabase.co', 'srk', 'b', impl)
    expect(await storage.list('user_a')).toEqual(['a.json', 'b.json'])
    expect(JSON.parse(calls[1]!.body!)).toMatchObject({ prefix: 'user_a/' })

    await storage.remove(['user_a/a.json'])
    expect(calls[2]).toMatchObject({ method: 'DELETE', url: 'https://p.supabase.co/storage/v1/object/b' })
    expect(JSON.parse(calls[2]!.body!)).toEqual({ prefixes: ['user_a/a.json'] })
  })

  it('throws on a failed upload so the job reports it', async () => {
    const { impl } = fakeFetch([{ status: 200 }, { status: 500 }])
    const storage = new SupabaseBackupStorage('https://p.supabase.co', 'srk', 'b', impl)
    await expect(storage.upload('u/x.json', '{}')).rejects.toThrow(/upload failed: 500/)
  })
})
