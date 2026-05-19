// Teaches: (.) intercepting route — intercepts /learn/item/:id when navigating FROM /learn, shows modal overlay instead
'use client'

import { useRouter, useParams } from 'next/navigation'

export default function ItemModal() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => router.back()}
    >
      <div
        className="bg-white border-4 border-black p-8 max-w-sm w-full space-y-4 font-mono text-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg">Item {id}</span>
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-black text-xl leading-none"
          >
            ✕
          </button>
        </div>
        <p className="text-gray-600">
          This is an <strong>intercepted modal</strong>. The URL is{' '}
          <code className="bg-gray-100 px-1">/learn/item/{id}</code> but you see this overlay
          instead of the full page.
        </p>
        <p className="text-xs text-gray-400">@modal/(.)item/{id}/page.tsx</p>
        <button
          onClick={() => router.back()}
          className="bg-black text-white px-4 py-2 text-xs w-full"
        >
          close (router.back())
        </button>
      </div>
    </div>
  )
}
