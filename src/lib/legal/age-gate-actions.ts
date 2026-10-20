'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ageGateCookieAttrs } from './age-gate-cookie'
import { countUsage } from '@/lib/stats/count-usage'

export async function acceptAgeGate(returnTo: string) {
  const jar = await cookies()
  jar.set(ageGateCookieAttrs())
  countUsage('age_gate_accepted')
  redirect(safeReturnPath(returnTo))
}

function safeReturnPath(path: string): string {
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return '/'
}
