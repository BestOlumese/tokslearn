import { Avatar } from '@tokslearn/ui/avatar'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'
import { CatalogLayout } from '@/components/catalog/catalog-layout'
import { CourseFilters } from '@/components/catalog/course-filters'
import { CourseGrid } from '@/components/catalog/course-grid'
import { GridSkeleton } from '@/components/catalog/grid-skeleton'
import { Pager } from '@/components/catalog/pager'
import { SortLinks } from '@/components/catalog/sort-links'
import { Track } from '@/components/catalog/track'
import { JsonLd } from '@/components/seo/json-ld'
import { env } from '@/env'
import { browse, getCategory, getDirectory } from '@/lib/catalog-data'
import { parseFilters, type RawParams } from '@/lib/catalog-params'

type Params = Promise<{ slug: string }>

export async function generateStaticParams() {
  const directory = await getDirectory()
  const slugs = directory.flatMap((t) => [t.slug, ...t.children.map((c) => c.slug)])
  // Cache Components needs at least one param; an empty database renders it as not found.
  return (slugs.length > 0 ? slugs : ['__none__']).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const found = await getCategory(slug)
  if (found?.kind !== 'category') return { title: 'Category' }
  const { category } = found
  return {
    title: `${category.name} courses`,
    description:
      category.description ??
      `${category.name} courses on Tokslearn, taught by Nigerian instructors and priced in naira.`,
    alternates: { canonical: `/categories/${category.slug}` },
  }
}

// docs/20 §1 `/categories/[slug]`: title, description, subcategory chips, filters and grid, popular
// instructors. Empty categories 404 unless they have subcategories.
export default function CategoryPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Promise<RawParams>
}) {
  return (
    <>
      <Suspense fallback={<HeaderSkeleton />}>
        <CategoryHeader params={params} />
      </Suspense>
      <Suspense
        fallback={
          <CatalogLayout filters={null}>
            <GridSkeleton />
          </CatalogLayout>
        }
      >
        <Results params={params} searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function HeaderSkeleton() {
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-catalog px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-9 w-72" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      </div>
    </div>
  )
}

async function load(params: Params) {
  const { slug } = await params
  const found = await getCategory(slug)
  if (!found) notFound()
  if (found.kind === 'redirect') permanentRedirect(`/categories/${found.slug}` as Route)
  if (found.category.count === 0 && found.children.length === 0) notFound()
  return found
}

async function CategoryHeader({ params }: { params: Params }) {
  const { category, parent, children, instructors } = await load(params)
  const site = env.NEXT_PUBLIC_APP_URL
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-catalog px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <nav aria-label="Breadcrumb" className="text-body-sm text-ink-2">
          <Link href="/categories" className="hover:underline">
            Categories
          </Link>
          {parent ? (
            <>
              {' / '}
              <Link href={`/categories/${parent.slug}` as Route} className="hover:underline">
                {parent.name}
              </Link>
            </>
          ) : null}
        </nav>
        <h1 className="mt-2 text-h1-sm text-ink sm:text-h1">{category.name}</h1>
        {category.description ? (
          <p className="mt-2 max-w-[46rem] text-body-lg text-ink-2">{category.description}</p>
        ) : null}
        {children.length > 0 ? (
          <ul aria-label="Subcategories" className="mt-5 flex flex-wrap gap-2">
            {children.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/categories/${c.slug}` as Route}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-body-sm text-ink-2 hover:border-ink-3 hover:text-ink"
                >
                  {c.name}
                  {c.count > 0 ? <span className="text-ink-3 tabular-nums">{c.count}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {instructors.length > 0 ? (
          <div className="mt-6">
            <h2 className="text-body-sm font-semibold text-ink">
              Instructors teaching {category.name}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-3">
              {instructors.map((i) => (
                <li key={i.slug}>
                  <Link
                    href={`/instructors/${i.slug}` as Route}
                    className="flex items-center gap-2.5 rounded-full py-1 pr-3 hover:bg-surface-sunken"
                  >
                    <Avatar name={i.name} src={i.avatarUrl} size="sm" />
                    <span className="text-body-sm text-ink">{i.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Categories', item: `${site}/categories` },
            ...(parent
              ? [
                  {
                    '@type': 'ListItem',
                    position: 2,
                    name: parent.name,
                    item: `${site}/categories/${parent.slug}`,
                  },
                ]
              : []),
            {
              '@type': 'ListItem',
              position: parent ? 3 : 2,
              name: category.name,
              item: `${site}/categories/${category.slug}`,
            },
          ],
        }}
      />
    </div>
  )
}

async function Results({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Promise<RawParams>
}) {
  const [found, raw] = await Promise.all([load(params), searchParams])
  const { q: _q, ...filters } = parseFilters(raw)
  const path = `/categories/${found.category.slug}`
  const page = await browse({ ...filters, categoryId: found.category.id })
  return (
    <CatalogLayout filters={<CourseFilters params={raw} action={path} />}>
      <SortLinks path={path} params={raw} />
      <div className="mt-6">
        {page.items.length === 0 ? (
          <EmptyState
            title="No courses here yet"
            description="Courses in this subject are on their way. Browse the others in the meantime."
            action={
              <Link href="/courses" className={buttonClasses({ variant: 'secondary' })}>
                All courses
              </Link>
            }
          />
        ) : (
          <CourseGrid
            courses={page.items}
            label={`${found.category.name} courses`}
            list="category"
          />
        )}
      </div>
      <Pager path={path} params={raw} nextCursor={page.nextCursor} />
      <Track />
    </CatalogLayout>
  )
}
