import { Link } from '@/i18n/navigation'

/**
 * What a tab shows before its screen is built.
 *
 * The shell ships all four tabs at once, and #162 settled how this project
 * handles a tab whose screen is not ready: an advertised surface is "visibly
 * marked but navigable" — never a dead link.
 *
 * **One callsite left.** §3 Home and §11 Collection are both ported, but §11's
 * journal is maintainer-only until the local-first rewrite (ADR-0020, gated on
 * ADR-0011), so everyone else still has nothing of their own to list there.
 * That is the remaining case: not an unbuilt screen, but a built one a visitor
 * cannot yet have data in. This file goes with that gate.
 *
 * Deliberately quiet. This is scaffolding, so it uses the design's plainest
 * shapes — one surface card, the accent mark, no illustration — and no
 * screenshot in `design/screenshots/` shows it, because the design has no
 * placeholder state.
 */
interface TabPlaceholderProps {
  title: string
  body: string
  /** Where the visitor can actually go instead. */
  link: { href: '/profile'; label: string }
}

export function TabPlaceholder({ title, body, link }: TabPlaceholderProps) {
  return (
    <div className="px-5 py-8" data-testid="tab-placeholder">
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-yw-sm">
        {/* The design's accent "mark": a 2px × 14px rule BESIDE the heading,
            never above it. Every occurrence in the prototype is
            `display:flex; align-items:center; gap:8px` around the mark and its
            title — a stacked mark reads as a stray line, not as a mark. */}
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-0.5 shrink-0 bg-ginshu-500" aria-hidden="true" />
          <h1 className="text-title font-medium text-ink">{title}</h1>
        </div>
        <p className="text-body text-ash-600">{body}</p>
        <Link
          href={link.href}
          className="self-start rounded-sm text-body font-medium text-ginshu-700 underline underline-offset-4 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="tab-placeholder-link"
        >
          {link.label}
        </Link>
      </div>
    </div>
  )
}
