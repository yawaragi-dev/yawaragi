# Manual testing — forcing states cheaply

How to drive every UI state in local dev **without hunting for a bottle photo, burning Anthropic credit, or running a live MCP server**. All the stubs below are non-production (they fail closed on a production `NODE_ENV`), so they can only ever fire in dev/preview.

Two levers do the work:

- **Env vars** flip a whole surface to a deterministic stub for the life of the dev server.
- **Cookies** let you pick a state per-browser (and, for scan, inject an exact extraction) without restarting anything.

---

## TL;DR — one dev server that stubs everything

```bash
VISION_PROVIDER=e2e-stub SUGGEST_STUB= RATE_LIMIT_BYPASS=1 pnpm dev
```

- `VISION_PROVIDER=e2e-stub` — scan never calls Anthropic vision; it returns a stub extraction you control by cookie.
- `SUGGEST_STUB=` (left empty) — suggest/chat reads its state from a **per-browser cookie** instead of a fixed env mode. Set it to a mode string (below) if you'd rather pin one mode for the whole server.
- `RATE_LIMIT_BYPASS=1` — skip the anonymous rate limits (scan 5/24h, suggest 3/24h) so you can re-run freely. **Dev/preview only** — a boot-time guard (`src/instrumentation.ts`) fails a production deploy that sets this. See the CLAUDE.md anti-pattern.

Then set cookies from the browser (below). Upload any JPEG on `/scan` (e.g. `e2e/fixtures/dassai-label.jpg`).

---

## Cookie helpers

Paste once into the **DevTools console**. Values are set **raw** (not percent-encoded) to match what the stubs read.

```js
// Accept the 18+ age gate (or just click through the modal once).
document.cookie = `yawaragi_age_gate={"v":1,"ts":${Date.now()}};path=/`

// Inject a scan extraction (requires VISION_PROVIDER=e2e-stub; ships with #194).
setScan = (name_ja, brewery_ja, confidence = 0.95) =>
  document.cookie =
    `yawaragi_e2e_vision=${btoa(unescape(encodeURIComponent(
      JSON.stringify({ name_ja, brewery_ja, confidence }))))};path=/`

// Pick a suggest/chat state.
setSuggest = (mode) => document.cookie = `yawaragi_suggest_stub=${mode};path=/`
```

> The debug cookie (`yawaragi_debug`) is **HttpOnly** — you cannot set it from JS. Use the `?debug=1` URL param instead (below).

### Cookie reference

| Cookie | Purpose | How to set |
|---|---|---|
| `yawaragi_age_gate` | Accept the 18+ JMStV gate (no flavor data renders until accepted) | `{"v":1,"ts":<ms>}`, or click the modal |
| `yawaragi_e2e_vision` | Inject a scan extraction `{name_ja, brewery_ja, confidence}` (base64) | `setScan(...)` — **needs #194** + `VISION_PROVIDER=e2e-stub` |
| `yawaragi_suggest_stub` | Pick a suggest state without the env var | `setSuggest('ok')` etc. |
| `yawaragi_debug` | Debug panel + per-step server tracing (HttpOnly) | `?debug=1` URL param; `?debug=0` clears |
| `yawaragi_consent` | GDPR cookie-consent decision | via the cookie banner UI |

---

## Recipe: force every scan result branch

Requires the **#109 / PR #194** cookie-driven stub (`yawaragi_e2e_vision`). On `main` before that lands, `VISION_PROVIDER=e2e-stub` still works but only ever returns the fixed Dassai extraction (matched-brand / brewery-divergence).

1. Start dev with `VISION_PROVIDER=e2e-stub` (+ `RATE_LIMIT_BYPASS=1`).
2. Go to `/en/scan`, accept the age gate.
3. Run one `setScan(...)` line, then **upload any JPEG and submit**. Change the cookie and re-scan to switch branches (the cookie is read at submit time).

| Branch | Console call | You should see |
|---|---|---|
| Candidate list — same brand, many breweries | `setScan('高砂','架空酒造銘柄')` | "Several sakes match this brand" — 4 tappable rows (kanji + romaji + prefecture) |
| Candidate list — brewery, many brands | `setScan('架空純米','せんきん')` | "We matched the brewery: せんきん…" — 6 rows |
| Matched, single (clean happy path) | `setScan('獺祭','獺祭')` | Normal result card + flavor chart + reverse hook, no divergence |
| Matched-brand, brewery divergence | `setScan('獺祭','旭酒造')` | "We matched the brand, but the brewery… didn't match" card |
| Matched-brewery, brand divergence | `setScan('架空純米','松緑酒造')` | Brewery matched, brand differs card |
| No match (enriched) | `setScan('架空純米','架空酒造銘柄')` | What the AI "read" (with AI-extracted badge) + "not in catalogue yet" |
| Low confidence → confirm | `setScan('獺祭','獺祭',0.5)` | Confirm-before-proceed card |
| Retry (too low to trust) | `setScan('獺祭','獺祭',0.3)` | Retry / scan-again prompt |

Verified against the live catalogue on 2026-07-07: `高砂` = 4 breweries, `せんきん` = 6 brands, `松緑酒造` = single-brand brewery, `架空純米` / `架空酒造銘柄` = absent. If Sakenowa data shifts, re-check counts with a query on `brands` / `breweries`.

**"Not this one?" affordance:** run the clean match, open the result's "See full details →", and the "Not this one? — scan again" link appears on `/sake/[brandId]` (it does **not** appear when you navigate to that page directly). `de`/`en`: repeat on `/de/…` for German (and to confirm `/de/sake/…` still rewrites to coming-soon).

---

## Recipe: force every suggest / chat state

No MCP server or LLM credit needed. Either pin one mode for the server:

```bash
SUGGEST_STUB=ok pnpm dev
```

…or set the cookie per-browser (leave `SUGGEST_STUB` empty) and reload `/en/suggest`:

| Mode | Console call | You should see |
|---|---|---|
| `ok` | `setSuggest('ok')` | 3 suggestion cards; two carry a flavor chart, one is chart-less (asserts no "N/A" placeholder); one cross-beverage descriptor → disclaimer + badges render |
| `no_match` | `setSuggest('no_match')` | Empty-result "no match" copy with onward affordances |
| `rate_limited` | `setSuggest('rate_limited')` | Rate-limit envelope |
| `service_unavailable` | `setSuggest('service_unavailable')` | MCP-down envelope |
| `error` | `setSuggest('error')` | Generic error envelope |

Env var wins over the cookie; the cookie exists so each browser context can pick its own mode against one shared dev server.

---

## Debug panel + server tracing

Append `?debug=1` to any URL (e.g. `/en/scan?debug=1`). This stamps the HttpOnly `yawaragi_debug` cookie (24h sliding) and turns on:

- The `<DebugPanel />` overlay on every page.
- Per-step server-side tracing through the scan / suggest flows — the `+Xs ScanAction / Vision / Sakenowa …` lines (extraction, tier decisions, lookup counts, chosen branch).

Turn it off with `?debug=0`. This is the trace you read when a scan resolves to an unexpected branch — it shows exactly which lookup returned how many rows.

---

## Landing hero (UX-E)

The landing hero renders a real catalogued sake (木戸泉 / Kidoizumi, `brand_id 310`) straight from the Postgres mirror — **no paid calls**. It only renders once the age gate is accepted, and degrades to the text intro if the mirror is unreachable (so it also survives a DB-less environment).

---

## Where the stubs live (maintainers)

- Scan: `src/lib/ai/vision/e2e-stub-provider.ts` (+ `registry.ts` for `VISION_PROVIDER`). Cookie injection: `yawaragi_e2e_vision` (#194).
- Suggest: `resolveSuggestStub()` in `src/lib/suggest/suggest-action.ts`.
- Rate limit: `src/env.ts` (`RATE_LIMIT_BYPASS`) + the prod guard in `src/instrumentation.ts`.
- Debug: `src/lib/debug/debug-mode.ts`.

All stub selectors fail closed on `NODE_ENV=production`.

## Automated equivalent

The same branches are covered deterministically in Playwright — run headed to watch them:

```bash
pnpm test:e2e scan-result-branches --headed   # scan branches (#194)
pnpm test:e2e suggest-page --headed           # suggest states
pnpm test:e2e landing-page --headed           # UX-E hero gating
```
