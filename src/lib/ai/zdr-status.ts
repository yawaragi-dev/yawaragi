/**
 * Anthropic Zero Data Retention (ZDR) status for our account.
 *
 * Default: `false`. Without ZDR, Anthropic retains API inputs and outputs (including
 * vision images sent to /v1/messages) for up to 30 days for trust-and-safety per their
 * standard Commercial Terms. ADR-0009 § "Retention is documented per data type"
 * acknowledges this 30d window; ZDR is the only path to a true process-and-discard
 * posture for vision/chat inputs.
 *
 * When ZDR is signed (Anthropic Enterprise contact via sales), flip this constant to
 * `true` in a PR whose body cites the Anthropic ZDR ref. The Phase 3 vision flow
 * imports this constant and refuses to run in production when it is `false`.
 *
 * See issue #59 (Anthropic Files API ban + ZDR negotiation gate) and ADR-0009.
 */
export const ZDR_ACTIVE = false
