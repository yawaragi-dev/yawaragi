// Teaches: dynamic route — [slug] folder captures the URL segment and exposes it via the async params prop
import { notFound } from 'next/navigation'
import Link from 'next/link'

const VALID = new Set(['server-components', 'client-components', 'caching'])

export default async function LearnSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (!VALID.has(slug)) notFound()

  return (
    <div className="space-y-4 font-mono text-sm">
      <h1 className="text-xl font-bold capitalize">{slug.replace(/-/g, ' ')}</h1>
      <p className="text-gray-500">
        params.slug = <span className="bg-gray-100 px-1">{slug}</span>
      </p>
      <p className="text-gray-400 text-xs">[slug]/page.tsx is rendering</p>
      <Link href="/learn" className="text-blue-600 underline">
        ← /learn
      </Link>
    </div>
  )
}
