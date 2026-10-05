import 'server-only'

/**
 * The four Redis hash commands the collection stores need, over Upstash's REST
 * API — one per-user hash per record type (`journal:user:<id>`,
 * `cellar:user:<id>`), field = record id, value = the record's JSON.
 *
 * REST over `fetch` rather than `@upstash/redis` for the reason the rate-limit
 * client gives: the SDK would need the pnpm `minimumReleaseAge` quarantine
 * weakened, and four commands do not justify that.
 *
 * Deliberately no `EXPIRE` anywhere: the journal and the cellar are permanent
 * records (ADR-0020, ADR-0024), erased only on request.
 */
export class UpstashHash {
  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Every `[field, value]` pair in the hash; `[]` when the key is absent. */
  async getAll(key: string): Promise<Array<[string, string]>> {
    const result = await this.exec(['HGETALL', key])
    if (!Array.isArray(result)) return []
    // The REST API returns HGETALL flat: [field0, value0, field1, value1, …].
    const pairs: Array<[string, string]> = []
    for (let i = 0; i + 1 < result.length; i += 2) {
      const field = result[i]
      const value = result[i + 1]
      if (typeof field === 'string' && typeof value === 'string') pairs.push([field, value])
    }
    return pairs
  }

  async set(key: string, field: string, value: string): Promise<void> {
    await this.exec(['HSET', key, field, value])
  }

  async delete(key: string, field: string): Promise<void> {
    await this.exec(['HDEL', key, field])
  }

  async drop(key: string): Promise<void> {
    await this.exec(['DEL', key])
  }

  private async exec(command: ReadonlyArray<string>): Promise<unknown> {
    const response = await this.fetchImpl(this.restUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.restToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Upstash REST error ${response.status} for command ${command[0]}`)
    }
    const json: unknown = await response.json()
    if (typeof json === 'object' && json !== null && 'result' in json) {
      return (json as { result: unknown }).result
    }
    return null
  }
}
