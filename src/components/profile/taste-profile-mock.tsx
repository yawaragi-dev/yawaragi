import { getTranslations } from 'next-intl/server'
import { FlavorAxisLabel } from '@/components/sake/flavor-axis-label'
import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'

/**
 * Static radar-style mock of a taste profile over the six Sakenowa flavor
 * axes. Rendered as an SVG hexagon so it doubles as the Phase 5 design
 * target (see #165); the live surface today (`/sake/[brandId]`, `/suggest`)
 * uses horizontal bars — this radar is deliberately new UI.
 *
 * Data is **illustrative sample values**, not sourced from any real brand
 * profile — chosen to look like a hanayaka-forward, keikai-finishing
 * profile so a visitor gets a coherent read on what a real profile would
 * look like. Because nothing here is Sakenowa data, `<SakenowaAttribution />`
 * is deliberately NOT rendered (would misrepresent the source per ADR-0005).
 *
 * The six axis labels use `<FlavorAxisLabel />` — same component the sake
 * detail page uses — so the romaji+kanji+tooltip convention (CLAUDE.md
 * "6-axis flavor vocabulary") is preserved.
 */

// Sample profile — six values in [0,1] matching the FLAVOR_AXES order.
// f1 hanayaka high, f6 keikai high, low f3 juko → a fragrant/crisp read.
const SAMPLE_PROFILE: Readonly<Record<FlavorAxis, number>> = {
  f1: 0.72,
  f2: 0.35,
  f3: 0.25,
  f4: 0.45,
  f5: 0.55,
  f6: 0.68,
}

// Hexagon geometry: canvas 320x320, centre (160,160), max radius 110.
// Vertices at 30° intervals starting from the top, clockwise. This maps
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

// Label anchor slightly outside the hex vertex so text doesn't collide
// with the polygon stroke. Returns absolute (left, top) in percent so
// Tailwind can position via inline style.
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

function samplePoints(): string {
  return FLAVOR_AXES.map((axis) => {
    const p = pointOnAxis(axis, SAMPLE_PROFILE[axis])
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
  }).join(' ')
}

export async function TasteProfileMock() {
  const t = await getTranslations('profile')

  return (
    <figure
      className="flex flex-col items-center gap-4"
      data-testid="taste-profile-mock"
      aria-label={t('sampleHeading')}
    >
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
            points={samplePoints()}
            className="fill-zinc-900/10 stroke-zinc-900 dark:fill-zinc-100/10 dark:stroke-zinc-100"
            strokeWidth={1.5}
            data-testid="taste-profile-sample-polygon"
          />
          {FLAVOR_AXES.map((axis) => {
            const p = pointOnAxis(axis, SAMPLE_PROFILE[axis])
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
      <figcaption className="max-w-md text-center text-sm text-zinc-600 dark:text-zinc-400">
        {t('sampleCaption')}
      </figcaption>
    </figure>
  )
}
