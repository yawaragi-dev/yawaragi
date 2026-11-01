import "server-only";
import { env } from "@/env";
import { readAnonymousSessionCookie } from "@/lib/legal/anonymous-session-cookie";
import { type ReadCache, readCacheKey, upstashReadCache } from "./read-cache";
import { ownBottlingForRead } from "@/lib/scan/read-bottling";
import { readLabel, type LabelCatalogue } from "@/lib/scan/read-label";
import { resolveViewerJournal } from "@/lib/taste/viewer-journal";
import type { Locale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import {
  getVisionProvider,
  DEFAULT_VISION_PROVIDER_KEY,
  TIER_2_VISION_PROVIDER_KEY,
} from "@/lib/ai/vision/registry";
import { recordActionMetadata } from "@/lib/ai/observability/action-span";
import { debugAdd } from "@/lib/debug/debug-log";
import {
  meteredCall,
  type CookieJar,
  type Meter,
} from "@/lib/metering/metered-call";
import {
  lookupBreweryByBrand,
  lookupFlavorChart,
} from "@/lib/sakenowa/catalogue-reads";
import { resolveScannedLabel } from "@/lib/sakenowa/resolve-scanned-label";
import { resolveWithEarlierRead } from "@/lib/sakenowa/resolve-with-earlier-read";
import { findNearestBrands } from "@/lib/sakenowa/nearest-brands";
import { parseEarlierScanRead } from "@/lib/schemas/earlier-scan-read";
import type { ScanActionState } from "./scan-action-state";
import { classifyScanOutcome } from "./scan-outcome";

/**
 * One label scan, as `POST /{locale}/scan/read` answers it
 * (`src/app/[locale]/(app)/scan/read/route.ts`) for `<ScanForm />`.
 *
 * Not a Server Action: the browser cannot abort one, and Next runs them one
 * at a time, so a read the visitor cancelled (design v1.9 S4) kept the
 * screen waiting and held every resend behind it until it came back. A
 * route under the proxy is fetched with an `AbortController` and still sees
 * the Clerk session, the session cookie and the 18+ gate.
 *
 * It does the outside work around one read of a label: parses the form,
 * answers a resent photo from the read cache, pays the rate limit BEFORE any
 * paid model call (the cost-protection invariant, kept by `meteredCall`,
 * which also opens the Langfuse span and the debug log and counts the
 * scan), records what the read cost on the span, and adds the visitor's own
 * bottlings to a match. The read itself — the two vision tiers,
 * the catalogue lookup, the guesses beside the answer — is `readLabel`
 * (`read-label.ts`), which gets the registry's providers and the Sakenowa
 * mirror from here.
 *
 * The rate limit's budget keys (one is the `yawaragi_session` cookie's
 * `sid`) never reach Postgres or a log line; the photo is discarded once the
 * model has read it.
 */

/** The Sakenowa mirror, as `readLabel` asks for it. */
const SCAN_CATALOGUE: LabelCatalogue = {
  resolve: (label) => resolveScannedLabel(label),
  breweryOf: (brandId) => lookupBreweryByBrand(brandId),
  flavorChartOf: (brandId) => lookupFlavorChart(brandId),
  nearest: (read, options) => findNearestBrands(read, options),
  withEarlierRead: (second, secondOwn, first) =>
    resolveWithEarlierRead(second, secondOwn, first),
};

function isLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}

/**
 * `formData` carries the downscaled JPEG under `image`, the visitor's locale
 * under `locale` and, for a second photo of the same bottle, what the last
 * scan read under `earlierRead`.
 */
export async function scanLabel(formData: FormData): Promise<ScanActionState> {
  // #287 slice D — one Langfuse span per scan, with the tier-2 retry rate
  // recorded on it. Sonnet 4.6 costs ~6x Haiku and fires on every tier-1
  // status except a clean `matched`, so the retry rate is the dominant
  // driver of scan spend and nothing tracked it before.
  // The span, the debug log, the `vision-scan` rate limit and the
  // `scan:<status>` usage counter are the meter's (`metered-call.ts`).
  return meteredCall(
    {
      bucket: "vision-scan",
      logPrefix: "[scan]",
      span: { name: "scan-action", classify: classifyScanOutcome },
      count: (result) => `scan:${result.status}`,
    },
    (meter) => runScanAction(formData, meter),
  );
}

async function runScanAction(
  formData: FormData,
  meter: Meter,
): Promise<ScanActionState> {
  const image = formData.get("image");
  if (!(image instanceof Blob) || image.size === 0) {
    debugAdd(
      "ScanAction",
      "invalid_input: missing or empty image blob",
      undefined,
      "warn",
    );
    return { status: "invalid_input", reason: "missing_image" };
  }
  debugAdd(
    "ScanAction",
    `received image (${image.size} bytes, ${image.type || "no MIME"})`,
  );

  const localeRaw = formData.get("locale");
  if (typeof localeRaw !== "string" || !isLocale(localeRaw)) {
    debugAdd(
      "ScanAction",
      `invalid_input: unsupported locale "${String(localeRaw)}"`,
      undefined,
      "warn",
    );
    return { status: "invalid_input", reason: "unsupported_locale" };
  }
  // #408: what the previous scan in this tab read, if the visitor is
  // photographing another side. Never passed to the vision call — the
  // photo is read blind — and consulted only after this scan has its own
  // answer. Malformed or absent is the same as a first scan.
  const earlierRead = parseEarlierScanRead(formData.get("earlierRead"));

  // Design v1.9 S4: the same photo sent again within ten minutes (its
  // answer was lost on the way back) gets the stored answer — before the
  // rate limit, so it does not use another free scan, and with no model
  // call. The visitor's own bottlings are looked up fresh either way.
  const { cookieJar } = meter;
  const cached = await openReadCache(cookieJar, image, localeRaw, earlierRead);
  if (cached) {
    const hit = await cached.cache.get(cached.key);
    if (hit) {
      debugAdd(
        "ScanAction",
        "same photo within 10 min → stored answer, no model call, no scan used",
      );
      recordActionMetadata({ "scan.cacheHit": true });
      return withOwnBottlings(hit, cookieJar);
    }
  }

  // The rate limit is paid here, after the read cache and before any model
  // call. A spent budget or a missing session cookie comes back as
  // `rate_limited` / `session_missing` and the vision provider is never
  // reached.
  return meter.pay(async ({ remaining }) => {
    // The label itself — tier 1, tier 2 when tier 1's answer does not stand,
    // the catalogue, the guesses beside the answer — is `readLabel`'s.
    const { state, trace } = await readLabel(
      { image, locale: localeRaw, earlierRead },
      {
        tier1: () => getVisionProvider(DEFAULT_VISION_PROVIDER_KEY),
        tier2: () => getVisionProvider(TIER_2_VISION_PROVIDER_KEY),
        tier2Name: TIER_2_VISION_PROVIDER_KEY,
        catalogue: SCAN_CATALOGUE,
      },
    );
    // The cost signal. `scan.tier2Used` over all scans gives the retry rate
    // (recorded on the cheap path too: a rate needs the denominator);
    // `scan.tier1Status` says WHICH tier-1 outcome is driving it.
    recordActionMetadata(
      trace.tier2Used
        ? {
            "scan.tier1Status": trace.tier1Status,
            "scan.tier2Used": true,
            "scan.tier2Provider": TIER_2_VISION_PROVIDER_KEY,
          }
        : { "scan.tier1Status": trace.tier1Status, "scan.tier2Used": false },
    );
    if (trace.earlierRead)
      recordActionMetadata({ "scan.earlierRead": trace.earlierRead });
    // Keep the answer as the catalogue resolved it, then add the visitor's bottlings.
    if (cached) await cached.cache.set(cached.key, state);
    const answered = await withOwnBottlings(state, cookieJar);
    return remaining === undefined
      ? answered
      : { ...answered, scansLeft: remaining };
  });
}

/**
 * Adds the visitor's own bottlings of the matched sake, the one the label
 * points at first (design v1.6 §5, "Is it one of these bottlings?"). The
 * catalogue stops at the sake; the label names the bottling, and a visitor
 * who added it before should land on it rather than add it twice.
 *
 * Only a match has a sake to hang bottlings on, and only a visitor who
 * keeps a journal has any. A failure here leaves the scan as it was.
 */
async function withOwnBottlings(
  state: ScanActionState,
  cookieJar: CookieJar,
): Promise<ScanActionState> {
  // Each of two bottles opens as its own reading, so each gets its bottlings.
  if (state.status === "two_bottles") {
    const bottles = await Promise.all(
      state.bottles.map(async (bottle) => ({
        ...bottle,
        reading: (await withOwnBottlings(
          bottle.reading,
          cookieJar,
        )) as typeof bottle.reading,
      })),
    );
    return { ...state, bottles };
  }
  if (state.status !== "matched") return state;
  try {
    const viewer = await resolveViewerJournal(cookieJar);
    const own = viewer.expressions.filter((e) => e.brandId === state.brandId);
    if (own.length === 0) return state;
    const fits = ownBottlingForRead(state.extraction.bottling, own);
    const rows = own.map((e) => ({
      id: e.id,
      name: e.name,
      fitsLabel: e.id === fits?.id,
      ...(e.grade ? { grade: e.grade } : {}),
      ...(e.styles ? { styles: e.styles } : {}),
    }));
    return {
      ...state,
      ownBottlings: rows.sort(
        (a, b) => Number(b.fitsLabel) - Number(a.fitsLabel),
      ),
    };
  } catch (err) {
    debugAdd(
      "ScanAction",
      "reading the visitor’s own bottlings threw; the match stands without them",
      {
        message: err instanceof Error ? err.message.slice(0, 300) : String(err),
      },
      "warn",
    );
    return state;
  }
}

/**
 * The read cache for this request, or null when it cannot be used: no
 * Upstash or session secret (CI, a fresh checkout), or no session cookie.
 */
async function openReadCache(
  cookieJar: CookieJar,
  image: Blob,
  locale: string,
  earlierRead: unknown,
): Promise<{ cache: ReadCache; key: string } | null> {
  const restUrl = env.UPSTASH_REDIS_REST_URL;
  const restToken = env.UPSTASH_REDIS_REST_TOKEN;
  const secret = env.SESSION_COOKIE_SECRET;
  if (!restUrl || !restToken || !secret) return null;
  const session = readAnonymousSessionCookie(cookieJar, secret);
  if (!session) return null;
  const key = await readCacheKey({
    sid: session.sid,
    locale,
    earlierRead,
    image,
  });
  return { cache: upstashReadCache({ restUrl, restToken }), key };
}
