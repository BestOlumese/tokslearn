import Link from 'next/link'
import { MenuIcon } from '@/components/icons/menu-icon'
import { HeaderSearch } from '@/components/site/header-search'
import { HeaderAccount } from './header-account'
import { Wordmark } from './wordmark'

const navLink =
  'inline-flex h-10 shrink-0 items-center rounded-control px-3 text-body-sm font-medium text-ink-2 hover:bg-surface-sunken hover:text-ink'

// Global chrome (docs/20 §0). Cart and notifications join in Phases 4 and 9.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="mx-auto flex h-[68px] max-w-catalog items-center gap-3 px-4 sm:px-6 lg:gap-5 lg:px-8">
        <Wordmark />
        <nav aria-label="Main" className="hidden lg:block">
          <Link href="/courses" className={navLink}>
            Courses
          </Link>
        </nav>
        <HeaderSearch className="hidden max-w-[560px] flex-1 md:block" />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="hidden xl:contents">
            <Link href="/teach" className={navLink}>
              Teach on Tokslearn
            </Link>
          </span>
          <HeaderAccount />
          <details className="relative md:hidden">
            <summary
              aria-label="Menu"
              className="flex size-10 cursor-pointer list-none items-center justify-center rounded-control text-ink-2 hover:bg-surface-sunken [&::-webkit-details-marker]:hidden"
            >
              <MenuIcon />
            </summary>
            <div className="fixed inset-x-0 top-[68px] z-40 border-b border-border bg-surface px-4 pt-4 pb-5 shadow-pop">
              <HeaderSearch />
              <nav aria-label="Menu" className="mt-3 flex flex-col">
                <Link href="/courses" className={`${navLink} h-11`}>
                  Courses
                </Link>
                <Link href="/teach" className={`${navLink} h-11`}>
                  Teach on Tokslearn
                </Link>
                <Link href="/verify" className={`${navLink} h-11`}>
                  Verify a certificate
                </Link>
              </nav>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}
