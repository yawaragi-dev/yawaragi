// Teaches: segment layout with named parallel-route slots — @sidebar and @modal render alongside children
import React from 'react'

export default function LearnLayout({
  children,
  sidebar,
  modal,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 font-mono text-xs">
      <header className="bg-yellow-300 px-6 py-2 border-b-2 border-black flex items-center gap-3">
        <span className="font-bold">⚠ PROTOTYPE</span>
        <span className="text-gray-700">/learn — App Router primitives demo — delete when done</span>
      </header>
      <div className="flex">
        <aside className="w-52 shrink-0 bg-gray-100 border-r-2 border-black min-h-screen p-4">
          {sidebar}
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
      {modal}
    </div>
  )
}
