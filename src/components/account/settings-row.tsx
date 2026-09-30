import type { Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * One row of §15's grouped settings list.
 *
 * §15: "rows **min 50px, may grow**; icon neutral-600; value right-aligned
 * neutral-700". `min-h` rather than `h` is the spec's own instruction and it
 * matters for German — "Cookie-Einstellungen" plus a sub-line is taller than
 * its English counterpart, and a fixed height would clip it.
 *
 * Two shapes, because conflating them is how a settings list starts lying:
 *
 * - **An action** (`children`): the caller supplies its own control — a button,
 *   a toggle.
 * - **Inert** (no children): information only. §15 marks Language "**not
 *   tappable** until DACH launch", and a row that looks tappable and is not is
 *   worse than one that never claimed to be.
 *
 * A *link* row will be a third when §15's remaining rows land; it is not here
 * yet because nothing in this slice navigates, and an unused variant is a
 * guess about the next slice rather than code.
 */
export function SettingsRow({
  icon: RowIcon,
  label,
  value,
  sub,
  children,
  testId,
}: {
  icon: Icon
  label: string
  /** Right-aligned current value, per §15. */
  value?: string
  /** Second line under the label — context, or why a row is inert. */
  sub?: string
  /** A caller-supplied control. Makes the row an action rather than a link. */
  children?: React.ReactNode
  testId: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-[50px] items-center gap-3.5 px-4 py-2.5',
        'border-b border-divider last:border-b-0',
      )}
      data-testid={testId}
    >
      <RowIcon size={20} className="shrink-0 text-ash-600" aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className="text-body text-ink">{label}</span>
        {sub && <span className="text-meta text-ash-600">{sub}</span>}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {value && <span className="text-meta text-ash-700">{value}</span>}
        {children}
      </span>
    </div>
  )
}

/** A titled group of rows — §15's "Groups". */
export function SettingsGroup({
  title,
  children,
  testId,
}: {
  title: string
  children: React.ReactNode
  testId: string
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h2 className="px-1 text-section-label uppercase text-ash-600">{title}</h2>
      <div className="overflow-hidden rounded-xl bg-surface shadow-yw-sm">{children}</div>
    </section>
  )
}
