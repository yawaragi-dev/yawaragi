'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { consentCookieAttrs, type ConsentChoice } from './consent'

export async function setConsent(choice: ConsentChoice) {
  const jar = await cookies()
  jar.set(consentCookieAttrs(choice))
  revalidatePath('/', 'layout')
}
