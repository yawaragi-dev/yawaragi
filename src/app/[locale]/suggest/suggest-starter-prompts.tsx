import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

/**
 * Phase 4 / S6 (#144) — `<SuggestStarterPrompts />`.
 *
 * The "I don't know what I want" starter set. Renders 6 discovery-
 * framed example phrases as clickable chips; each chip navigates to
 * `/suggest?q=<encoded>` which triggers the freeform tool loop with
 * that seed. Two purposes:
 *
 *   - Teach the visitor how to phrase a freeform query. The examples
 *     span the shape space — sake-vocabulary axes ("light and
 *     floral"), cross-beverage descriptors ("smoky whisky"), specific
 *     bottle references — so the visitor learns by seeing rather than
 *     by reading instructions.
 *   - Give the empty-input path a real onward destination without
 *     hard-coding brand ids. Hand-picking brand ids means guessing
 *     which sakes exist in the Sakenowa mirror at a given moment;
 *     picking prompts is orthogonal to the catalogue's state.
 *
 * Rendered as anchor tags rather than a wrapping client-side pre-fill,
 * because a chip click IS a suggest query — no reason to route it
 * through the input and then re-submit. The freeform form and the
 * starter chips coexist above/below on the empty-input landing view.
 *
 * All copy comes from next-intl (`suggest.starter.*`); no English-only
 * literals leak. The prompt STRINGS themselves are chosen per-locale so
 * a German visitor gets `"süffig und mild"` — not a machine translation
 * of the English list.
 */
export async function SuggestStarterPrompts() {
  const t = await getTranslations('suggest.starter')

  const prompts = [
    t('prompt1'),
    t('prompt2'),
    t('prompt3'),
    t('prompt4'),
    t('prompt5'),
    t('prompt6'),
  ]

  return (
    <section
      aria-labelledby="suggest-starter-heading"
      className="flex w-full flex-col gap-3"
      data-testid="suggest-starter"
    >
      <h2
        id="suggest-starter-heading"
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {t('heading')}
      </h2>
      <ul
        className="flex flex-wrap gap-2"
        data-testid="suggest-starter-list"
      >
        {prompts.map((prompt) => (
          <li key={prompt}>
            <Link
              href={{ pathname: '/suggest', query: { q: prompt } }}
              className="inline-flex items-center rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-sm text-zinc-800 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-100"
              data-testid="suggest-starter-prompt"
            >
              {prompt}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
