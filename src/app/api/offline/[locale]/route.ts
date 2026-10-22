import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'

/**
 * The page the service worker (`public/sw.js`) shows when a page load fails
 * for want of a network (#480, slice 3): launching the installed app with no
 * signal, or reloading on a dead connection. Navigations inside a running
 * app are not page loads and never see it.
 *
 * One self-contained HTML document per locale — inline styles, no script, no
 * font, no image — because the worker caches exactly this response and
 * nothing it might reference. Built once at deploy time. It holds no sake
 * data, so the 18+ gate has nothing to guard, and no personal data, so
 * caching it adds nothing to ADR-0009's RoPA. Under `/api/` so the proxy
 * leaves it alone.
 *
 * "Try again" is a link to the page's own address: the worker serves this in
 * place of the page that failed, so the address is still the one the visitor
 * wanted, and following it retries that load.
 */
export const dynamic = 'force-static'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: requested } = await params
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  const t = await getTranslations({ locale, namespace: 'offline' })
  return new Response(offlineDocument({ locale, title: t('title'), body: t('body'), retry: t('retry') }), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

// The Ginshu tokens this page uses, by value (globals.css is not loaded here):
// ground #1b1a19, ink #e8e4dd, ash-700 #bdb9b1, ginshu-600 #cf8a6e.
function offlineDocument({ locale, title, body, retry }: { locale: string; title: string; body: string; retry: string }) {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#1b1a19">
<meta name="color-scheme" content="dark">
<title>${escape(title)} — Yawaragi</title>
<style>
html,body{margin:0;height:100%;background:#1b1a19;color:#e8e4dd;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{box-sizing:border-box;min-height:100%;display:flex;flex-direction:column;justify-content:center;gap:16px;max-width:420px;margin:0 auto;padding:32px 24px}
.mark{font-size:40px;line-height:1;color:#cf8a6e}
h1{margin:0;font-size:24px;font-weight:500}
p{margin:0;font-size:16px;line-height:1.5;color:#bdb9b1}
a{align-self:flex-start;margin-top:8px;padding:12px 20px;border:1px solid #cf8a6e;border-radius:12px;color:#e8e4dd;text-decoration:none;font-size:16px}
a:focus-visible{outline:2px solid #cf8a6e;outline-offset:2px}
</style>
</head>
<body>
<main data-testid="offline-page">
<div class="mark" aria-hidden="true" lang="ja">和</div>
<h1>${escape(title)}</h1>
<p>${escape(body)}</p>
<a href="" data-testid="offline-retry">${escape(retry)}</a>
</main>
</body>
</html>
`
}
