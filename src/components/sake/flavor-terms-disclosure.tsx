import { getTranslations } from 'next-intl/server'
import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import {
  FlavorTermsSheet,
  buildFlavorTermsStrings,
} from './flavor-terms-sheet'
import type { FlavorAxisStrings } from './flavor-profile-view'

/**
 * Server-side wrapper around `<FlavorTermsSheet />` that resolves its own
 * strings — the async half of the sync-View + async-wrapper pair the sibling
 * primitives use.
 *
 * It lives in its own file rather than beside the sheet because
 * `flavor-terms-sheet.tsx` is imported by the **client** scan result card
 * (ADR-0015) for `buildFlavorTermsStrings`; putting `next-intl/server` in
 * that module would drag it into the client bundle.
 *
 * Use this from a server surface that renders axis words without going
 * through `<FlavorProfileView />` — today that is the radar. Surfaces that
 * do go through the shared view get the disclosure automatically and should
 * NOT add a second one.
 */

interface FlavorTermsDisclosureProps {
  /** Disambiguates element ids when a page renders more than one. */
  instanceId: string
  className?: string
}

export async function FlavorTermsDisclosure({
  instanceId,
  className,
}: FlavorTermsDisclosureProps) {
  const tAxis = await getTranslations('flavorAxis')
  const axisStrings = {} as Record<FlavorAxis, FlavorAxisStrings>
  for (const axis of FLAVOR_AXES) {
    axisStrings[axis] = {
      kanji: tAxis(`${axis}.kanji`),
      approximation: tAxis(`${axis}.label`),
      caveat: tAxis(`${axis}.caveat`),
    }
  }

  return (
    <FlavorTermsSheet
      strings={buildFlavorTermsStrings((key) => tAxis(`disclosure.${key}`))}
      axisStrings={axisStrings}
      instanceId={instanceId}
      className={className}
    />
  )
}
