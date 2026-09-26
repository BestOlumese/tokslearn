import Link from 'next/link'
import { primaryNav } from '@/lib/site'
import { HeaderAccount } from './header-account'
import { Wordmark } from './wordmark'

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-page items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Wordmark />
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex h-10 items-center rounded-control px-3 text-body-sm font-medium text-ink-2 hover:bg-surface-sunken hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/courses"
            className="inline-flex h-10 items-center rounded-control px-3 text-body-sm font-medium text-ink-2 hover:bg-surface-sunken hover:text-ink md:hidden"
          >
            Courses
          </Link>
          <HeaderAccount />
        </div>
      </div>
    </header>
  )
}
