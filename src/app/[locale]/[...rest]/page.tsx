import { notFound } from 'next/navigation'

// Catch-all that triggers the locale-scoped not-found.tsx for any path under
// `/[locale]/` that doesn't match a more-specific route. Without this,
// Next.js falls back to its default 404 page which bypasses the locale
// layout (and so loses the header, footer, and cookie banner).
export default function CatchAll() {
  notFound()
}
