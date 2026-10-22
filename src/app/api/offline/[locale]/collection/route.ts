import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { OFFLINE_COPY_VERSION, OFFLINE_DB, OFFLINE_KEY, OFFLINE_STORE } from '@/lib/offline/collection-copy'

/**
 * The read-only Collection the service worker shows when `/collection` cannot
 * load for want of a network (design question Z). Static and self-contained
 * like the plain offline page: the words are built in, and a few lines of
 * script read the copy `<SaveOfflineCopy />` left in this browser's IndexedDB
 * and draw it. It never fetches anything, so it holds no one's data until it
 * runs on the device that owns the copy. Under `/api/` so the proxy and the
 * 18+ gate leave it alone; the copy itself only exists for a visitor who
 * passed the gate and could see their collection.
 */
export const dynamic = 'force-static'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: requested } = await params
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  const t = await getTranslations({ locale, namespace: 'offline' })
  const words = {
    title: t('collection.title'),
    // Raw: the page's script fills {date} and {n} on the device.
    saved: t.raw('collection.saved') as string,
    readOnly: t('collection.readOnly'),
    journal: t('collection.journal'),
    cellar: t('collection.cellar'),
    none: t('collection.none'),
    stars: t.raw('collection.stars') as string,
    open: t('collection.open'),
    nama: t('collection.nama'),
    retry: t('retry'),
  }
  return new Response(page(locale, words), { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/** JSON for inside a <script>: no "</script>" can close it early. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function page(locale: string, w: Record<string, string>) {
  const config = { locale, db: OFFLINE_DB, store: OFFLINE_STORE, key: OFFLINE_KEY, version: OFFLINE_COPY_VERSION, w }
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#1b1a19">
<meta name="color-scheme" content="dark">
<title>${escape(w.title)} — Yawaragi</title>
<style>
html,body{margin:0;background:#1b1a19;color:#e8e4dd;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{box-sizing:border-box;max-width:560px;margin:0 auto;padding:24px 20px 48px;display:flex;flex-direction:column;gap:14px}
h1{margin:0;font-size:26px;font-weight:500}
h2{margin:12px 0 0;font-size:13px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#a8a49c}
p{margin:0;font-size:14px;line-height:1.5;color:#bdb9b1}
.note{border:1px solid #383634;border-radius:12px;padding:10px 12px}
ul{list-style:none;margin:0;padding:0}
li{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #2c2a28}
.date{width:40px;flex-shrink:0;color:#a8a49c;font-size:12px;text-transform:uppercase}
.date b{display:block;color:#e8e4dd;font-size:18px;font-weight:500}
.body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.name{font-size:16px;font-weight:500}
.kanji,.meta{font-size:12px;color:#a8a49c}
.quote{font-size:13px;font-style:italic;color:#bdb9b1}
.stars{flex-shrink:0;color:#cf8a6e;font-size:12px;letter-spacing:1px}
a{align-self:flex-start;padding:10px 18px;border:1px solid #cf8a6e;border-radius:12px;color:#e8e4dd;text-decoration:none;font-size:15px}
</style>
</head>
<body>
<main data-testid="offline-collection">
<h1>${escape(w.title)}</h1>
<p class="note" data-testid="offline-collection-note">${escape(w.readOnly)}</p>
<p id="saved" class="meta" data-testid="offline-collection-saved"></p>
<div id="lists"></div>
<a href="" data-testid="offline-retry">${escape(w.retry)}</a>
</main>
<script>
(function () {
  var c = ${scriptJson(config)};
  var w = c.w;
  var lists = document.getElementById('lists');
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function none() { lists.appendChild(el('p', null, w.none)); }
  function draw(copy) {
    if (!copy || copy.v !== c.version) return none();
    var day = new Intl.DateTimeFormat(c.locale, { day: '2-digit' });
    var month = new Intl.DateTimeFormat(c.locale, { month: 'short' });
    var when = new Intl.DateTimeFormat(c.locale, { dateStyle: 'medium', timeStyle: 'short' });
    document.getElementById('saved').textContent = w.saved.replace('{date}', when.format(new Date(copy.savedAt)));
    lists.appendChild(el('h2', null, w.journal));
    var journal = el('ul');
    journal.setAttribute('data-testid', 'offline-journal');
    copy.journal.forEach(function (t) {
      var li = el('li');
      var d = el('span', 'date'); var b = el('b', null, day.format(new Date(t.triedAt)));
      d.appendChild(b); d.appendChild(document.createTextNode(month.format(new Date(t.triedAt))));
      var body = el('span', 'body');
      body.appendChild(el('span', 'name', t.name));
      if (t.kanji) { var k = el('span', 'kanji', t.kanji); k.lang = 'ja'; body.appendChild(k); }
      if (t.note) body.appendChild(el('span', 'quote', '\\u201c' + t.note + '\\u201d'));
      li.appendChild(d); li.appendChild(body);
      if (t.rating) {
        var s = el('span', 'stars', '\\u2605\\u2605\\u2605\\u2605\\u2605'.slice(0, t.rating) + '\\u2606\\u2606\\u2606\\u2606\\u2606'.slice(t.rating));
        s.setAttribute('role', 'img'); s.setAttribute('aria-label', w.stars.replace('{n}', t.rating));
        li.appendChild(s);
      }
      journal.appendChild(li);
    });
    lists.appendChild(journal);
    if (copy.cellar.length) {
      lists.appendChild(el('h2', null, w.cellar));
      var cellar = el('ul');
      cellar.setAttribute('data-testid', 'offline-cellar');
      copy.cellar.forEach(function (r) {
        var li = el('li'); var body = el('span', 'body');
        body.appendChild(el('span', 'name', r.name + ' \\u00d7 ' + r.count + (r.sizeMl ? ' \\u00b7 ' + r.sizeMl + ' ml' : '')));
        if (r.kanji) { var k = el('span', 'kanji', r.kanji); k.lang = 'ja'; body.appendChild(k); }
        var meta = [r.open ? w.open : null, r.nama ? w.nama : null].filter(Boolean).join(' \\u00b7 ');
        if (meta) body.appendChild(el('span', 'meta', meta));
        li.appendChild(body); cellar.appendChild(li);
      });
      lists.appendChild(cellar);
    }
  }
  try {
    var request = indexedDB.open(c.db, 1);
    request.onupgradeneeded = function () { request.result.createObjectStore(c.store); };
    request.onerror = none;
    request.onsuccess = function () {
      var get = request.result.transaction(c.store, 'readonly').objectStore(c.store).get(c.key);
      get.onsuccess = function () { draw(get.result); };
      get.onerror = none;
    };
  } catch (e) { none(); }
})();
</script>
</body>
</html>
`
}
