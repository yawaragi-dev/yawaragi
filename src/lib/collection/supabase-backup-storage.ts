import 'server-only'

import type { BackupStorage } from '@/lib/collection/backup-storage'

/**
 * {@link BackupStorage} on a **private** Supabase Storage bucket, over its REST
 * API with the service-role key (ADR-0024 §4).
 *
 * Supabase rather than a second Upstash database because the backup must not
 * share a failure with the store it backs up; and Supabase rather than Vercel
 * Blob because it is already a signed processor in `eu-central-1` (ADR-0009).
 *
 * REST over `fetch`, not `@supabase/supabase-js`'s storage client: the app's
 * supabase-js instance is the user-scoped, Clerk-JWT one (ADR-0010), and this
 * job must run as the service role with no user. Five endpoints do not justify
 * a second client configuration.
 *
 * The bucket is created on first use if missing, private. Nothing in the app
 * reads it: the cron writes, and `pnpm journal:restore` reads from a machine
 * with the key.
 */
export class SupabaseBackupStorage implements BackupStorage {
  private bucketReady = false

  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async upload(path: string, body: string): Promise<void> {
    await this.ensureBucket()
    const res = await this.request(`/object/${this.bucket}/${encodePath(path)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-upsert': 'false' },
      body,
    })
    if (!res.ok) throw new Error(`Supabase Storage upload failed: ${res.status}`)
  }

  async list(prefix: string): Promise<string[]> {
    await this.ensureBucket()
    const res = await this.request(`/object/list/${this.bucket}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: `${prefix}/`, limit: 1000, offset: 0 }),
    })
    if (!res.ok) throw new Error(`Supabase Storage list failed: ${res.status}`)
    const json: unknown = await res.json()
    if (!Array.isArray(json)) return []
    return json
      .map((o: unknown) => (typeof o === 'object' && o !== null ? (o as { name?: unknown }).name : null))
      .filter((n): n is string => typeof n === 'string')
  }

  async remove(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return
    const res = await this.request(`/object/${this.bucket}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    })
    if (!res.ok) throw new Error(`Supabase Storage delete failed: ${res.status}`)
  }

  async download(path: string): Promise<string> {
    const res = await this.request(`/object/${this.bucket}/${encodePath(path)}`, { method: 'GET' })
    if (!res.ok) throw new Error(`Supabase Storage download failed: ${res.status}`)
    return res.text()
  }

  /** Create the bucket, private, unless it already exists. Once per instance. */
  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return
    const existing = await this.request(`/bucket/${this.bucket}`, { method: 'GET' })
    if (!existing.ok) {
      const created = await this.request('/bucket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
      })
      // 409/400 "already exists" means a concurrent run won the race — fine.
      if (!created.ok && created.status !== 409 && created.status !== 400) {
        throw new Error(`Supabase Storage bucket create failed: ${created.status}`)
      }
    }
    this.bucketReady = true
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    return this.fetchImpl(`${this.supabaseUrl.replace(/\/$/, '')}/storage/v1${path}`, {
      ...init,
      // `apikey` only: Supabase's `sb_secret_` keys are not JWTs and belong
      // on that header, never on `Authorization: Bearer`. A legacy
      // service_role JWT works on it too.
      headers: { ...init.headers, apikey: this.serviceRoleKey },
      cache: 'no-store',
    })
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}
