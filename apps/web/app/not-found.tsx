import { buttonClasses } from '@tokslearn/ui/button'
import { HeaderSearch } from '@/components/site/header-search'
import { SiteFooter } from '@/components/site-footer'
import { Wordmark } from '@/components/wordmark'

// docs/20 §0 not-found: a search field and a way to the catalogue. The root not-found boundary
// ships with every route, so its header has no client components (keeps auth pages in budget).
export default function NotFound() {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-[68px] max-w-catalog items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Wordmark plain />
          <a href="/sign-in" className={buttonClasses({ variant: 'tertiary', size: 'sm' })}>
            Sign in
          </a>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <div className="mx-auto max-w-page px-4 pt-16 sm:px-6 sm:pt-24 lg:px-8">
          <p className="text-body-sm font-medium text-ink-3">Page not found</p>
          <h1 className="mt-2 text-h1-sm text-ink sm:text-h1">We couldn't find that page</h1>
          <p className="mt-3 max-w-prose text-body-lg text-ink-2">
            The link may be old, or the page may have moved. Search for a course or start from the
            course list.
          </p>
          <HeaderSearch className="mt-6 max-w-[480px]" />
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/courses" className={buttonClasses()}>
              Browse courses
            </a>
            <a href="/" className={buttonClasses({ variant: 'secondary' })}>
              Go to the home page
            </a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
