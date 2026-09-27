import { Link } from '@/i18n/navigation'

/**
 * What a tab shows before its screen is built.
 *
 * The shell ships all four tabs at once because two of them would otherwise
 * point nowhere, and #162 settled how this project handles that: an advertised
 * surface is "visibly marked but navigable" — never a dead link. So Home and
 * Collection are real routes that say plainly what will be here and hand the
 * visitor a working alternative, rather than 404ing or silently doing nothing.
 *
 * Deliberately quiet. This is scaffolding, so it uses the design's plainest
 * shapes — one surface card, the accent mark, no illustration — and no
 * screenshot in `design/screenshots/` shows it, because the design has no
 * placeholder state. When §3 Home and §11 Collection are ported, both
 * callsites go and so does this file.
 */
interface TabPlaceholderProps {
  title: string
  body: string
  /** Where the visitor can actually go instead. */
  link: { href: '/scan' | '/profile'; label: string }
}

export function TabPlaceholder({ title, body, link }: TabPlaceholderProps) {
  return (
    <div className="px-5 py-8" data-testid="tab-placeholder">
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-yw-sm">
        {/* The design's accent "mark": a 2px × 14px rule before a heading,
            one per surface. */}
        <span className="h-3.5 w-0.5 bg-ginshu-500" aria-hidden="true" />
        <h1 className="text-title font-medium text-ink">{title}</h1>
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
