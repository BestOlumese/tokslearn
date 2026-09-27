import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/site/page-header'
import { getDirectory } from '@/lib/catalog-data'

export const metadata: Metadata = {
  title: 'Categories',
  description: 'All Tokslearn course categories and subcategories, with how many courses each has.',
  alternates: { canonical: '/categories' },
}

const count = (n: number) => (n === 0 ? 'No courses yet' : `${n} ${n === 1 ? 'course' : 'courses'}`)

// docs/20 §1 `/categories`: all categories with subcategories and counts. Static, tagged `catalog`.
export default async function CategoriesPage() {
  const directory = await getDirectory()
  return (
    <>
      <PageHeader
        title="Categories"
        description="Pick a subject to see its courses."
        width="catalog"
      />
      <div className="mx-auto grid max-w-catalog gap-x-10 gap-y-10 px-4 pt-10 pb-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
        {directory.map((top) => (
          <section key={top.id} aria-labelledby={`cat-${top.slug}`}>
            <h2 id={`cat-${top.slug}`} className="text-h3 text-ink">
              <Link
                href={`/categories/${top.slug}` as Route}
                className="hover:text-brand-ink hover:underline"
              >
                {top.name}
              </Link>
            </h2>
            <p className="mt-1 text-body-sm text-ink-3">{count(top.count)}</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {top.children.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-3 text-body">
                  <Link
                    href={`/categories/${c.slug}` as Route}
                    className="text-ink-2 hover:text-brand-ink hover:underline"
                  >
                    {c.name}
                  </Link>
                  <span className="text-body-sm text-ink-3 tabular-nums">{c.count || ''}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
