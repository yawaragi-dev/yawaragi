import { PALATE_FIRM_THRESHOLD, palateConfidence } from '@/lib/taste/palate-read'

/**
 * §12's confidence card: "Early read · {n} of 10 tastings to a firm profile"
 * or "Firm · based on {n} tastings", with a bar.
 *
 * The card exists to stop the palate from over-claiming. A six-axis reading
 * off three tastings and one off forty look identical on a chart, and the only
 * honest difference is stated here — which is why this is a card with its own
 * surface rather than a caption.
 */
export function PalateConfidence({
  ratingCount,
  label,
}: {
  ratingCount: number
  /** Already-localised and already-pluralised. */
  label: string
}) {
  const confidence = palateConfidence(ratingCount)
  return (
    <section
      className="flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-yw-sm"
      data-testid="palate-confidence"
    >
      <p className="text-body text-ink">{label}</p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={PALATE_FIRM_THRESHOLD}
        aria-valuenow={Math.min(ratingCount, PALATE_FIRM_THRESHOLD)}
        aria-label={label}
        className="h-1 w-full overflow-hidden rounded-full bg-ash-200"
      >
        <span
          className="block h-full rounded-full bg-ginshu-500"
          style={{ width: `${Math.round(confidence * 100)}%` }}
        />
      </div>
    </section>
  )
}
