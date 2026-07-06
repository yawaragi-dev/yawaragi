'use client'

// `'use client'` is load-bearing here: this component owns the input
// state, an `onSubmit` handler, and the router push that navigates
// the page to `?q=<encoded>`. All three are concrete client-only
// needs per CLAUDE.md's "no `use client` without a concrete reason"
// rule. The RSC result view stays server-side — this component only
// hands the query off to the URL.

import { type FormEvent, useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { MAX_FREEFORM_QUERY_LEN } from '@/lib/suggest/suggest-action-state'

interface SuggestFreeformFormProps {
  /**
   * The seed query the URL landed with, if any. Reused as the initial
   * input value so the form is round-trippable: a visitor who submits
   * `smoky whisky` and lands on the result page sees `smoky whisky`
   * still in the input, editable to `hoppy IPA` without retyping.
   * Optional because the no-query landing has nothing to prefill.
   */
  initialQuery?: string
}

/**
 * Phase 4 / S6 (#144) — `<SuggestFreeformForm />`.
 *
 * The freeform-text input surface on `/[locale]/suggest`. The RSC page
 * routes on `?q=<string>` and calls `suggestAction` with a `{ kind:
 * 'freeform' }` seed; this form only wires the input state and the
 * navigation. All rendering of the result list stays in the RSC
 * layer — this component never touches the AI SDK or the MCP client.
 *
 * Voice: discovery framing per CLAUDE.md § "Age gate and JMStV
 * compliance". The placeholder and submit copy come from next-intl;
 * no inline literals leak an English-only path. The MAX_FREEFORM
 * cap is shared with the server action's validation seam so a
 * client-side overrun matches the server-side rejection.
 */
export function SuggestFreeformForm({ initialQuery = '' }: SuggestFreeformFormProps) {
  const t = useTranslations('suggest.freeform')
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)
  // Sync internal state when the URL-derived initialQuery changes. React
  // reconciles this component across navigation because the parent
  // `<SuggestPage>` renders `<SuggestFreeformForm />` at the same tree
  // position on both the empty-landing view and the freeform-result
  // view. Without this effect, `useState(initialQuery)` only reads the
  // prop on the FIRST mount — so a starter-chip click (which navigates
  // to `/suggest?q=<prompt>` without ever touching the input) or a
  // direct URL load (bookmark, shared link) left the input EMPTY
  // instead of pre-filled with the query the visitor is looking at.
  //
  // Effect only fires when initialQuery ACTUALLY changes, so live
  // typing (which mutates `value` but not `initialQuery`) is untouched.
  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])
  // `useTransition` marks the router.push as a transition so React
  // exposes an `isPending` flag that stays true while Next.js streams
  // the new RSC segment. Combined with `loading.tsx` this covers both
  // the "button still visible during navigation" span (isPending →
  // button label swap) and the "page-level render" span (loading.tsx).
  // Without the transition, the button reads as clicked-and-frozen for
  // the several seconds the LLM tool loop takes.
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = value.trim()
    // Empty submit is not a form-level error — the visitor might have
    // typed and then cleared. Route them back to the discovery-starter
    // view (`/suggest` with no query params).
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

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-3"
      data-testid="suggest-freeform-form"
      aria-busy={isPending}
    >
      <label className="flex flex-col gap-2" htmlFor="suggest-freeform-input">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {t('label')}
        </span>
        <input
          id="suggest-freeform-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('placeholder')}
          maxLength={MAX_FREEFORM_QUERY_LEN}
          autoComplete="off"
          spellCheck
          disabled={isPending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus-visible:ring-zinc-100"
          data-testid="suggest-freeform-input"
        />
      </label>
      <Button
        type="submit"
        disabled={isPending}
        data-testid="suggest-freeform-submit"
      >
        {isPending ? t('submitPending') : t('submit')}
      </Button>
    </form>
  )
}
