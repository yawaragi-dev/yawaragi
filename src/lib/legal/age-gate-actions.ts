'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ageGateCookieAttrs } from './age-gate-cookie'

export async function acceptAgeGate(returnTo: string) {
  const jar = await cookies()
  jar.set(ageGateCookieAttrs())
  redirect(safeReturnPath(returnTo))
}

function safeReturnPath(path: string): string {
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return '/'
}
