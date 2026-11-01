import { NextResponse } from 'next/server'
import { isCrossSite } from '@/lib/network/cross-site'
import { readListPhoto } from '@/lib/scan/list-action'

/**
 * §7's "Rank these for you": the whole menu or shelf read, for `<ScanForm />`
 * (`readListPhoto`). A route rather than a Server Action so the browser can
 * abort it — leaving the list screen, retaking the photo or the 30 s stop end
 * the request instead of the screen waiting it out (as #557 did for the scan).
 *
 * Under `/{locale}/` on purpose: the proxy runs on it (it skips `/api`), so
 * Clerk's session, the session cookie and the 18+ gate are what the scan page
 * itself sees. The signed-in check and the rate limit stay in `readListPhoto`.
 */
export async function POST(request: Request) {
  if (isCrossSite(request)) return new NextResponse(null, { status: 403 })
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ status: 'invalid_input' }, { status: 400 })
  }
  return NextResponse.json(await readListPhoto(formData))
}
