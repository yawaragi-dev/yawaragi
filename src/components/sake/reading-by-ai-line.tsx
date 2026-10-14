'use client'

import { CaretRight, Scan } from '@phosphor-icons/react/dist/ssr'
import { Sheet, SheetTrigger } from '@/components/ui/sheet'
import { InfoSheetPanel } from '@/components/ui/info-sheet'

/**
 * §9a's "Reading by AI" (design v1.7.1, H3; screenshot 91): one quiet line on
 * an own bottling whose name or brewery still holds the Latin reading a scan
 * gave. Nothing marks the name itself, wherever it appears; this line is the
 * one place that says it, and it opens the Read by AI sheet. A client
 * component only because the sheet is; the page passes the strings.
 */
export function ReadingByAiLine({
  label,
  title,
  body,
  closeLabel,
}: {
  label: string
  title: string
  body: string
  closeLabel: string
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            type="button"
            className="-ml-1 flex min-h-11 w-fit items-center gap-1.5 rounded-md px-1 text-[11px] text-ash-600 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="bottling-reading-by-ai"
          />
        }
      >
        <Scan size={12} aria-hidden="true" />
        {label}
        <CaretRight size={12} aria-hidden="true" />
      </SheetTrigger>
      <InfoSheetPanel title={title} closeLabel={closeLabel} id="bottling-reading-by-ai">
        {body}
      </InfoSheetPanel>
    </Sheet>
  )
}
