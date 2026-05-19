// Teaches: error.tsx must be 'use client' — React error boundaries cannot be Server Components
'use client'

import { useEffect } from 'react'

export default function LearnError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[/learn] error boundary:', error)
  }, [error])

  return (
    <div className="p-6 border-4 border-red-600 bg-red-50 space-y-3 font-mono text-sm">
      <p className="font-bold text-red-700">error.tsx caught an unhandled error</p>
      <p className="text-red-600">{error.message}</p>
      {error.digest && <p className="text-gray-400 text-xs">digest: {error.digest}</p>}
      <button
        onClick={reset}
        className="bg-red-600 text-white px-4 py-2 text-xs"
      >
        reset()
      </button>
    </div>
  )
}
