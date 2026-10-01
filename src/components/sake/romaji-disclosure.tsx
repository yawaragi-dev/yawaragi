import { getTranslations } from 'next-intl/server'
import { InfoSheet } from '@/components/ui/info-sheet'

/**
 * One §16 disclosure for a LIST whose every row carries a romaji name.
 *
 * Romaji in this app is an LLM transliteration of a Sakenowa-sourced record
 * (`src/lib/sakenowa/romaji.ts`), so CLAUDE.md requires that it never appear
 * without a provenance affordance. On a single prominent value — the bottle's
 * own name — that affordance is a `<ProvenanceBadge />` attached to the value.
 * On a list it cannot be: eight chips would carry eight identical badges, each
 * one louder than the name it qualifies, saying the same sentence eight times.
 *
 * §16 is the shape for a set of claims rather than one: a short caveat line,
 * an info button wired to it by `aria-describedby`, and a sheet with the full
 * explanation. The claim it makes is true of every row, so it is stated once.
 * Same reasoning CLAUDE.md records for `<HeuristicDisclaimer />`'s density
 * pass — the caveat stays in the DOM, so a screen-reader user reaches it with
 * no interaction, and the visible line keeps the cue.
 */
export async function RomajiDisclosure({ id }: { id: string }) {
  const t = await getTranslations('provenance.romajiDisclosure')
  const tSheet = await getTranslations('provenance.sheet')
  return (
    <InfoSheet
      id={id}
      caveat={t('caveat')}
      triggerLabel={t('triggerLabel')}
      title={t('title')}
      closeLabel={tSheet('closeLabel')}
    >
      {t('body')}
    </InfoSheet>
  )
}
