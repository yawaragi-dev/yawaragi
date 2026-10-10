import { type ExpressionStore, decodeExpressionsHash } from '@/lib/collection/expression-store'
import type { StoreDump } from '@/lib/collection/versioned-record'
import type { Expression } from '@/lib/schemas/expression'

/**
 * In-memory {@link ExpressionStore} for unit tests (and only tests). Holds
 * JSON strings per id, like the Redis hash, so reads go through the same
 * decode as Upstash, and {@link putRaw} can plant a record the code cannot read.
 */
export class InMemoryExpressionStore implements ExpressionStore {
  private readonly hashes = new Map<string, Map<string, string>>()

  async read(userId: string): Promise<Expression[]> {
    return (await this.dump(userId)).records
  }

  async dump(userId: string): Promise<StoreDump<Expression>> {
    return decodeExpressionsHash([...(this.hashes.get(userId) ?? new Map<string, string>())])
  }

  async put(userId: string, expression: Expression): Promise<void> {
    this.putRaw(userId, expression.id, JSON.stringify(expression))
  }

  async remove(userId: string, expressionId: string): Promise<void> {
    this.hashes.get(userId)?.delete(expressionId)
  }

  async clear(userId: string): Promise<void> {
    this.hashes.delete(userId)
  }

  /** Test seam: store a value verbatim, bypassing the schema. */
  putRaw(userId: string, field: string, raw: string): void {
    let hash = this.hashes.get(userId)
    if (!hash) {
      hash = new Map<string, string>()
      this.hashes.set(userId, hash)
    }
    hash.set(field, raw)
  }
}
