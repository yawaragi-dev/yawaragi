# Manual testing — forcing states cheaply

How to drive every UI state in local dev **without hunting for a bottle photo, burning Anthropic credit, or running a live MCP server**. All the stubs below are non-production (they fail closed on a production `NODE_ENV`), so they only fire under `pnpm dev`. Vercel Preview builds with `NODE_ENV=production`, so no stub works on a preview deployment; test there signed in as a maintainer instead.

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
- **Signed in as a maintainer?** No flag needed, anywhere, Production included: a Clerk user on `MAINTAINER_USER_IDS` skips the anonymous limits (`enforce-rate-limit.ts`). This is the way to test on a phone against a deploy. Note the allowlist holds Clerk user IDs, and a dev and a production Clerk instance give the same Google account **different** IDs, so each environment's `MAINTAINER_USER_IDS` needs the ID from that environment's instance.
- `LANGFUSE_RECORD_IO=1` — record the actual prompts and model completions onto the Langfuse spans. **Read them in the span's `Raw` tab, NOT the `Formatted` view.** The Formatted Input/Output panel keeps showing `null` / `undefined` even when this is on: `@ai-sdk/otel` writes the payload under the AI-SDK attribute convention (`ai.prompt`), while Langfuse's Formatted panel reads `langfuse.observation.input`, and `@langfuse/vercel-ai-sdk` 5.11.0 does not map between them. The data is there; only that one panel cannot see it. (Verified 2026-09-24 — cost an hour of "the flag is broken" before someone opened `Raw`.) Traces are metadata-only by default because ADR-0009's RoPA commits us to "redacted prompts + completions"; this flips payloads on for a local debugging session. **Ignored on Production by construction** (`payloadRecordingEnabled()` in `src/lib/ai/observability/langfuse-trace.ts` returns false there regardless, and warns once) — so it cannot leak visitor prompts into 30-day retention. Deliberately not tied to the `?debug=1` cookie, which a visitor can set themselves.

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

// Pick a journal state for Home, Collection and Palate: 'populated' | 'empty' | 'unavailable'.
setJournal = (mode) => document.cookie = `yawaragi_journal_stub=${mode};path=/`
clearJournal = () => document.cookie = 'yawaragi_journal_stub=;path=/;max-age=0'
```

> The debug cookie (`yawaragi_debug`) is **HttpOnly** — you cannot set it from JS. Use the `?debug=1` URL param instead (below).

### Cookie reference

| Cookie | Purpose | How to set |
|---|---|---|
| `yawaragi_age_gate` | Accept the 18+ JMStV gate (no flavor data renders until accepted) | `{"v":1,"ts":<ms>}`, or click the modal |
| `yawaragi_e2e_vision` | Inject a scan extraction `{name_ja, brewery_ja, confidence}` (base64) | `setScan(...)` — **needs #194** + `VISION_PROVIDER=e2e-stub` |
| `yawaragi_suggest_stub` | Pick a suggest state without the env var | `setSuggest('ok')` etc. |
| `yawaragi_journal_stub` | Stand in for a maintainer's journal on Home, Collection, Palate, the sake page and the bottling page (reads only; logging a sake or adding a bottling still needs a real maintainer sign-in). `populated` also carries one bottling of your own, at `/en/bottling/stub-bottling`, with one tasting logged against it | `setJournal('populated')` etc. |
| `yawaragi_debug` | Debug panel + per-step server tracing (HttpOnly) | `?debug=1` URL param; `?debug=0` clears |
| `yawaragi_consent` | GDPR cookie-consent decision | via the cookie banner UI |

---

## Recipe: force every scan result branch

The cookie-driven stub (`yawaragi_e2e_vision`) returns whatever extraction you set; the rest of the pipeline is real: the Sakenowa lookup, the nearest-sake candidates and the outcome screen. Without the cookie the stub always returns 獺祭 / 旭酒造.

1. Start dev with `VISION_PROVIDER=e2e-stub` (+ `RATE_LIMIT_BYPASS=1`). Without the env var the cookie is ignored and the scan calls Anthropic for real.
2. Go to `/en/scan`, accept the age gate, and paste the cookie helpers above.
3. Run one `setScan(...)` line, then give it **any** photo (desktop opens the "add a photo" panel; `e2e/fixtures/dassai-label.jpg` works). To switch branches, call `setScan` again, tap the bar's "Scan again" / "Not this one" and give a photo again. The cookie is read at submit time, so no reload is needed.
4. Clear: `document.cookie = 'yawaragi_e2e_vision=;path=/;max-age=0'`.

Every non-match lands on §5a's one outcome screen: kicker · "Scan again" in the bar, a status block, then the parts below, and "Type the name instead" last.

| Branch | Console call | You should see |
|---|---|---|
| Sure match (≥ 0.85) | `setScan('獺祭','獺祭')` | §5 card tagged "Sure match", flavor chart, cross-beverage line. No "Not sure?" row |
| Sure match, label prints a renamed brewery (#388) | `setScan('獺祭','旭酒造')` | The same clean match. 旭酒造 is Dassai's name before June 2025 |
| Best guess (0.60–0.84) | `setScan('而今','木屋正酒造',0.7)` | Card tagged "Best guess". Under the log area, "Not sure? 1 other candidate" opens Takasago 高砂 · Kiyamasa Shuzo · Mie · "Same brewery" |
| Brand matched, brewery differs | `setScan('獺祭','高木酒造')` | "Partly matched — We found the sake, not its brewery", "What we read", one "Is it this one?" row |
| Brewery matched, brand differs | `setScan('架空純米','松緑酒造')` | "Partly matched — We found the brewery, not the sake", "From this brewery" row |
| Several fit, one name at several breweries | `setScan('高砂','架空酒造銘柄')` | "A few fit — Which one is it?", 2 rows with brewery · prefecture, "Same name · {brewery}" |
| Several fit, one brewery's sakes | `setScan('架空純米','せんきん')` | Same screen, up to 3 of せんきん's 5 sakes, "Same brewery · same name" |
| Not in the catalogue, something near | `setScan('十四代本丸','架空酒造零')` | "What we read" (editable, Read by AI badge), then "Did you mean" with Juyondai 十四代 · "Similar name" |
| Not in the catalogue, nothing near | `setScan('架空銘柄零一','架空酒造零')` | The same screen with no "Did you mean". Nothing in the catalogue is close, and we don't invent a guess |
| Unclear photo (< 0.60) | `setScan('獺祭','獺祭',0.5)` | "Unclear photo — We couldn't read this label", three tips. When most of this tab's recent matches (at least 2) were one sake: "This looks like {sake}" with Yes / No stacked (§5a, 45) |

Confidence tiers (`src/lib/scan/confidence-tier.ts`, half-open):
- **≥ 0.85** — "Sure match".
- **0.60–0.84** — "Best guess", with the "Not sure?" row when there are near candidates.
- **< 0.60** — no lookup at all, only the unclear-photo screen.

Verified against the live catalogue on 2026-10-10: 高砂 = 2 breweries, せんきん = 5 brands, 松緑酒造 = a single-brand brewery, 架空… = absent. The names in this table are checked with `resolveScannedLabel` against the mirror. If Sakenowa data shifts, re-check them the same way, or with a query on `brands` / `breweries`.

**Back-to-scan hint:** run a clean match, open "Full bottle page", and "Not the bottle you scanned? · Scan again" appears on `/sake/[brandId]`. It does **not** appear when you navigate to that page directly.

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

## Firefox Responsive Design Mode hides the pointer after typing

In Firefox's Responsive Design Mode (Ctrl+Shift+M) with **touch simulation** on (the hand icon), the mouse pointer disappears as soon as you type in any field and only comes back on a click. Firefox hides the pointer while you type and restores it on the next real mouse event, but touch simulation turns mouse movement into nothing (only presses become touch events), so no restoring event arrives. Every page on the origin does it, including a static HTML file, and the app is not involved (#327). Turn touch simulation off, or leave RDM, when you test typing with a mouse.

## Where the stubs live (maintainers)

- Scan: `src/lib/ai/vision/e2e-stub-provider.ts` (+ `registry.ts` for `VISION_PROVIDER`). Cookie injection: `yawaragi_e2e_vision` (#194).
- Suggest: `resolveSuggestStub()` in `src/lib/suggest/suggest-action.ts`.
- Rate limit: `src/env.ts` (`RATE_LIMIT_BYPASS`) + the prod guard in `src/instrumentation.ts`.
- Debug: `src/lib/debug/debug-mode.ts`.

All stub selectors fail closed on `NODE_ENV=production`, which includes Vercel Preview.

## Automated equivalent

The same branches are covered deterministically in Playwright — run headed to watch them:

```bash
pnpm test:e2e scan-result-branches --headed   # scan branches (#194)
pnpm test:e2e suggest-page --headed           # suggest states
pnpm test:e2e landing-page --headed           # UX-E hero gating
```
