'use client'

// `'use client'` is load-bearing: focus and the caret position are browser
// state, and this sets both once the page is on screen.

import { useEffect } from 'react'

/**
 * Puts the caret back in §8's field, after the text, when the screen is asking
 * for more of it ("One more letter, and we will look.").
 *
 * Not the `autofocus` attribute: that focuses the field but leaves the caret
 * where the browser likes, and Firefox and Chromium both park it at offset 0.
 * After "a", the next keystroke would then produce "ba" rather than "ab". So
 * the caret is placed explicitly, at the end.
 *
 * Only rendered in that state. After a real search the field stays unfocused,
 * so a phone keyboard does not sit over the results the visitor asked for.
 */
export function FocusFieldAtEnd({ fieldId }: { fieldId: string }) {
  useEffect(() => {
    const field = document.getElementById(fieldId)
    if (!(field instanceof HTMLInputElement)) return
    field.focus()
    const end = field.value.length
    field.setSelectionRange(end, end)
  }, [fieldId])
  return null
}
