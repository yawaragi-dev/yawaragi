// Teaches: loading.tsx implicitly wraps the page in Suspense — shown during server-side data fetching or navigation
export default function LearnLoading() {
  return (
    <div className="animate-pulse space-y-3 p-6 font-mono text-xs">
      <div className="h-6 bg-gray-300 rounded w-1/3" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <p className="text-gray-400 italic pt-2">loading.tsx is rendering…</p>
    </div>
  )
}
