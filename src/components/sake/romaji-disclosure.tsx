import { getTranslations } from 'next-intl/server'
import { InfoSheet } from '@/components/ui/info-sheet'

/**
 * The §16 disclosure for a LIST of Latin-spelled sake names.
 *
 * **Romaji is not Sakenowa data.** Sakenowa's Data API publishes Japanese
 * names only; `brands.name_romaji` and `breweries.name_romaji` are Hepburn
 * readings produced by Anthropic Haiku during `pnpm ingest` (see
 * `@/lib/sakenowa/romaji`). ADR-0005 classes that as `llm_inferred`, and the
 * bottle page already treats it that way — it mounts a
 * `<ProvenanceBadge source="llm_inferred" />` beside each romaji field.
 *
 * The list surfaces did not, which is the gap this closes. §6's similar-sakes
 * rows and §8's search results both render romaji for every row, so CLAUDE.md's
 * "do NOT show LLM-derived data without a `<ProvenanceBadge />`" was being
 * broken twenty rows at a time.
 *
 * **A badge per row is the wrong shape here**, which is why this is a sheet
 * and not twenty chips. Twenty rows carry up to forty romaji values; a chip on
 * each would bury the names it is annotating, and the claim is identical every
 * time — it is a property of the column, not of any one row. §16 exists for
 * exactly this: one visible caveat line, the full explanation a tap away, and
 * the caveat wired to the trigger via `aria-describedby` so assistive tech
 * reaches it without opening anything.
 *
 * It sits beside `<SakenowaAttribution placement="inline" />` on both lists,
 * which is also the honest place for it: the attribution says the rows are
 * Sakenowa's, and this says which part of them is not.
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
