'use server'

import { z } from 'zod'
import { forgetHadBottle } from '@/lib/collection/bottles-had'
import { withMaintainerCollection } from '@/lib/taste/maintainer-collection'

/**
 * "Bottles you've had" → a row's ⋯ → Remove (design v1.10, AB6: "rows are
 * removed one by one … and go with the account"). Takes that one bottle out
 * of the bottle history — its added, opened and finished/removed lines — so it
 * is gone from the list, from "Bottles you've kept", from the next export and
 * from the next daily backup. Behind the same maintainer gate as every
 * collection write (ADR-0020).
 */
export type ForgetBottleResult =
  | { status: 'ok' }
  | { status: 'invalid_input' }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'unavailable' }

const BottleIdSchema = z.string().min(3).max(200)

export async function forgetBottleHad(bottleId: string): Promise<ForgetBottleResult> {
  const parsed = BottleIdSchema.safeParse(bottleId)
  if (!parsed.success) return { status: 'invalid_input' }
  return withMaintainerCollection(async ({ userId, history }) => {
    if (!history) return { status: 'unavailable' }
    const rewrite = forgetHadBottle(await history.read(userId), parsed.data)
    if (!rewrite) return { status: 'not_found' }
    await history.rewrite(userId, rewrite)
    return { status: 'ok' }
  })
}
