'use client'

// `'use client'` is load-bearing: this component owns the shared
// input value, the `useTransition` flag, and the single `submit()`
// path that both the freeform form's submit AND the starter chips'
// clicks flow through. Split-brain state was the failure mode #184
// caught — the chip navigated but the form's `useTransition` never
// fired, so the button stayed "Explore" while the LLM tool loop
// ran for several seconds.

import { useState, useTransition } from 'react'
import { useRouter } from '@/i18n/navigation'
import { SuggestFreeformForm } from './suggest-freeform-form'
import { SuggestStarterPrompts } from './suggest-starter-prompts'

interface SuggestEmptyInputProps {
  /**
   * The 6 localized starter prompts, resolved by the RSC parent from
   * `suggest.starter.prompt1..6` and threaded through to
   * `<SuggestStarterPrompts />`. Passed as strings so this wrapper
   * doesn't need a next-intl round-trip of its own.
   */
  starterPrompts: readonly string[]
}

/**
 * #184 — the shared-state parent for the `/[locale]/suggest`
 * empty-input landing view.
 *
 * The prior shape (S6, #144) had two independent children: a
 * `<SuggestFreeformForm />` with its own `useTransition` for the
 * typed-query path, and a `<SuggestStarterPrompts />` with anchor
 * links for the chip path. The chip path bypassed the form's
 * transition entirely — a click landed with no visible acknowledgement
 * for the several seconds the LLM tool loop took to render the next
 * page. Fails the 100 ms rule in
 * `docs/agents/ux-design-playbook.md` §"Interaction feedback loops".
 *
 * This wrapper elevates the state so BOTH paths share:
 *
 *   - `value` — the current input string. A chip click writes into
 *     this before navigating, so the freeform input reflects the
 *     picked prompt on-screen before `router.push` completes.
 *   - `isPending` — a single `useTransition` flag. Flips on ANY
 *     path (form submit or chip click), so the freeform submit
 *     button's `Exploring…` label lights up regardless of which
 *     surface the visitor used.
 *   - `submit()` — the one `router.push` call, wrapped in
 *     `startTransition`. Chip click → `setValue(prompt)` →
 *     `submit(prompt)`; direct form submit → `submit(value)`.
 *     The chip also carries an `activePrompt` marker so it can render
 *     an `aria-busy` visual pending affordance while its click is in
 *     flight.
 *
 * The wrapper only mounts on the empty-input landing branch of
 * `page.tsx` (`seedBrandId === null && freeformQuery === null`). Once
 * a query is present, the page routes to the result view which mounts
 * `<SuggestFreeformForm />` in its uncontrolled mode for refinement
 * (see the `key={actionSeed.query}` remount seam there).
 */
export function SuggestEmptyInput({ starterPrompts }: SuggestEmptyInputProps) {
  const router = useRouter()
  const [value, setValue] = useState('')
  // `useTransition` marks the router.push as a transition so React
  // exposes an `isPending` flag that stays true while Next.js streams
  // the new RSC segment. Combined with `loading.tsx` this covers both
  // the "control still visible during navigation" span (isPending →
  // label swap + chip aria-busy) and the "page-level render" span
  // (loading.tsx). Without the transition, the freeform button would
  // read as clicked-and-frozen for the several seconds the LLM tool
  // loop takes.
  const [isPending, startTransition] = useTransition()
  // Which chip (if any) the visitor most recently clicked. Used to
  // mark exactly one chip's `aria-busy` during navigation so the
  // announcement is precise — "this one is loading", not "somewhere,
  // something is loading". Null while a direct form submit is in
  // flight (no chip is the source).
  const [activePrompt, setActivePrompt] = useState<string | null>(null)

  const submit = (query: string) => {
    const trimmed = query.trim()
    // Empty submit — send the visitor back to the discovery-starter
    // view rather than a validation error. Matches the shape the
    // uncontrolled form had before #184.
    if (trimmed.length === 0) {
      startTransition(() => {
        router.push('/suggest')
      })
      return
    }
    startTransition(() => {
      router.push({
        pathname: '/suggest',
        query: { q: trimmed },
      })
    })
  }

  const handleSelectPrompt = (prompt: string) => {
    // Mirror the picked prompt into the shared input state BEFORE
    // navigation so the freeform input visibly reflects the click in
    // the same frame — the 100 ms rule. `setValue` and
    // `setActivePrompt` outside `startTransition` render synchronously
    // (they're not transitions), while `router.push` inside the
    // transition surfaces the `isPending` flag that the freeform
    // button + this chip both read.
    setValue(prompt)
    setActivePrompt(prompt)
    submit(prompt)
  }

  const handleFormSubmit = (query: string) => {
    // Direct form-submit path clears any lingering chip active-mark
    // (a visitor who typed after clicking a chip and then hit Enter
    // shouldn't leave a phantom aria-busy on the previously-clicked
    // chip).
    setActivePrompt(null)
    submit(query)
  }

  return (
    <>
      <SuggestFreeformForm
        value={value}
        onValueChange={setValue}
        isPending={isPending}
        onSubmitQuery={handleFormSubmit}
      />
      <SuggestStarterPrompts
        prompts={starterPrompts}
        onSelectPrompt={handleSelectPrompt}
        isPending={isPending}
        activePrompt={activePrompt}
      />
    </>
  )
}
