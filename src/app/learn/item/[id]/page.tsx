// Teaches: the "real" full-page route — direct URL navigation always lands here; intercepting only applies when navigating from within /learn
import Link from 'next/link'

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="space-y-4 font-mono text-sm">
      <h1 className="text-xl font-bold">Item {id} (full page)</h1>
      <p className="text-gray-600">
        You navigated directly to this URL. If you had clicked the link from{' '}
        <code className="bg-gray-100 px-1">/learn</code>, the intercepting route in{' '}
        <code className="bg-gray-100 px-1">@modal/(.)item/[id]</code> would have shown a modal
        instead.
      </p>
      <p className="text-xs text-gray-400">item/[id]/page.tsx — id={id}</p>
      <Link href="/learn" className="text-blue-600 underline">
        ← /learn
      </Link>
    </div>
  )
}
