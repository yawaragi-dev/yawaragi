'use client'

import { useTranslations } from 'next-intl'
import { LearnMoreLink } from '@/components/learn/learn-more-link'
import { InfoSheetPanel } from '@/components/ui/info-sheet'
import { Sheet, SheetTrigger } from '@/components/ui/sheet'

/**
 * §4's first-scan hint (design v1.8, R1 and R4): three shape cards under the
 * viewfinder, then "Which side to photograph", which opens a sheet drawing a
 * bottle's front and back with the three parts numbered. It tells a visitor
 * who cannot read Japanese which part to aim at by how it looks, not by what
 * it says. Shown in place of "How to read a label" for the tab's first three
 * scans; the sheet's last line opens that entry.
 */
export function WhichSide() {
  const t = useTranslations('scan.camera.whichSide')
  const tSheet = useTranslations('provenance.sheet')

  return (
    <div className="flex flex-col items-center gap-2" data-testid="scan-camera-which-side">
      <ul className="flex gap-2" role="list" aria-label={t('cardsLabel')}>
        <ShapeCard shape="酒" lang="ja" label={t('cards.name')} />
        <ShapeCard shape="15%" label={t('cards.details')} />
        <ShapeCard shape="Aa" label={t('cards.importer')} />
      </ul>
      <Sheet>
        <SheetTrigger
          className="rounded-sm py-1 text-subtle leading-snug text-camera-ink/80 underline decoration-camera-ink/40 underline-offset-4 hover:text-camera-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="scan-camera-which-side-link"
        >
          {t('link')}
        </SheetTrigger>
        <InfoSheetPanel title={t('title')} closeLabel={tSheet('closeLabel')} id="which-side">
          <p className="mb-4">{t('intro')}</p>
          <BottleDrawing front={t('front')} back={t('back')} />
          <ol className="mt-4 flex flex-col gap-4">
            <Part n={1} title={t('name.title')} body={t('name.body')} />
            <Part n={2} title={t('details.title')} body={t('details.body')}>
              <ul className="mt-2 flex flex-wrap gap-2" role="list">
                <Characters shape="精米歩合" word={t('details.polishing')} />
                <Characters shape="アルコール分" word={t('details.alcohol')} />
                <Characters shape="15%" word={t('details.percent')} latin />
              </ul>
            </Part>
            <Part n={3} title={t('importer.title')} body={t('importer.body')} />
          </ol>
          <p className="mt-4">{t('outro')}</p>
          <LearnMoreLink slug="how-to-read-a-label" label={t('learnMore')} />
        </InfoSheetPanel>
      </Sheet>
    </div>
  )
}

function ShapeCard({ shape, label, lang }: { shape: string; label: string; lang?: string }) {
  return (
    <li className="flex min-w-[84px] flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 ring-1 ring-[rgba(246,242,234,.18)]">
      <span lang={lang} className="text-md-alt leading-tight text-camera-ink">
        {shape}
      </span>
      <span className="whitespace-nowrap text-[11px] leading-tight tracking-normal text-camera-ink/70">{label}</span>
    </li>
  )
}

function Part({ n, title, body, children }: { n: number; title: string; body: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-meta text-ginshu-700 ring-1 ring-ginshu-500"
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1">{body}</p>
        {children}
      </div>
    </li>
  )
}

function Characters({ shape, word, latin = false }: { shape: string; word: string; latin?: boolean }) {
  return (
    <li className="flex flex-col rounded-md bg-ash-200 px-2.5 py-1.5">
      <span lang={latin ? undefined : 'ja'} className="text-body text-ink">
        {shape}
      </span>
      <span className="text-[11px] tracking-normal text-ash-700">{word}</span>
    </li>
  )
}

/**
 * Front and back of one bottle, the three parts numbered as in screenshot 96.
 * Shapes only: the 酒 and the "15%" stand for what the visitor will see, and
 * every word in it is in the list under it, so it is hidden from readers.
 */
function BottleDrawing({ front, back }: { front: string; back: string }) {
  const bottle = 'M24 4h16v26c0 6 14 12 14 24v76c0 4-3 6-6 6H16c-3 0-6-2-6-6V54c0-12 14-18 14-24z'
  return (
    <svg viewBox="0 0 260 152" className="mx-auto w-full max-w-[280px]" aria-hidden="true">
      <g transform="translate(46 0)" className="stroke-ash-600" fill="none" strokeWidth="1.5">
        <path d={bottle} />
        <rect x="16" y="60" width="32" height="44" rx="3" className="stroke-ginshu-500" />
        <text x="32" y="90" textAnchor="middle" fontSize="22" className="fill-ink stroke-none" lang="ja">
          酒
        </text>
        <text x="32" y="148" textAnchor="middle" fontSize="10" className="fill-ash-600 stroke-none">
          {front}
        </text>
      </g>
      <g transform="translate(150 0)" className="stroke-ash-600" fill="none" strokeWidth="1.5">
        <path d={bottle} />
        <rect x="16" y="62" width="32" height="26" rx="2" className="stroke-ginshu-500" />
        <path d="M21 69h22M21 74h22M21 79h14" />
        <text x="32" y="86" textAnchor="middle" fontSize="6" className="fill-ink stroke-none">
          15%
        </text>
        <rect x="16" y="94" width="32" height="12" rx="2" strokeDasharray="3 2" className="stroke-ginshu-500" />
        <path d="M21 99h20M21 102.5h14" />
        <text x="32" y="148" textAnchor="middle" fontSize="10" className="fill-ash-600 stroke-none">
          {back}
        </text>
      </g>
      <NumberMark x={36} y={82} n={1} />
      <NumberMark x={222} y={75} n={2} />
      <NumberMark x={222} y={100} n={3} />
    </svg>
  )
}

function NumberMark({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="7" fill="none" strokeWidth="1" className="stroke-ginshu-500" />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9" className="fill-ginshu-700">
        {n}
      </text>
    </g>
  )
}
