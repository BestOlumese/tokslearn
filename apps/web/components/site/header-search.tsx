import { SearchIcon } from '@/components/icons/search-icon'

/** A plain GET form to /courses: works without JavaScript (docs/12 §1). */
export function HeaderSearch({ className = '' }: { className?: string }) {
  return (
    <search className={className}>
      <form action="/search" className="relative">
        <label htmlFor="site-search" className="sr-only">
          Search for courses
        </label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-3" />
        <input
          id="site-search"
          name="q"
          type="search"
          placeholder="Search for a course or skill"
          autoComplete="off"
          maxLength={100}
          className="h-11 w-full rounded-full border border-border-strong bg-surface pr-4 pl-10 text-body-sm text-ink placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </form>
    </search>
  )
}
