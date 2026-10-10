import 'server-only'

import {
  type ExpressionStore,
  decodeExpressionsHash,
  expressionsKey,
} from '@/lib/collection/expression-store'
import { UpstashHash } from '@/lib/collection/upstash-hash'
import type { StoreDump } from '@/lib/collection/versioned-record'
import type { Expression } from '@/lib/schemas/expression'

/**
 * Production {@link ExpressionStore}: a Redis hash per user on Upstash
 * (`expressions:user:<clerkUserId>`, field = Expression id). Same REST
 * plumbing and the same no-`EXPIRE` rule as the journal and the cellar
 * (ADR-0024).
 */
export class UpstashExpressionStore implements ExpressionStore {
  private readonly hash: UpstashHash

  constructor(restUrl: string, restToken: string, fetchImpl: typeof fetch = fetch) {
    this.hash = new UpstashHash(restUrl, restToken, fetchImpl)
  }

  async read(userId: string): Promise<Expression[]> {
    return (await this.dump(userId)).records
  }

  async dump(userId: string): Promise<StoreDump<Expression>> {
    return decodeExpressionsHash(await this.hash.getAll(expressionsKey(userId)))
  }

  async put(userId: string, expression: Expression): Promise<void> {
    await this.hash.set(expressionsKey(userId), expression.id, JSON.stringify(expression))
  }

  async remove(userId: string, expressionId: string): Promise<void> {
    await this.hash.delete(expressionsKey(userId), expressionId)
  }

  async clear(userId: string): Promise<void> {
    await this.hash.drop(expressionsKey(userId))
  }
}
