import { NextResponse, type NextRequest } from 'next/server'
import { SAMPLE_COLLECTION_COOKIE } from '@/lib/demo/sample-flag'

const SCAN_PATH = /^\/(en|de)\/scan\/?$/

/**
 * Starting a scan leaves the sample collection first (design v1.8, L3): a
 * scan is the visitor's own, and its result must not sit under "A sample
 * collection" or beside made-up tastings. The proxy calls this for every
 * request; on the scan screen with the sample on, it sends the same address
 * back with the flag cleared, so the screen renders without the strip.
 */
export function leaveSampleOnScan(request: NextRequest): NextResponse | null {
  if (!SCAN_PATH.test(request.nextUrl.pathname)) return null
  if (request.cookies.get(SAMPLE_COLLECTION_COOKIE)?.value !== '1') return null
  const response = NextResponse.redirect(request.nextUrl, 303)
  response.cookies.set(SAMPLE_COLLECTION_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}
