import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

/**
 * GDPR privacy notice (Art. 13). Static, server-rendered, allowlisted in
 * `isGatedPath` so it is reachable without the age-gate cookie (the cookie
 * banner must be able to deep-link here before the visitor consents to
 * anything). Copy lives in `messages/{en,de}.json` under `privacy` and is
 * updated in the same PR that introduces a new processing operation per
 * ADR-0009; the RoPA there is the record this page summarises.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'privacy' })
  return { title: `${t('title')} — Yawaragi` }
}

const SECTIONS = [
  'controller',
  'short',
  'visiting',
  'scan',
  'account',
  'counts',
  'processors',
  'rights',
  'retention',
  'changes',
] as const

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('privacy')

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-8 py-16"
      data-testid="privacy-page"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ash-600">{t('lastUpdated')}</p>
        <p className="max-w-prose text-base text-ash-800">{t('intro')}</p>
        <p className="max-w-prose text-sm text-ginshu-700">{t('draftNote')}</p>
      </header>

      {SECTIONS.map((id) => (
        <section key={id} className="flex flex-col gap-3" data-testid={`privacy-${id}`}>
          <h2 className="text-xl font-medium text-ink">{t(`sections.${id}.heading`)}</h2>
          <Blocks text={t(`sections.${id}.body`)} />
        </section>
      ))}
    </main>
  )
}

/**
 * A section body is paragraphs separated by a blank line; a paragraph whose
 * lines all start with "- " is a list. Keeps the copy one string per section,
 * so a translator sees each section whole.
 */
function Blocks({ text }: { text: string }) {
  return text.split('\n\n').map((block, index) => {
    const lines = block.split('\n')
    if (lines.every((line) => line.startsWith('- '))) {
      return (
        <ul key={index} className="flex max-w-prose list-disc flex-col gap-1.5 pl-5 text-base text-ash-800">
          {lines.map((line) => (
            <li key={line}>{line.slice(2)}</li>
          ))}
        </ul>
      )
    }
    return (
      <p key={index} className="max-w-prose text-base text-ash-800">
        {block}
      </p>
    )
  })
}
