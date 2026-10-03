import type { PublicCourseDto } from '@tokslearn/contract'
import { Avatar } from '@tokslearn/ui/avatar'
import { buttonClasses } from '@tokslearn/ui/button'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'
import { CurriculumList } from '@/components/catalog/curriculum-list'
import { Price } from '@/components/catalog/price'
import { PurchasePanel, refundLine } from '@/components/catalog/purchase-panel'
import { Track } from '@/components/catalog/track'
import { ReviewItem, ReviewSummary } from '@/components/reviews/review-list'
import { RichHtml } from '@/components/rich-html'
import { JsonLd } from '@/components/seo/json-ld'
import { env } from '@/env'
import { getCourse, getCourseCohorts, getCourseReviews, topCourseSlugs } from '@/lib/catalog-data'
import { certificateLabel, formatDate, languageLabel, levelLabel } from '@/lib/format'
import { resized } from '@/lib/image'

type Params = Promise<{ slug: string }>

/** Prerender the most popular courses; the rest get the app shell and fill on first visit. */
export async function generateStaticParams() {
  const slugs = await topCourseSlugs()
  // Cache Components needs at least one param; an empty catalog renders it as not found.
  return (slugs.length > 0 ? slugs : ['__none__']).map((slug) => ({ slug }))
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const result = await getCourse(slug)
  if (result.kind !== 'course') return { title: 'Course' }
  const c = result.course
  const description = clip(c.subtitle ?? c.outcomes.join('. ') ?? c.title, 155)
  return {
    // docs/12 §5: "{Course title} — {Instructor}", the layout adds "| Tokslearn".
    title: clip(`${c.title} — ${c.instructor.name}`, 48),
    description,
    alternates: { canonical: `/courses/${c.slug}` },
    ...(c.status === 'unlisted' ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: 'website', title: c.title, description, url: `/courses/${c.slug}` },
    twitter: { card: 'summary_large_image', title: c.title, description },
  }
}

// docs/20 §1 `/courses/[slug]`. Static per course, tagged `course:{id}` and refreshed on publish.
// Reviews are server-rendered (no client JS: this page is at its budget); voting and reporting
// live on /courses/[slug]/reviews.
export default function CoursePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<CourseSkeleton />}>
      <Course params={params} />
    </Suspense>
  )
}

/** Mirrors the header band and two columns so the streamed page doesn't move things around. */
function CourseSkeleton() {
  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-catalog px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-3 h-10 w-3/4" />
          <Skeleton className="mt-4 h-7 w-1/2" />
          <Skeleton className="mt-5 h-5 w-80 max-w-full" />
        </div>
      </div>
      <div className="mx-auto grid max-w-catalog gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <Skeleton className="h-96 rounded-card" />
        <Skeleton className="hidden h-[480px] rounded-dialog lg:block" />
      </div>
    </>
  )
}

async function Course({ params }: { params: Params }) {
  const { slug } = await params
  const result = await getCourse(slug)
  if (result.kind === 'redirect') permanentRedirect(`/courses/${result.slug}` as Route)
  if (result.kind === 'missing') notFound()
  const c = result.course
  const runs = c.cohortBased ? await getCourseCohorts(c.id) : []
  const site = env.NEXT_PUBLIC_APP_URL

  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-catalog px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <div className="max-w-[46rem] lg:max-w-[calc(100%-420px)]">
            {c.category ? (
              <nav aria-label="Breadcrumb" className="text-body-sm text-ink-2">
                {c.topCategory ? (
                  <>
                    <Link
                      href={`/categories/${c.topCategory.slug}` as Route}
                      className="hover:underline"
                    >
                      {c.topCategory.name}
                    </Link>
                    {' / '}
                  </>
                ) : null}
                <Link href={`/categories/${c.category.slug}` as Route} className="hover:underline">
                  {c.category.name}
                </Link>
              </nav>
            ) : null}
            <h1 className="mt-2 text-h1-sm text-ink sm:text-h1">{c.title}</h1>
            {c.subtitle ? <p className="mt-3 text-body-lg text-ink-2">{c.subtitle}</p> : null}
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-2">
              {c.ratingAvg !== null && c.ratingCount >= 3 ? (
                <span>
                  <span className="font-semibold text-ink">{c.ratingAvg.toFixed(1)}</span> ★ (
                  {c.ratingCount} ratings)
                </span>
              ) : null}
              {c.enrollmentCount > 0 ? (
                <span>{c.enrollmentCount.toLocaleString('en-NG')} learners</span>
              ) : null}
              <span>
                By{' '}
                {c.instructor.slug ? (
                  <Link
                    href={`/instructors/${c.instructor.slug}` as Route}
                    className="font-medium text-brand-ink underline underline-offset-4"
                  >
                    {c.instructor.name}
                  </Link>
                ) : (
                  c.instructor.name
                )}
              </span>
              <span>Updated {formatDate(c.updatedAt)}</span>
              <span>{languageLabel[c.language] ?? c.language}</span>
              <span>{levelLabel[c.level]}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-catalog gap-10 px-4 pt-8 pb-28 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-16 lg:px-8">
        <div className="flex min-w-0 flex-col gap-12">
          <div id="purchase" className="scroll-mt-24 lg:hidden">
            <PurchasePanel course={c} cohorts={runs} group="cohort-main" />
          </div>

          {c.outcomes.length > 0 ? (
            <section
              aria-labelledby="outcomes-title"
              className="rounded-card border border-border bg-surface p-6"
            >
              <h2 id="outcomes-title" className="text-h2 text-ink">
                What you'll learn
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {c.outcomes.map((o) => (
                  <li key={o} className="flex gap-2.5 text-body text-ink">
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      className="mt-1 size-4 shrink-0 text-brand"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {o}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <CurriculumList course={c} />

          {c.requirements.length > 0 ? (
            <section aria-labelledby="requirements-title">
              <h2 id="requirements-title" className="text-h2 text-ink">
                Before you start
              </h2>
              <ul className="mt-3 list-disc pl-6 text-body text-ink-2 [&_li]:mt-1.5">
                {c.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {c.descriptionHtml ? (
            <section aria-labelledby="description-title">
              <h2 id="description-title" className="text-h2 text-ink">
                About this course
              </h2>
              <RichHtml html={c.descriptionHtml} className="mt-3 text-body text-ink-2" />
            </section>
          ) : null}

          <InstructorBlock course={c} />

          <section aria-labelledby="reviews-title" className="scroll-mt-20" id="reviews">
            <h2 id="reviews-title" className="text-h2 text-ink">
              Reviews
            </h2>
            <Suspense fallback={<Skeleton className="mt-4 h-40 rounded-card" />}>
              <CourseReviews course={c} />
            </Suspense>
          </section>

          <Faq course={c} />
        </div>

        <aside aria-label="Buy this course" className="hidden lg:block">
          <div className="sticky top-24">
            <PurchasePanel course={c} cohorts={runs} group="cohort-side" />
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-border bg-surface px-4 py-3 lg:hidden">
        <Price priceKobo={c.priceKobo} compareAtKobo={c.compareAtKobo} />
        <a href="#purchase" className={buttonClasses({ size: 'md' })}>
          {c.priceKobo === '0' ? 'Enroll for free' : 'Buy this course'}
        </a>
      </div>

      <JsonLd data={courseJsonLd(c, site)} />
      <Track
        event="course_viewed"
        props={{
          course_id: c.id,
          is_enrolled: false,
          price_kobo: Number(c.priceKobo),
          has_certificate: c.certificateMode !== 'none',
        }}
      />
    </>
  )
}

function InstructorBlock({ course: c }: { course: PublicCourseDto }) {
  return (
    <section aria-labelledby="instructor-title">
      <h2 id="instructor-title" className="text-h2 text-ink">
        Your instructor
      </h2>
      <div className="mt-4 flex items-center gap-4">
        <Avatar
          name={c.instructor.name}
          src={c.instructor.avatarUrl && resized(c.instructor.avatarUrl, 128)}
          size="lg"
        />
        <div className="min-w-0">
          <p className="text-h4 text-ink">
            {c.instructor.slug ? (
              <Link
                href={`/instructors/${c.instructor.slug}` as Route}
                className="hover:text-brand-ink hover:underline"
              >
                {c.instructor.name}
              </Link>
            ) : (
              c.instructor.name
            )}
          </p>
          {c.instructor.headline ? (
            <p className="mt-0.5 text-body-sm text-ink-2">{c.instructor.headline}</p>
          ) : null}
        </div>
      </div>
      {c.instructor.bio ? (
        <p className="mt-4 max-w-prose whitespace-pre-line text-body text-ink-2">
          {c.instructor.bio}
        </p>
      ) : null}
    </section>
  )
}

function Faq({ course: c }: { course: PublicCourseDto }) {
  const items: Array<[string, string]> = [
    ['Can I get a refund?', refundLine(c.refundPolicyDays)],
    [
      'Do I get a certificate?',
      c.certificateMode === 'none'
        ? 'This course has no certificate.'
        : `${certificateLabel[c.certificateMode]}. Each certificate has a code employers can check on Tokslearn.`,
    ],
    [
      'How long do I have access?',
      'For as long as the course is on Tokslearn, on your phone and your laptop.',
    ],
    ['How do I pay?', 'In naira, by card, bank transfer or USSD through Paystack.'],
  ]
  return (
    <section aria-labelledby="faq-title">
      <h2 id="faq-title" className="text-h2 text-ink">
        Questions
      </h2>
      <div className="mt-4 divide-y divide-border rounded-card border border-border bg-surface">
        {items.map(([q, a]) => (
          <details key={q} className="group px-4">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-body font-medium text-ink [&::-webkit-details-marker]:hidden">
              {q}
              <span aria-hidden className="text-ink-3 group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="pb-4 text-body text-ink-2">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

/** Course + BreadcrumbList (docs/12 §5). aggregateRating only with 3+ ratings. */
function courseJsonLd(c: PublicCourseDto, site: string) {
  const url = `${site}/courses/${c.slug}`
  const hours = Math.max(1, Math.round(c.totalDurationSec / 3600))
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Course',
        '@id': url,
        name: c.title,
        description: c.subtitle ?? c.outcomes.join('. '),
        url,
        ...(c.coverUrl ? { image: c.coverUrl } : {}),
        inLanguage: c.language,
        educationalLevel: levelLabel[c.level],
        datePublished: c.publishedAt,
        dateModified: c.updatedAt,
        provider: { '@type': 'Organization', name: 'Tokslearn', sameAs: site },
        creator: {
          '@type': 'Person',
          name: c.instructor.name,
          ...(c.instructor.slug ? { url: `${site}/instructors/${c.instructor.slug}` } : {}),
        },
        offers: {
          '@type': 'Offer',
          category: c.priceKobo === '0' ? 'Free' : 'Paid',
          price: (Number(BigInt(c.priceKobo)) / 100).toFixed(2),
          priceCurrency: 'NGN',
          url,
        },
        hasCourseInstance: {
          '@type': 'CourseInstance',
          courseMode: 'Online',
          courseWorkload: `PT${hours}H`,
        },
        ...(c.ratingAvg !== null && c.ratingCount >= 3
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: c.ratingAvg.toFixed(1),
                ratingCount: c.ratingCount,
              },
            }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          ...(c.topCategory
            ? [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: c.topCategory.name,
                  item: `${site}/categories/${c.topCategory.slug}`,
                },
              ]
            : []),
          ...(c.category
            ? [
                {
                  '@type': 'ListItem',
                  position: c.topCategory ? 2 : 1,
                  name: c.category.name,
                  item: `${site}/categories/${c.category.slug}`,
                },
              ]
            : []),
          {
            '@type': 'ListItem',
            position: (c.topCategory ? 1 : 0) + (c.category ? 1 : 0) + 1,
            name: c.title,
            item: url,
          },
        ],
      },
    ],
  }
}

/** The six most helpful reviews and the summary; the rest on the reviews page. */
async function CourseReviews({ course: c }: { course: PublicCourseDto }) {
  const page = await getCourseReviews(c.id, 'helpful', 0, 6)
  if (page.summary.count === 0) {
    return (
      <p className="mt-2 text-body text-ink-2">
        No reviews yet. Learners can review a course once they've done a fifth of it.
      </p>
    )
  }
  return (
    <div className="mt-4 flex flex-col gap-4">
      <ReviewSummary summary={page.summary} />
      <div>
        {page.items.map((r) => (
          <ReviewItem key={r.id} review={r} instructorName={c.instructor.name} />
        ))}
      </div>
      {page.hasMore ? (
        <Link
          href={`/courses/${c.slug}/reviews` as Route}
          className={`${buttonClasses({ variant: 'secondary' })} w-fit`}
        >
          See all {page.summary.count} reviews
        </Link>
      ) : null}
    </div>
  )
}
