import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { FlavorAxisLabel } from './flavor-axis-label'

/**
 * Radar / hexagon visualisation of a FlavorProfile over the six Sakenowa
 * axes. Split out of the old `TasteProfileMock` at #198: the geometry (the
 * reusable part) was entangled with a hardcoded `SAMPLE_PROFILE` (the
 * throwaway part), so the component could not render a *real* profile and
 * the polygon math was untestable except via a screenshot.
 *
 * Now it takes the six values as a prop. Phase 5's Taste Profile builder
 * feeds a User's derived `TasteProfile` (same six axes) straight in; the
 * mock passes illustrative sample values through the same seam.
 *
 * Bars remain the default across live surfaces (sake detail / scan /
 * suggest) via `FlavorProfileView`; the radar is the Phase-5 design target
 * (see #165), kept a separate component because its SVG geometry shares
 * nothing with the bar layout but the axis list.
 */

// Hexagon geometry: canvas 320x320, centre (160,160), max radius 110.
// Vertices at 60° intervals starting from the top, clockwise, mapping
// FLAVOR_AXES order f1..f6 → top, upper-right, lower-right, bottom,
// lower-left, upper-left.
const CENTER = 160
const MAX_RADIUS = 110
const AXIS_ANGLES_DEG: Readonly<Record<FlavorAxis, number>> = {
  f1: -90,
  f2: -30,
  f3: 30,
  f4: 90,
  f5: 150,
  f6: -150,
}

function pointOnAxis(axis: FlavorAxis, magnitude: number): { x: number; y: number } {
  const rad = (AXIS_ANGLES_DEG[axis] * Math.PI) / 180
  return {
    x: CENTER + Math.cos(rad) * MAX_RADIUS * magnitude,
    y: CENTER + Math.sin(rad) * MAX_RADIUS * magnitude,
  }
}

// Label anchor slightly outside the hex vertex so text doesn't collide with
// the polygon stroke. Returns absolute (left, top) in percent.
function labelAnchor(axis: FlavorAxis): { left: string; top: string } {
  const p = pointOnAxis(axis, 1.28)
  return {
    left: `${(p.x / (CENTER * 2)) * 100}%`,
    top: `${(p.y / (CENTER * 2)) * 100}%`,
  }
}

function hexPointsAt(magnitude: number): string {
  return FLAVOR_AXES.map((axis) => {
    const p = pointOnAxis(axis, magnitude)
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
  }).join(' ')
}

/**
 * The SVG `points` string for a profile's plotted polygon. Pure and
 * exported so the axis-position math is unit-testable against known input
 * (was previously only reachable via a screenshot of fixed sample data).
 */
export function flavorRadarPolygonPoints(profile: FlavorProfile): string {
  return FLAVOR_AXES.map((axis) => {
    const p = pointOnAxis(axis, profile[axis])
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
  }).join(' ')
}

interface FlavorRadarViewProps {
  profile: FlavorProfile
}

export function FlavorRadarView({ profile }: FlavorRadarViewProps) {
  return (
    <div
      className="relative aspect-square w-full max-w-md"
      data-testid="taste-profile-radar"
    >
      <svg
        viewBox="0 0 320 320"
        className="h-full w-full"
        role="presentation"
        aria-hidden="true"
      >
        {[0.25, 0.5, 0.75, 1].map((m) => (
          <polygon
            key={m}
            points={hexPointsAt(m)}
            className="fill-none stroke-zinc-300 dark:stroke-zinc-700"
            strokeWidth={1}
          />
        ))}
        {FLAVOR_AXES.map((axis) => {
          const tip = pointOnAxis(axis, 1)
          return (
            <line
              key={axis}
              x1={CENTER}
              y1={CENTER}
              x2={tip.x}
              y2={tip.y}
              className="stroke-zinc-300 dark:stroke-zinc-700"
              strokeWidth={1}
            />
          )
        })}
        <polygon
          points={flavorRadarPolygonPoints(profile)}
          className="fill-zinc-900/10 stroke-zinc-900 dark:fill-zinc-100/10 dark:stroke-zinc-100"
          strokeWidth={1.5}
          data-testid="taste-profile-sample-polygon"
        />
        {FLAVOR_AXES.map((axis) => {
          const p = pointOnAxis(axis, profile[axis])
          return (
            <circle
              key={axis}
              cx={p.x}
              cy={p.y}
              r={3}
              className="fill-zinc-900 dark:fill-zinc-100"
            />
          )
        })}
      </svg>
      {FLAVOR_AXES.map((axis) => {
        const anchor = labelAnchor(axis)
        return (
          <div
            key={axis}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: anchor.left, top: anchor.top }}
            data-testid={`taste-profile-axis-anchor-${axis}`}
          >
            <FlavorAxisLabel axis={axis} />
          </div>
        )
      })}
    </div>
  )
}
