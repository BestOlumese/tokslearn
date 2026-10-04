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
  // Prefix mode: the longest link that contains the page wins, so `/admin` (the dashboard) and
  // `/admin/instructors` don't light up on `/admin/instructors/applications`.
  const contains = (href: string) =>
    activeHref !== null && (activeHref === href || activeHref.startsWith(`${href}/`))
  const best =
    match === 'prefix'
      ? groups
          .flatMap((g) => g.items.map((i) => i.href))
          .filter(contains)
          .sort((a, b) => b.length - a.length)[0]
      : undefined
  const isActive = (href: string) =>
    activeHref !== null && (match === 'exact' ? activeHref === href : href === best)
  return (
    // min-w-0: as a grid item on phones the nav would otherwise widen the page to fit its row
    // instead of scrolling it.
    <nav aria-label={label} className="min-w-0">
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
