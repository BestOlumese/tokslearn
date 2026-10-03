import type { ReviewSort } from '@tokslearn/contract'
import { cn } from '@tokslearn/ui/cn'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'
import { ReviewActions } from '@/components/reviews/review-actions'
import { ReviewItem, ReviewSummary } from '@/components/reviews/review-list'
import { getCourse, getCourseReviews, topCourseSlugs } from '@/lib/catalog-data'

type Params = Promise<{ slug: string }>
type Search = Promise<{ sort?: string; page?: string }>

/** Same courses as the course page; the sort and page come from the query, at request time. */
export async function generateStaticParams() {
  const slugs = await topCourseSlugs()
  return (slugs.length > 0 ? slugs : ['__none__']).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const result = await getCourse(slug)
  if (result.kind !== 'course') return { title: 'Reviews' }
  return {
    title: `Reviews of ${result.course.title}`.slice(0, 60),
    alternates: { canonical: `/courses/${result.course.slug}/reviews` },
    robots: { index: false, follow: true },
  }
}

// docs/20 `/courses/[slug]/reviews`: every visible review, most helpful or newest first, with
// "Helpful" and "Report". The course page shows the first six without any client JS.
export default function ReviewsPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Search
}) {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <Reviews params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Reviews({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params
  const q = await searchParams
  const result = await getCourse(slug)
  if (result.kind === 'redirect') permanentRedirect(`/courses/${result.slug}/reviews` as Route)
  if (result.kind === 'missing') notFound()
  const c = result.course
  const sort: ReviewSort = q.sort === 'recent' ? 'recent' : 'helpful'
  const pageNo = Math.min(500, Math.max(0, Number.parseInt(q.page ?? '0', 10) || 0))
  const data = await getCourseReviews(c.id, sort, pageNo)
  const base = `/courses/${c.slug}/reviews`
  const href = (s: ReviewSort, p: number) => {
    const qs = new URLSearchParams({
      ...(s === 'recent' ? { sort: s } : {}),
      ...(p ? { page: String(p) } : {}),
    }).toString()
    return qs ? `${base}?${qs}` : base
  }
  const signIn = `/sign-in?next=${encodeURIComponent(base)}`

  return (
    <>
      <Link
        href={`/courses/${c.slug}` as Route}
        className="inline-flex w-fit items-center gap-1.5 text-body-sm text-ink-2 hover:text-ink"
      >
        {/* Inline, not lucide: an icon component would add JS to a page at its budget. */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m12 19-7-7 7-7M19 12H5" />
        </svg>
        {c.title}
      </Link>
      <h1 className="text-h2 text-ink">Reviews</h1>
      <ReviewSummary summary={data.summary} />
      {data.summary.count === 0 ? (
        <p className="text-body text-ink-2">
          No reviews yet. Learners can review a course once they've done a fifth of it.
        </p>
      ) : (
        <>
          <nav aria-label="Sort reviews" className="flex gap-1.5">
            {(
              [
                ['helpful', 'Most helpful'],
                ['recent', 'Newest'],
              ] as const
            ).map(([s, label]) => (
              <Link
                key={s}
                href={href(s, 0) as Route}
                aria-current={sort === s ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center rounded-full border px-3.5 text-body-sm',
                  sort === s
                    ? 'border-brand bg-brand-soft text-brand-ink'
                    : 'border-border bg-surface text-ink-2 hover:text-ink',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div>
            {data.items.map((r) => (
              <ReviewItem
                key={r.id}
                review={r}
                instructorName={c.instructor.name}
                actions={
                  <ReviewActions
                    reviewId={r.id}
                    helpfulCount={r.helpfulCount}
                    signInHref={signIn}
                  />
                }
              />
            ))}
          </div>
          <div className="flex justify-between gap-3">
            {pageNo > 0 ? (
              <Link
                href={href(sort, pageNo - 1) as Route}
                className="text-body-sm text-brand-ink hover:underline"
              >
                Previous 10
              </Link>
            ) : (
              <span />
            )}
            {data.hasMore ? (
              <Link
                href={href(sort, pageNo + 1) as Route}
                className="text-body-sm text-brand-ink hover:underline"
              >
                Next 10
              </Link>
            ) : null}
          </div>
        </>
      )}
    </>
  )
}
