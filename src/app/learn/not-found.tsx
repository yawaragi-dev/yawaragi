// Teaches: not-found.tsx renders when notFound() is called or no route matches within this segment
import Link from 'next/link'

export default function LearnNotFound() {
  return (
    <div className="p-6 space-y-3 font-mono text-sm">
      <p className="text-4xl font-bold">404</p>
      <p className="text-gray-600">No route matched within the /learn segment.</p>
      <p className="text-gray-400 text-xs">not-found.tsx is rendering</p>
      <Link href="/learn" className="text-blue-600 underline">
        ← /learn
      </Link>
    </div>
  )
}
