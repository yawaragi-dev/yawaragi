/**
 * Promotional phrases forbidden by JMStV §6(5) when shown to potentially minor
 * audiences. Both locale catalogues are scanned against the FULL list — a
 * German phrase smuggled into `en.json` must still be caught.
 *
 * Source of truth for the phrase list. The audit script in
 * `scripts/audit-i18n-promotional.ts` and any future runtime check both
 * consume this constant.
 *
 * Keep the list tight. False positives undermine the gate's credibility — add
 * a phrase only after a real "this could have shipped" near-miss.
 */
export const FORBIDDEN_COPY: ReadonlyArray<string> = [
  // English
  'buy now',
  "don't miss",
  'limited time',
  'exclusive offer',
  // German
  'Vergiss nicht zu kaufen',
  'Nur heute',
  'Verpasse nicht',
]
