import type { Route } from 'next'
import Link from 'next/link'

export interface SideNavItem {
  href: Route
  label: string
}

/** Vertical nav on desktop, scrollable row on phones. `activeHref` highlights the current page. */
export function SideNavLinks({
  label,
  items,
  activeHref,
  match = 'exact',
}: {
  label: string
  items: ReadonlyArray<SideNavItem>
  activeHref: string | null
  match?: 'exact' | 'prefix'
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {items.map((item) => {
          const active =
            activeHref !== null &&
            (match === 'exact' ? activeHref === item.href : activeHref.startsWith(item.href))
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'flex min-h-11 items-center rounded-control bg-brand-soft px-3 text-body-sm font-medium text-brand-ink'
                    : 'flex min-h-11 items-center rounded-control px-3 text-body-sm text-ink-2 hover:bg-surface-sunken hover:text-ink'
                }
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
