'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ageGateCookieAttrs } from './age-gate-cookie'

export async function acceptAgeGate() {
  const jar = await cookies()
  jar.set(ageGateCookieAttrs())
  revalidatePath('/', 'layout')
}
