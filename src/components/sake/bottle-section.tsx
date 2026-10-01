import type { ReactNode } from 'react'

/**
 * One band of the bottle page — design v1.4 §9.
 *
 * §9 is ten sections in a fixed order, "personal to general", and every one of
 * them is drawn the same way: an 11px uppercase tracked label on the left, an
 * optional right-aligned caption that says where the facts come from ("Brewery
 * recommends", "Brewery + label", "Label only"), and the content underneath.
 * Reference: screenshots 16 and 17.
 *
 * The caption is the page's provenance voice in the design's own vocabulary.
 * It is NOT a `<ProvenanceBadge />` and must not be confused with one: the
 * badge marks a value as machine-derived (ADR-0005), the caption names the
 * human source a published fact came from. A section can carry both.
 *
 * Sync and string-fed, like the other `sake/` primitives, so an async server
 * wrapper and the client result card could both render it.
 */
export function BottleSection({
  label,
  caption,
  children,
  testId,
}: {
  /** The 11px uppercase section label. Already localised. */
  label: string
  /** Optional right-aligned source caption. Already localised. */
  caption?: string
  children: ReactNode
  testId: string
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-section-label uppercase text-ash-600">{label}</h2>
        {caption !== undefined && (
          // Capped so a long caption wraps into its own column rather than
          // squeezing the label — "Brewery recommends" already wraps to two
          // lines at 390px in the reference.
          <p className="max-w-[45%] text-right text-section-label uppercase text-ash-500">
            {caption}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * A fact the catalogue does not carry — design v1.4 rule 4: "Missing data is
 * stated, not hidden."
 *
 * Italic, per the same rule's sibling ("Placeholders are always italic", rule
 * 8) and §9.5's "Unknown: 'Not published', italic neutral-700". Rendering the
 * row with this is the point: a spec grid that silently drops its unknown
 * fields tells the visitor nothing, while one that names them tells them the
 * catalogue is thin on this bottle — which is true, and which §9 designs for.
 */
export function NotPublished({ label }: { label: string }) {
  return <span className="italic text-ash-700">{label}</span>
}
