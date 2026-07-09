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

describe('FlavorProfileView', () => {
  it('renders all six axes as progressbars carrying the input value on the bar variants', () => {
    render(
      <FlavorProfileView
        profile={profile}
        axisStrings={axisStrings}
        chartLabel="Flavor chart"
        variant="row"
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
      />,
    )
    expect(screen.getByTestId('brand-flavor-chart')).toBeTruthy()
    rerender(
      <FlavorProfileView
        profile={profile}
        axisStrings={axisStrings}
        chartLabel="Flavor chart"
        variant="grid"
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
      />,
    )
    const cluster = screen.getByTestId('suggest-card-flavor-cluster')
    expect(cluster).toBeTruthy()
    expect(
      within(cluster).getByTestId('flavor-axis-f6-value').textContent,
    ).toBe('0.60')
    expect(screen.queryByTestId('flavor-axis-f1-bar')).toBeNull()
  })

  it('exposes the localised chart label as the region accessible name', () => {
    render(
      <FlavorProfileView
        profile={profile}
        axisStrings={axisStrings}
        chartLabel="Geschmacksprofil"
        variant="row"
      />,
    )
    expect(
      screen.getByRole('region', { name: 'Geschmacksprofil' }),
    ).toBeTruthy()
  })
})
