// Teaches: async Server Component — awaiting data here suspends rendering; wrapping in <Suspense> enables streaming
export async function SlowFacts() {
  await new Promise(resolve => setTimeout(resolve, 1500))
  const res = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=3', {
    cache: 'no-store',
  })
  const posts: { id: number; title: string }[] = await res.json()

  return (
    <ul className="space-y-1">
      {posts.map(p => (
        <li key={p.id} className="text-sm bg-white border rounded px-3 py-2 font-mono">
          [{p.id}] {p.title}
        </li>
      ))}
    </ul>
  )
}
