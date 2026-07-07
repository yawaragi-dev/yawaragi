'use client'

// `'use client'` is load-bearing here: after #184 the chips became
// interactive controls (button + click handler + pending style tied
// to a sibling form's `useTransition` state). The chip strings are
// still resolved server-side in `page.tsx` and passed in as props,
// so this component is a pure interaction shell — no next-intl call
// for the prompt list itself. Mirrors the `<Header />` →
// `<HeaderNav messages={} />` pattern from #162.

import { useTranslations } from 'next-intl'

interface SuggestStarterPromptsProps {
  /**
   * The 6 localized starter prompts, resolved by the RSC parent from
   * `suggest.starter.prompt1..6` and passed in as strings. Order is
   * meaningful (recognised by the E2E spec via array index).
   */
  prompts: readonly string[]
  /**
   * Called when a chip is activated. The parent wrapper is expected
   * to (a) mirror the picked prompt into the freeform input state
   * so the visitor SEES what they chose, and (b) `router.push` the
   * navigation inside a `startTransition` so `isPending` flips true
   * in the same frame. Both happen through the shared `submit()`
   * callback owned by `<SuggestEmptyInput />`; this component is
   * agnostic to the mechanics.
   */
  onSelectPrompt: (prompt: string) => void
  /**
   * True while the parent's transition is in flight. Chips render a
   * subtle busy affordance (reduced opacity, `aria-busy` on the
   * clicked chip, all chips disabled to prevent racing clicks) so
   * the visitor sees the click land in the same frame — the 100 ms
   * feedback rule from `docs/agents/ux-design-playbook.md`.
   */
  isPending: boolean
  /**
   * The prompt the visitor most recently clicked, if any. Used to
   * mark exactly one chip as `aria-busy` during navigation so
   * assistive tech can announce which item the visitor picked
   * (WCAG 4.1.3 SC "Status Messages"). Kept null on the initial
   * render so no chip advertises pending state before any click.
   */
  activePrompt: string | null
}

/**
 * Phase 4 / S6 (#144), rewired for #184 — `<SuggestStarterPrompts />`.
 *
 * The "I don't know what I want" starter set. Renders 6 discovery-
 * framed example phrases as clickable BUTTONS (was: RSC anchor
 * links) so each click flips a shared pending state in the same
 * frame. A chip click:
 *
 *   1. mirrors its text into the freeform input via the parent
 *      wrapper's shared value state (visitor SEES what they picked);
 *   2. runs the shared `submit()` which `router.push`es inside
 *      `startTransition`, so the freeform submit button's
 *      `Exploring…` label lights up in the same frame; and
 *   3. marks the clicked chip `aria-busy` + visually pending so
 *      the click feels acknowledged (100 ms rule; the sibling
 *      freeform button and this chip share ownership of the
 *      pending signal).
 *
 * All copy comes from next-intl (`suggest.starter.*`), resolved in
 * the RSC parent and passed in as strings. The prompt STRINGS
 * themselves are chosen per-locale so a German visitor gets
 * `"süffig und mild"` — not a machine translation of the English
 * list.
 */
export function SuggestStarterPrompts({
  prompts,
  onSelectPrompt,
  isPending,
  activePrompt,
}: SuggestStarterPromptsProps) {
  const t = useTranslations('suggest.starter')

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
        {prompts.map((prompt) => {
          const isActive = activePrompt === prompt
          return (
            <li key={prompt}>
              <button
                type="button"
                onClick={() => onSelectPrompt(prompt)}
                // Disabling during pending prevents a second click
                // from racing the first `router.push`; `useTransition`
                // would queue it anyway but the visual + a11y story
                // is cleaner if the chips read as "not interactive
                // right now" for the ~seconds the tool loop runs.
                disabled={isPending}
                aria-busy={isActive}
                data-testid="suggest-starter-prompt"
                data-active={isActive ? 'true' : undefined}
                className="inline-flex items-center rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-sm text-zinc-800 transition-opacity hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 data-[active=true]:opacity-70 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-100"
              >
                {prompt}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
