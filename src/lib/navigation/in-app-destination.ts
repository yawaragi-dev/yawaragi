/**
 * Whether a click on a link is a move to another screen of this app — the
 * taps rule 16 answers with a held press state and, if slow, a bar and a
 * notice. Not: another site, a new tab or window, a download, a link to the
 * page already open, an in-page anchor, or a click with a modifier key.
 * Returns the destination (path + query) or null.
 */
export function inAppDestination(
  link: { href: string; target: string; download: boolean },
  click: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean },
  current: string,
): string | null {
  if (click.defaultPrevented || click.button !== 0) return null
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null
  if (link.download || (link.target && link.target !== '_self')) return null
  let to: URL
  let from: URL
  try {
    from = new URL(current)
    to = new URL(link.href, from)
  } catch {
    return null
  }
  if (to.origin !== from.origin) return null
  // `/api/…` and files are not screens: a sample-collection hop redirects,
  // a download is a file.
  if (to.pathname.startsWith('/api/') || /\.[a-z0-9]+$/i.test(to.pathname)) return null
  if (to.pathname === from.pathname && to.search === from.search) return null
  return to.pathname + to.search
}
