'use client'

import { useState } from 'react'
import { DeviceMobile } from '@phosphor-icons/react/dist/ssr'
import { InfoSheetPanel } from '@/components/ui/info-sheet'
import { Sheet, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type HomeScreenPlatform = 'ios' | 'android'

/**
 * Which phone the visitor is on, for the steps to show first. A guess from
 * the user agent is enough: both sets of steps are always in the sheet, so a
 * wrong guess only changes their order. iPadOS reports itself as a Mac with
 * touch.
 */
export function guessHomeScreenPlatform(userAgent: string, maxTouchPoints: number): HomeScreenPlatform | null {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios'
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios'
  if (/Android/.test(userAgent)) return 'android'
  return null
}

/**
 * Account → Help: "Add Yawaragi to your home screen" (design v1.8, O2). The
 * app never prompts for it; this row is the one place that says how, as the
 * steps for the visitor's browser in a §16 sheet. Client-only because the
 * sheet has open state and the order of the steps reads the user agent at
 * the tap.
 */
export function HomeScreenRow({
  label,
  sub,
  title,
  closeLabel,
  steps,
  otherPhones,
}: {
  label: string
  sub: string
  title: string
  closeLabel: string
  steps: Record<HomeScreenPlatform, { name: string; how: string }>
  otherPhones: string
}) {
  const [first, setFirst] = useState<HomeScreenPlatform | null>(null)
  const order: HomeScreenPlatform[] = first === 'android' ? ['android', 'ios'] : ['ios', 'android']

  return (
    <Sheet>
      <SheetTrigger
        onClick={() => setFirst(guessHomeScreenPlatform(navigator.userAgent, navigator.maxTouchPoints))}
        className={cn(
          'flex w-full min-h-[50px] items-center gap-3.5 px-4 py-2.5 text-left transition-colors',
          'border-b border-divider last:border-b-0 cursor-pointer',
          'hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ginshu-600',
        )}
        data-testid="account-home-screen"
      >
        <DeviceMobile size={20} className="shrink-0 text-ash-600" aria-hidden="true" />
        <span className="flex min-w-0 flex-col">
          <span className="text-body text-ink">{label}</span>
          <span className="text-meta text-ash-600">{sub}</span>
        </span>
      </SheetTrigger>
      <InfoSheetPanel title={title} closeLabel={closeLabel} id="home-screen">
        <ol className="flex flex-col gap-3" data-testid="home-screen-steps">
          {order.map((platform, index) => (
            <li key={platform} data-platform={platform}>
              {index === 1 && first !== null && (
                <p className="mb-1 text-section-label uppercase text-ash-600">{otherPhones}</p>
              )}
              <p className="font-medium text-ink">{steps[platform].name}</p>
              <p>{steps[platform].how}</p>
            </li>
          ))}
        </ol>
      </InfoSheetPanel>
    </Sheet>
  )
}
