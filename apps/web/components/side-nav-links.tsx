import type { Route } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

export interface SideNavItem {
  href: Route
  label: string
  icon?: ReactNode
}

export interface SideNavGroup {
  label: string
  items: ReadonlyArray<SideNavItem>
}

/** Grouped side menu on desktop; one scrollable row on phones. `activeHref` marks the page. */
export function SideNavLinks({
  label,
  groups,
  activeHref,
  match = 'exact',
}: {
  label: string
  groups: ReadonlyArray<SideNavGroup>
  activeHref: string | null
  match?: 'exact' | 'prefix'
}) {
  const isActive = (href: string) =>
    activeHref !== null && (match === 'exact' ? activeHref === href : activeHref.startsWith(href))
  return (
    <nav aria-label={label}>
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:gap-6 md:px-0">
        {groups.map((group) => (
          <div key={group.label} className="contents md:block">
            <p className="mb-1.5 hidden px-3 text-caption text-ink-3 md:block">{group.label}</p>
            <ul className="contents md:flex md:flex-col md:gap-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href)
                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-11 items-center gap-3 rounded-control px-3 text-body-sm ${
                        active
                          ? 'bg-brand-soft font-medium text-brand-ink'
                          : 'text-ink-2 hover:bg-surface-sunken hover:text-ink'
                      }`}
                    >
                      {item.icon ? (
                        <span className="hidden md:inline-flex [&_svg]:size-[18px]">
                          {item.icon}
                        </span>
                      ) : null}
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}
