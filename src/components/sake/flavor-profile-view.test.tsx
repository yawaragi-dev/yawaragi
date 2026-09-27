import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FLAVOR_AXES } from '@/lib/schemas/flavor-chart'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import {
  FlavorProfileView,
  buildFlavorAxisStrings,
} from './flavor-profile-view'

const profile: FlavorProfile = {
  f1: 0.1,
  f2: 0.2,
  f3: 0.3,
  f4: 0.4,
  f5: 0.5,
  f6: 0.6,
}

// Stand-in axis strings — the resolver reads `flavorAxis.<axis>.<field>`;
// here we just echo the key so assertions can be exact without i18n.
const axisStrings = buildFlavorAxisStrings((axis, field) => `${axis}:${field}`)

// ADR-0022 made the disclosure a required prop rather than an optional one,
// precisely so a chart cannot be constructed without it. These tests pay that
// cost on every render — which is the point.
const termsStrings = {
  caveat: "Brewers' terms, translated loosely.",
  triggerLabel: 'About these flavor words',
  title: 'About these flavor words',
  intro: 'These six are Japanese brewers\' terms.',
  closeLabel: 'Close',
}

describe('FlavorProfileView', () => {
  it('renders all six axes as progressbars carrying the input value on the bar variants', () => {
    render(
      <FlavorProfileView
        profile={profile}
        axisStrings={axisStrings}
        chartLabel="Flavor chart"
        variant="row"
        termsStrings={termsStrings}
        instanceId="test"
      />,
    )
    for (const axis of FLAVOR_AXES) {
      const bar = screen.getByTestId(`flavor-axis-${axis}-bar`)
      expect(bar.getAttribute('role')).toBe('progressbar')
      expect(bar.getAttribute('aria-valuenow')).toBe(String(profile[axis]))
    }
    // f1=0.10 → "0.10"; proves the value comes from the input, not a mock.
    expect(screen.getByTestId('flavor-axis-f1-value').textContent).toBe('0.10')
  })

  it('drives the bar fill width from the axis value', () => {
    render(
      <FlavorProfileView
        profile={{ ...profile, f1: 0.25 }}
        axisStrings={axisStrings}
        chartLabel="Flavor chart"
        variant="grid"
        termsStrings={termsStrings}
        instanceId="test"
      />,
    )
    const fill = screen.getByTestId('flavor-axis-f1-bar')
      .firstElementChild as HTMLElement
    expect(fill.style.width).toBe('25.0%')
  })

  it('uses the shared bar container testid for both bar variants', () => {
    const { rerender } = render(
      <FlavorProfileView
        profile={profile}
        axisStrings={axisStrings}
        chartLabel="Flavor chart"
        variant="row"
        termsStrings={termsStrings}
        instanceId="test"
      />,
    )
    expect(screen.getByTestId('brand-flavor-chart')).toBeTruthy()
    rerender(
      <FlavorProfileView
        profile={profile}
        axisStrings={axisStrings}
        chartLabel="Flavor chart"
        variant="grid"
        termsStrings={termsStrings}
        instanceId="test"
      />,
    )
    expect(screen.getByTestId('brand-flavor-chart')).toBeTruthy()
  })

  it('renders the cluster variant as label+value chips with no bars', () => {
    render(
      <FlavorProfileView
        profile={profile}
        axisStrings={axisStrings}
        chartLabel="Flavor chart"
        variant="cluster"
        termsStrings={termsStrings}
        instanceId="test"
      />,
    )
    const cluster = screen.getByTestId('suggest-card-flavor-cluster')
    expect(cluster).toBeTruthy()
    expect(
      within(cluster).getByTestId('flavor-axis-f6-value').textContent,
    ).toBe('0.60')
    expect(screen.queryByTestId('flavor-axis-f1-bar')).toBeNull()
  })

  it.each(['row', 'grid', 'cluster'] as const)(
    'mounts the brewers-term disclosure on the %s variant',
    (variant) => {
      // THE ADR-0022 test. The axes render as English approximations only
      // because this sheet is reachable from every chart. A variant that
      // renders the words without it is the exact regression the ADR warns
      // about, and it would look completely fine on screen.
      render(
        <FlavorProfileView
          profile={profile}
          axisStrings={axisStrings}
          chartLabel="Flavor chart"
          variant={variant}
          termsStrings={termsStrings}
          instanceId="test"
        />,
      )

      const caveat = screen.getByTestId('info-sheet-flavor-terms-test-caveat')
      expect(caveat.textContent).toBe("Brewers' terms, translated loosely.")

      // The caveat must be wired to the trigger, not merely present: that is
      // what gets it announced without opening the sheet.
      const trigger = screen.getByTestId('info-sheet-flavor-terms-test-trigger')
      expect(trigger.getAttribute('aria-describedby')).toBe(caveat.id)
    },
  )

  it('keys the disclosure by instance so several charts can share a page', () => {
    // `/suggest` renders up to five cards, each with a cluster. Duplicate ids
    // would point every trigger's aria-describedby at the first caveat.
    render(
      <>
        <FlavorProfileView
          profile={profile}
          axisStrings={axisStrings}
          chartLabel="Flavor chart"
          variant="cluster"
          termsStrings={termsStrings}
          instanceId="one"
        />
        <FlavorProfileView
          profile={profile}
          axisStrings={axisStrings}
          chartLabel="Flavor chart"
          variant="cluster"
          termsStrings={termsStrings}
          instanceId="two"
        />
      </>,
    )

    const a = screen.getByTestId('info-sheet-flavor-terms-one-trigger')
    const b = screen.getByTestId('info-sheet-flavor-terms-two-trigger')
    expect(a.getAttribute('aria-describedby')).not.toBe(
      b.getAttribute('aria-describedby'),
    )
  })

  it('exposes the localised chart label as the region accessible name', () => {
    render(
      <FlavorProfileView
        profile={profile}
        axisStrings={axisStrings}
        chartLabel="Geschmacksprofil"
        variant="row"
        termsStrings={termsStrings}
        instanceId="test"
      />,
    )
    expect(
      screen.getByRole('region', { name: 'Geschmacksprofil' }),
    ).toBeTruthy()
  })
})
