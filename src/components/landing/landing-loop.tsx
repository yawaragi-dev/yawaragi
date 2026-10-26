import type { CSSProperties } from 'react'
import { ArrowLeft, Camera, CheckCircle, Hexagon, House, Notebook, Star } from '@phosphor-icons/react/dist/ssr'
import { getTranslations } from 'next-intl/server'
import { flavorRadarPolygonPoints } from '@/components/sake/flavor-radar-view'
import { DEMO_BOTTLE, DEMO_PALATE } from '@/lib/landing/demo-bottle'
import { FLAVOR_AXES } from '@/lib/schemas/flavor-chart'
import { palateLean } from '@/lib/taste/palate-read'
import { ratingBand } from '@/lib/taste/rating-band'
import { LandingLoopPlayer } from './landing-loop-player'

/**
 * The hero's phone — design v1.8, K: "one loop, about 11 s, from the real
 * screens with demo data". Scan → Result → Rate → Palate, then a hold and a
 * 300 ms crossfade back to the start.
 *
 * **Drawn, not a recording, and not the live components.** Each frame is the
 * real screen's layout and tokens (§4's viewfinder, §5's card and star row,
 * §12's hexagon and title) with the app's own strings, so it stays crisp,
 * translated and light. It does not mount `<ScanResultCard />` or the flavor
 * chart components: those carry links, info buttons and the Sakenowa credit,
 * all of which would be wrong inside a picture of a made-up bottle that
 * nobody can tap.
 *
 * **Before the 18+ gate, on purpose.** The bottle is "Mihon (見本)" — "sample"
 * — with an invented chart and rating (`demo-bottle.ts`). No catalogue sake,
 * no Sakenowa value and no database read is anywhere in it, which is why the
 * loop can render for a visitor who has not confirmed their age, and why the
 * landing no longer needs the catalogue at all. The bars and the hexagon carry
 * no axis words: they are a shape in a demo, and the six English words come
 * with their brewers'-term disclosure wherever they are shown (ADR-0022). No
 * glass and no pouring (K3, JMStV).
 *
 * **Motion is CSS only** (`.yw-loop-*` in `globals.css`), timed on one 11 s
 * cycle. The resting styles are the Result frame, still — K1's
 * reduced-motion frame — and the animations are added only under
 * `prefers-reduced-motion: no-preference`, so a browser that runs no
 * animation shows the same still frame. The only client code is the
 * pause control (`<LandingLoopPlayer />`).
 *
 * The phone is a picture (`aria-hidden`); the captions below it are the text
 * alternative — an ordered list, read in full by a screen reader, shown one
 * at a time on screen.
 */
export async function LandingLoop() {
  const t = await getTranslations('landing.loop')
  const tCamera = await getTranslations('scan.camera')
  const tOutcome = await getTranslations('scanOutcome')
  const tTasting = await getTranslations('tasting')
  const tBand = await getTranslations('rating.band')
  const tPalate = await getTranslations('palate')
  const tAxis = await getTranslations('flavorAxis')
  const tTabs = await getTranslations('tabs')

  const lean = palateLean(DEMO_PALATE)
  const palateTitle = tPalate('titleRead', {
    top: tAxis(`${lean.top}.label`),
    lean: tPalate(`lean.${lean.second}`),
  })
  const ratingText = `${DEMO_BOTTLE.rating.toFixed(1)} · ${tBand(ratingBand(DEMO_BOTTLE.rating))}`

  const tabs = [
    { icon: House, label: tTabs('home') },
    { icon: Camera, label: tTabs('scan') },
    { icon: Notebook, label: tTabs('collection') },
    { icon: Hexagon, label: tTabs('palate') },
  ] as const

  const phone = (
    <div
      className="yw-loop-phone relative h-[633px] w-[300px] overflow-hidden rounded-[34px] bg-ground shadow-yw-md"
      aria-hidden="true"
      data-testid="landing-loop-phone"
    >
      {/* -- 1. Scan (0–2.5 s): §4's viewfinder over the demo label ------- */}
      <div className="yw-loop-scan absolute inset-0 flex flex-col bg-camera" data-loop-frame="scan">
        <div className="flex h-12 items-center justify-center text-card-heading text-camera-ink">
          {tCamera('title')}
        </div>
        <div className="flex flex-1 flex-col items-center gap-4 pt-10">
          <div className="relative h-[226px] w-[170px] overflow-hidden rounded-[10px] bg-[#2a2826]">
            <div className="absolute inset-0 grid place-items-center">
              <DemoLabel className="h-[176px] w-[124px]" />
            </div>
            {/* The accent band that runs while a label is read (yw-sweep). */}
            <div className="animate-yw-sweep absolute inset-x-0 top-0 h-[30%] bg-gradient-to-b from-transparent via-ginshu-500/35 to-transparent" />
            <FrameCorners />
          </div>
          <p className="text-card-heading text-camera-ink">{tCamera('frameTitle')}</p>
        </div>
        <div className="flex h-[112px] items-center justify-center bg-black/30">
          <span className="grid size-[60px] place-items-center rounded-full ring-2 ring-ash-600">
            <span className="size-[48px] rounded-full bg-ginshu-600" />
          </span>
        </div>
      </div>

      {/* -- 2–3. Result and Rate (2.5–7 s): §5's card ------------------- */}
      <div className="yw-loop-result absolute inset-0 flex flex-col" data-loop-frame="result">
        <div className="flex h-12 items-center gap-2.5 px-4 text-meta text-ash-600">
          <ArrowLeft size={16} />
          {tOutcome('matchedKicker')}
        </div>
        <div className="flex flex-1 flex-col gap-4 px-3.5">
          <div className="yw-loop-card flex flex-col rounded-xl bg-surface shadow-yw-md">
            <div className="flex gap-3 p-3.5">
              <div className="grid h-[84px] w-[62px] shrink-0 place-items-center overflow-hidden rounded-lg bg-ash-200 shadow-yw-sm">
                <DemoLabel className="h-[76px] w-[54px]" />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-lg-alt font-medium leading-tight text-ink">{DEMO_BOTTLE.name}</span>
                <span className="text-meta text-ash-700" lang="ja">
                  {DEMO_BOTTLE.kanji}
                </span>
                <span className="text-micro text-ash-500">{t('demoBottle')}</span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <span className="inline-flex h-6 items-center rounded-full bg-ginshu-100 px-2.5 text-micro font-medium text-ginshu-700">
                    {tOutcome('sureMatch')}
                  </span>
                  <span className="inline-flex h-6 items-center rounded-full border border-ash-300 px-2.5 text-micro text-ash-700">
                    {t('grade')}
                  </span>
                </span>
              </div>
            </div>
            {/* "Your take" → "Logged": the panel takes the logged tint. */}
            <div className="yw-loop-panel flex flex-col gap-2.5 rounded-b-xl border-t border-divider p-3.5">
              <div className="grid text-card-heading font-medium text-ink">
                <span className="yw-loop-before-rate col-start-1 row-start-1 flex items-center gap-2">
                  <span className="h-3.5 w-0.5 bg-ginshu-500" />
                  {tTasting('yourTake')}
                </span>
                <span className="yw-loop-after-rate col-start-1 row-start-1 flex items-center gap-2">
                  <span className="h-3.5 w-0.5 bg-ginshu-500" />
                  {tTasting('logged')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="relative flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="relative size-[26px]">
                      <Star size={26} className="absolute inset-0 text-ash-400" />
                      {i < DEMO_BOTTLE.rating && (
                        <Star
                          size={26}
                          weight="fill"
                          className="yw-loop-star absolute inset-0 text-ginshu-600"
                          style={{ '--i': i } as CSSProperties}
                        />
                      )}
                      {/* The tap, on the fourth star. */}
                      {i === DEMO_BOTTLE.rating - 1 && (
                        <span className="yw-loop-tap absolute -inset-2 rounded-full bg-ink/20" />
                      )}
                    </span>
                  ))}
                </span>
                <span className="grid text-subtle">
                  <span className="yw-loop-before-rate col-start-1 row-start-1 text-ash-600">
                    {tTasting('tapToRate')}
                  </span>
                  <span className="yw-loop-after-rate col-start-1 row-start-1 whitespace-nowrap text-ink">
                    {ratingText}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* The six bars, f1..f6 in two columns as on §5, filling in turn. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-1.5">
            {FLAVOR_AXES.map((axis, i) => (
              <span key={axis} className="h-1 overflow-hidden rounded-full bg-ash-300">
                <span
                  className="yw-loop-bar block h-full origin-left rounded-full bg-ginshu-500"
                  style={{ '--i': i, '--v': DEMO_BOTTLE.flavor[axis] } as CSSProperties}
                />
              </span>
            ))}
          </div>
        </div>

        {/* "Logged · 4" — the notice over the tab bar. */}
        <div className="yw-loop-notice absolute inset-x-3.5 bottom-[76px] flex items-center gap-2.5 rounded-lg bg-raised px-3.5 py-3 text-subtle text-ink shadow-yw-float">
          <CheckCircle size={18} weight="fill" className="text-ginshu-600" />
          {t('notice', { rating: DEMO_BOTTLE.rating })}
        </div>
        <TabBar tabs={tabs} current={1} />
      </div>

      {/* -- 4. Palate (7–11 s): §12's hexagon grows, then its title ------ */}
      <div className="yw-loop-palate absolute inset-0 flex flex-col" data-loop-frame="palate">
        <div className="flex flex-1 flex-col gap-6 px-5 pt-12">
          <p className="yw-loop-title text-title font-medium text-ink">{palateTitle}</p>
          <svg viewBox="0 0 320 320" className="mx-auto w-[240px]">
            {[0.25, 0.5, 0.75, 1].map((m) => (
              <polygon
                key={m}
                points={flavorRadarPolygonPoints({ f1: m, f2: m, f3: m, f4: m, f5: m, f6: m })}
                className="fill-none stroke-ash-300"
                strokeWidth={1}
              />
            ))}
            <polygon
              points={flavorRadarPolygonPoints(DEMO_PALATE)}
              className="yw-loop-hex fill-ginshu-500/25 stroke-ginshu-600"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <TabBar tabs={tabs} current={3} />
      </div>
    </div>
  )

  const captions = (
    <ol className="grid text-center text-card-heading text-ink" data-testid="landing-loop-captions">
      <li className="yw-loop-cap-scan col-start-1 row-start-1">{t('captionScan')}</li>
      <li className="yw-loop-cap-result col-start-1 row-start-1" data-testid="landing-loop-caption-result">
        {t('captionResult')}
      </li>
      <li className="yw-loop-cap-rate col-start-1 row-start-1">{t('captionRate')}</li>
      <li className="yw-loop-cap-palate col-start-1 row-start-1">{t('captionPalate')}</li>
    </ol>
  )

  return (
    <LandingLoopPlayer
      phone={phone}
      captions={captions}
      label={t('label')}
      pauseLabel={t('pause')}
      playLabel={t('play')}
    />
  )
}

/**
 * The demo bottle's label: washi-coloured paper, 見本 set vertically, 純米
 * beside it, and the 和 mark stamped in the corner (K3). Drawn, so the hero
 * loads no photo.
 */
function DemoLabel({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 124 176" className={className}>
      <rect x="0" y="0" width="124" height="176" rx="6" fill="#e9e2d3" />
      <rect x="6" y="6" width="112" height="164" rx="3" fill="none" stroke="#1b1a19" strokeOpacity="0.25" />
      <text
        x="70"
        y="30"
        fill="#1b1a19"
        fontSize="46"
        fontWeight="600"
        style={{ writingMode: 'vertical-rl' }}
        lang="ja"
      >
        見本
      </text>
      <text x="28" y="36" fill="#8a5642" fontSize="13" style={{ writingMode: 'vertical-rl' }} lang="ja">
        純米
      </text>
      {/* The 和 mark, in accent, in the corner. */}
      <circle cx="102" cy="154" r="12" fill="#b8735a" />
      <text x="102" y="158.5" textAnchor="middle" fill="#e9e2d3" fontSize="13" fontWeight="600" lang="ja">
        和
      </text>
    </svg>
  )
}

/** §4's four corner brackets: 2px accent, radius 10. */
function FrameCorners() {
  const base = 'absolute size-[26px] border-ginshu-600'
  return (
    <>
      <span className={`${base} left-0 top-0 rounded-tl-[10px] border-l-2 border-t-2`} />
      <span className={`${base} right-0 top-0 rounded-tr-[10px] border-r-2 border-t-2`} />
      <span className={`${base} bottom-0 left-0 rounded-bl-[10px] border-b-2 border-l-2`} />
      <span className={`${base} bottom-0 right-0 rounded-br-[10px] border-b-2 border-r-2`} />
    </>
  )
}

function TabBar({
  tabs,
  current,
}: {
  tabs: ReadonlyArray<{ icon: typeof House; label: string }>
  current: number
}) {
  return (
    <div className="flex h-16 shrink-0 items-start justify-around border-t border-divider bg-surface pt-2.5">
      {tabs.map(({ icon: Icon, label }, i) => (
        <span
          key={label}
          className={`flex flex-col items-center gap-1 text-micro ${i === current ? 'text-ginshu-600' : 'text-ash-500'}`}
        >
          <Icon size={20} weight={i === current ? 'fill' : 'regular'} />
          {label}
        </span>
      ))}
    </div>
  )
}
