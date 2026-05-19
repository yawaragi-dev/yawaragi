// Teaches: async RSC as page + explicit Suspense streaming boundary + co-located server-action form
import { Suspense } from 'react'
import Link from 'next/link'
import { SlowFacts } from './slow-facts'
import { NoteForm } from './note-form'
import { addNote } from './actions'

const SLUGS = ['server-components', 'client-components', 'caching']
const ITEM_IDS = [1, 2, 3]

export default function LearnPage() {
  return (
    <div className="space-y-8 font-mono text-sm">
      <h1 className="text-xl font-bold">App Router Primitives</h1>

      <section className="space-y-2">
        <p className="font-bold text-gray-500 uppercase text-xs">Dynamic routes [slug]</p>
        <div className="flex gap-3 flex-wrap">
          {SLUGS.map(slug => (
            <Link key={slug} href={`/learn/${slug}`} className="text-blue-600 underline">
              /learn/{slug}
            </Link>
          ))}
          <Link href="/learn/unknown-slug" className="text-orange-600 underline">
            /learn/unknown-slug → notFound()
          </Link>
        </div>
      </section>

      <section className="space-y-2">
        <p className="font-bold text-gray-500 uppercase text-xs">
          Intercepting routes — click from here → modal; direct URL → full page
        </p>
        <div className="flex gap-3">
          {ITEM_IDS.map(id => (
            <Link key={id} href={`/learn/item/${id}`} className="text-purple-600 underline">
              item {id}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <p className="font-bold text-gray-500 uppercase text-xs">Streaming Suspense boundary</p>
        <Suspense
          fallback={
            <p className="text-gray-400 italic">Streaming… (loading.tsx handles navigation; this Suspense handles in-page streaming)</p>
          }
        >
          <SlowFacts />
        </Suspense>
      </section>

      <section className="space-y-2">
        <p className="font-bold text-gray-500 uppercase text-xs">Server action + useActionState</p>
        <NoteForm action={addNote} />
      </section>

      <section className="space-y-2">
        <p className="font-bold text-gray-500 uppercase text-xs">Error boundary</p>
        <Link href="/learn/oops" className="text-red-600 underline">
          /learn/oops → throws → error.tsx
        </Link>
      </section>
    </div>
  )
}
