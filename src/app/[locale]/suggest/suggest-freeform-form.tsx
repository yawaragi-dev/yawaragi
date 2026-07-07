'use client'

// `'use client'` is load-bearing here: this component owns the input
// state, an `onSubmit` handler, and (in the uncontrolled result-view
// path) the router push that navigates the page to `?q=<encoded>`.
// All three are concrete client-only needs per CLAUDE.md's
// "no `use client` without a concrete reason" rule. The RSC result
// view stays server-side — this component only hands the query off
// to the URL.

import { type FormEvent, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { MAX_FREEFORM_QUERY_LEN } from '@/lib/suggest/suggest-action-state'

interface UncontrolledFreeformFormProps {
  /**
   * The seed query the URL landed with, if any. Reused as the initial
   * input value so the form is round-trippable: a visitor who submits
   * `smoky whisky` and lands on the result page sees `smoky whisky`
   * still in the input, editable to `hoppy IPA` without retyping.
   * Optional because the no-query landing has nothing to prefill.
   */
  initialQuery?: string
  value?: undefined
  onValueChange?: undefined
  isPending?: undefined
  onSubmitQuery?: undefined
}

interface ControlledFreeformFormProps {
  initialQuery?: undefined
  /** Controlled input value; owned by a client parent wrapper. */
  value: string
  onValueChange: (next: string) => void
  /** Shared pending flag (parent's `useTransition` state). */
  isPending: boolean
  /**
   * Shared submit callback. When set, this component defers navigation
   * to the parent — the parent decides whether to `router.push` (for
   * both form-submit AND chip-click paths, so both surfaces share one
   * pending state; see #184).
   */
  onSubmitQuery: (query: string) => void
}

type SuggestFreeformFormProps =
  | UncontrolledFreeformFormProps
  | ControlledFreeformFormProps

/**
 * Phase 4 / S6 (#144) — `<SuggestFreeformForm />`.
 *
 * The freeform-text input surface on `/[locale]/suggest`. Two modes:
 *
 *   - **Uncontrolled** (result-view usage): the form owns its own
 *     `useState` + `useTransition` and calls `router.push` directly.
 *     Used on `/suggest?q=…` where the freeform form re-renders inside
 *     the result view for query refinement.
 *   - **Controlled** (empty-input landing, per #184): a parent wrapper
 *     owns `value`, `isPending`, and a shared `submit()` callback. The
 *     form only renders the input + button; both this form's submit AND
 *     the sibling `<SuggestStarterPrompts />` chips flow through the
 *     parent's shared submit. That way a chip click flips the button's
 *     `Exploring…` label in the same frame — no more "chip clicked and
 *     nothing happens" gap the old anchor-link chips shipped with.
 *
 * Voice: discovery framing per CLAUDE.md § "Age gate and JMStV
 * compliance". The placeholder and submit copy come from next-intl;
 * no inline literals leak an English-only path. The MAX_FREEFORM
 * cap is shared with the server action's validation seam so a
 * client-side overrun matches the server-side rejection.
 */
export function SuggestFreeformForm(props: SuggestFreeformFormProps) {
  const t = useTranslations('suggest.freeform')

  if (isControlled(props)) {
    return (
      <FreeformFormInner
        value={props.value}
        onValueChange={props.onValueChange}
        isPending={props.isPending}
        onSubmitQuery={props.onSubmitQuery}
        t={t}
      />
    )
  }

  return <UncontrolledFreeformForm initialQuery={props.initialQuery} t={t} />
}

function isControlled(
  props: SuggestFreeformFormProps,
): props is ControlledFreeformFormProps {
  return typeof props.onSubmitQuery === 'function'
}

interface UncontrolledInnerProps {
  initialQuery?: string
  t: ReturnType<typeof useTranslations<'suggest.freeform'>>
}

function UncontrolledFreeformForm({
  initialQuery = '',
  t,
}: UncontrolledInnerProps) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)
  // Note on `initialQuery` sync: `useState(initialQuery)` only reads
  // the prop on the FIRST mount. Because React reconciles this
  // component across the empty-landing → freeform-result navigation
  // (same tree position in `page.tsx`), a naive setup would ignore
  // subsequent prop changes and leave the input empty on chip-click
  // or direct-URL loads. The fix is a `key` prop on the parent side
  // (`<SuggestFreeformForm key={initialQuery || 'empty'} />`) so
  // React unmounts + remounts the form whenever the URL-derived
  // query changes. Handling it there — not with a `useEffect` that
  // calls `setValue` — avoids the React 19 `set-state-in-effect`
  // lint rule and matches the framework's recommended pattern for
  // "reset state when a prop changes".
  // `useTransition` marks the router.push as a transition so React
  // exposes an `isPending` flag that stays true while Next.js streams
  // the new RSC segment. Combined with `loading.tsx` this covers both
  // the "button still visible during navigation" span (isPending →
  // button label swap) and the "page-level render" span (loading.tsx).
  // Without the transition, the button reads as clicked-and-frozen for
  // the several seconds the LLM tool loop takes.
  const [isPending, startTransition] = useTransition()

  const submitQuery = (query: string) => {
    const trimmed = query.trim()
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
    <FreeformFormInner
      value={value}
      onValueChange={setValue}
      isPending={isPending}
      onSubmitQuery={submitQuery}
      t={t}
    />
  )
}

interface FreeformFormInnerProps {
  value: string
  onValueChange: (next: string) => void
  isPending: boolean
  onSubmitQuery: (query: string) => void
  t: ReturnType<typeof useTranslations<'suggest.freeform'>>
}

function FreeformFormInner({
  value,
  onValueChange,
  isPending,
  onSubmitQuery,
  t,
}: FreeformFormInnerProps) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmitQuery(value)
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
          onChange={(e) => onValueChange(e.target.value)}
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
