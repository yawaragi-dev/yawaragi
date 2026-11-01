import { NextResponse } from 'next/server'
import { isCrossSite } from '@/lib/network/cross-site'
import { scanLabel } from '@/lib/scan/scan-action'

/**
 * The label scan, for `<ScanForm />` (`scanLabel`). A route rather than a
 * Server Action so the browser can abort it: design v1.9 S4's Cancel, and the
 * 30 s stop, end the request instead of waiting it out.
 *
 * Under `/{locale}/` on purpose: the proxy runs on it (it skips `/api`), so
 * Clerk's session, the session cookie and the 18+ gate are what the scan page
 * itself sees.
 */
export async function POST(request: Request) {
  if (isCrossSite(request)) return new NextResponse(null, { status: 403 })
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ status: 'invalid_input', reason: 'missing_image' }, { status: 400 })
  }
  return NextResponse.json(await scanLabel(formData))
}
