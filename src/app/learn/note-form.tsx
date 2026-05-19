// Teaches: useActionState — connects a server action to client-side pending/result state, no useState or fetch needed
'use client'

import { useActionState } from 'react'

type State = { message: string }

export function NoteForm({
  action,
}: {
  action: (state: State, formData: FormData) => Promise<State>
}) {
  const [state, formAction, isPending] = useActionState(action, { message: '' })

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-sm">
      <input
        name="note"
        placeholder="Type a note…"
        className="border rounded px-3 py-2 text-sm"
        disabled={isPending}
      />
      <button
        type="submit"
        disabled={isPending}
        className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Save note'}
      </button>
      {state.message && <p className="text-sm text-gray-600">{state.message}</p>}
    </form>
  )
}
