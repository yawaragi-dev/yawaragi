// Teaches: @sidebar is a named parallel route slot — rendered independently alongside children in the layout
import Link from 'next/link'

export default function LearnSidebar() {
  return (
    <nav className="space-y-4 font-mono text-xs">
      <p className="font-bold text-gray-400 uppercase tracking-wider">Navigation</p>
      <ul className="space-y-1">
        <li><Link href="/learn" className="text-blue-600 hover:underline">/learn</Link></li>
        <li><Link href="/learn/server-components" className="text-blue-600 hover:underline">/learn/server-components</Link></li>
        <li><Link href="/learn/client-components" className="text-blue-600 hover:underline">/learn/client-components</Link></li>
        <li><Link href="/learn/caching" className="text-blue-600 hover:underline">/learn/caching</Link></li>
      </ul>
      <hr className="border-gray-300" />
      <p className="font-bold text-gray-400 uppercase tracking-wider">Items (modal)</p>
      <ul className="space-y-1">
        {[1, 2, 3].map(id => (
          <li key={id}>
            <Link href={`/learn/item/${id}`} className="text-purple-600 hover:underline">
              item {id}
            </Link>
          </li>
        ))}
      </ul>
      <hr className="border-gray-300" />
      <p className="font-bold text-gray-400 uppercase tracking-wider">Other</p>
      <ul className="space-y-1">
        <li><Link href="/learn/oops" className="text-red-500 hover:underline">oops (error)</Link></li>
        <li><Link href="/learn/does-not-exist" className="text-orange-500 hover:underline">not-found</Link></li>
      </ul>
    </nav>
  )
}
