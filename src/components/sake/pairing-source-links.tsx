import type { PairingSource } from '@/lib/schemas/pairing'

/**
 * The "Sources" list of a pairing sheet (§16): each named source, linked out.
 * Shared by "Goes with" on a bottle's page and "Pick for a dish" on the
 * Cellar, so both sheets cite the table the same way. No hooks, so it renders
 * on either side of the client boundary.
 */
export function PairingSourceLinks({ sources }: { sources: readonly PairingSource[] }) {
  return (
    <ul className="flex flex-col gap-1" role="list">
      {sources.map((s) => (
        <li key={s.url}>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ginshu-700 underline underline-offset-4">
            {s.label}
          </a>
        </li>
      ))}
    </ul>
  )
}
