'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Minus, Plus, Stack } from '@phosphor-icons/react/dist/ssr'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  CELLAR_SIZES,
  type CellarSize,
  DEFAULT_CELLAR_SIZE,
  MAX_CELLAR_COUNT,
} from '@/lib/schemas/cellar-bottle'
import type { CellarSheetValues } from '@/lib/schemas/cellar-input'
import { cn } from '@/lib/utils'

/**
 * The "Add to cellar" sheet (design v1.6.2, decision 2; screenshot 66): how
 * many bottles, their size, and whether they are nama. The same sheet edits a
 * cellar row, starting from what the row holds.
 *
 * Three controls and one button, because this is where size and nama are
 * asked — nowhere else. The count starts at 1, the size at 720 ml, nama off:
 * for the common bottle the sheet is one tap on the button.
 *
 * The caller owns the saving and says how it went (`pending`, `failed`).
 */
export function CellarSheet({
  open,
  onOpenChange,
  mode,
  name,
  initial,
  pending,
  failed,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `add` puts bottles in; `edit` changes a row that is there. */
  mode: 'add' | 'edit'
  /** What the bottles are of, under the title. */
  name: string
  /** A row's values when editing; the defaults when adding. */
  initial?: { count: number; sizeMl: CellarSize | null; nama: boolean }
  pending: boolean
  failed: boolean
  onSubmit: (values: CellarSheetValues) => void
}) {
  const t = useTranslations('cellar')
  const [count, setCount] = useState(initial?.count ?? 1)
  const [sizeMl, setSizeMl] = useState<CellarSize>(initial?.sizeMl ?? DEFAULT_CELLAR_SIZE)
  const [nama, setNama] = useState(initial?.nama ?? false)

  const step =
    'flex size-10 items-center justify-center rounded-lg border border-ash-300 text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-40'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        overlayClassName="bg-black/55 supports-backdrop-filter:backdrop-blur-none"
        className="gap-0 rounded-t-[20px] border-0 bg-surface p-0 text-ink shadow-yw-lg"
        data-testid="cellar-sheet"
      >
        <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
          <span className="h-1 w-9 rounded-full bg-ash-400" />
        </div>
        <div className="flex flex-col gap-1 px-5 pt-2 pb-3">
          <SheetTitle className="text-title font-medium text-ink">
            {t(mode === 'edit' ? 'sheetEditTitle' : 'add')}
          </SheetTitle>
          <p className="text-meta text-ash-700">{name}</p>
        </div>

        <div className="flex flex-col px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          {/* -- Bottles ---------------------------------------------------- */}
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-divider">
            <span className="text-card-heading text-ink">{t('sheetBottles')}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCount((n) => Math.max(1, n - 1))}
                disabled={count <= 1}
                aria-label={t('sheetFewer')}
                className={step}
                data-testid="cellar-sheet-fewer"
              >
                <Minus size={16} aria-hidden="true" />
              </button>
              <output className="w-6 text-center text-md-alt text-ink" aria-live="polite" data-testid="cellar-sheet-count">
                {count}
              </output>
              <button
                type="button"
                onClick={() => setCount((n) => Math.min(MAX_CELLAR_COUNT, n + 1))}
                disabled={count >= MAX_CELLAR_COUNT}
                aria-label={t('sheetMore')}
                className={step}
                data-testid="cellar-sheet-more"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* -- Size ------------------------------------------------------- */}
          <fieldset className="flex flex-col gap-2.5 border-b border-divider py-3.5">
            <legend className="text-card-heading text-ink">{t('sheetSize')}</legend>
            <div className="flex flex-wrap gap-2 pt-2.5">
              {CELLAR_SIZES.map((size) => (
                <label
                  key={size}
                  className={cn(
                    'flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-subtle transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ginshu-600',
                    size === sizeMl
                      ? 'border-ginshu-600 bg-ginshu-600 font-medium text-ground'
                      : 'border-ash-300 text-ink hover:bg-ash-200',
                  )}
                  data-testid={`cellar-sheet-size-${size}`}
                >
                  <input
                    type="radio"
                    name="cellar-size"
                    value={size}
                    checked={size === sizeMl}
                    onChange={() => setSizeMl(size)}
                    className="sr-only"
                  />
                  {t('sheetSizeOption', { ml: size })}
                </label>
              ))}
            </div>
          </fieldset>

          {/* -- Nama ------------------------------------------------------- */}
          <div className="flex items-center justify-between gap-4 py-3.5">
            <span className="flex min-w-0 flex-col gap-0.5" id="cellar-sheet-nama-label">
              <span className="text-card-heading text-ink">{t('sheetNama')}</span>
              <span className="text-meta text-ash-700">{t('sheetNamaHint')}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={nama}
              aria-labelledby="cellar-sheet-nama-label"
              onClick={() => setNama((on) => !on)}
              className={cn(
                'relative h-7 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                nama ? 'bg-ginshu-600' : 'bg-ash-300',
              )}
              data-testid="cellar-sheet-nama"
            >
              <span
                className={cn(
                  'absolute top-0.5 size-6 rounded-full bg-ground transition-[left]',
                  nama ? 'left-[18px]' : 'left-0.5',
                )}
                aria-hidden="true"
              />
            </button>
          </div>

          {failed && (
            <p role="alert" className="pb-2 text-meta text-ginshu-700" data-testid="cellar-sheet-error">
              {t('error')}
            </p>
          )}
          <button
            type="button"
            onClick={() => onSubmit({ count, sizeMl, nama })}
            disabled={pending}
            aria-busy={pending || undefined}
            className="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ginshu-400 px-4 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-50"
            data-testid="cellar-sheet-submit"
          >
            <Stack size={17} aria-hidden="true" />
            {mode === 'edit' ? t('sheetSave') : t('add')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
