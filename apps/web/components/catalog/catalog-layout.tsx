import type { ReactNode } from 'react'

/** Filters on the left (desktop) or folded above (phones), results on the right. */
export function CatalogLayout({ filters, children }: { filters: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-catalog gap-6 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10 lg:px-8">
      <div>{filters}</div>
      <section aria-labelledby="results-title" className="min-w-0">
        <h2 id="results-title" className="sr-only">
          Courses
        </h2>
        {children}
      </section>
    </div>
  )
}
