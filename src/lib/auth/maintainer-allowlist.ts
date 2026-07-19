// The pure core of the maintainer gate (ADR-0020, #244). Splitting the
// allowlist parsing + membership test out of the `auth()`-reading server module
// (`maintainer.ts`) keeps this half free of `server-only`, env, and Clerk — so
// the actual gate logic is directly unit-testable without a request scope, the
// same split P5.5-A used for `parseStoredEntries`.
//
// Why an allowlist gate at all: the persistent tasting journal is account-linked
// personal data, and v1 is deliberately maintainer-only ("private beta",
// ADR-0020) — the public gets the interactive-but-ephemeral example, not
// storage. This predicate is the single point that decides which side of that
// line a given Clerk user id falls on.

/**
 * Parse the `MAINTAINER_USER_IDS` env value (comma-separated Clerk user ids)
 * into a set for O(1) membership. Trims whitespace and drops empty segments, so
 * `"user_a, user_b,"` and a stray trailing comma both behave. An unset/blank
 * value yields an empty set — nobody is a maintainer (fail-closed).
 */
export function parseMaintainerAllowlist(raw: string | null | undefined): ReadonlySet<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  )
}

/**
 * Whether a Clerk user id is on the maintainer allowlist. `null`/`undefined`
 * (an anonymous or signed-out visitor) is never a maintainer, and an empty
 * allowlist admits no one — both fail closed, so the persistent journal stays
 * example-only unless a real id is explicitly listed.
 */
export function isMaintainer(
  userId: string | null | undefined,
  allowlist: ReadonlySet<string>,
): boolean {
  if (!userId) return false
  return allowlist.has(userId)
}
