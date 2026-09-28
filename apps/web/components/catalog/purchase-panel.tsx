import type { PublicCourseDto } from '@tokslearn/contract'
import type { Route } from 'next'
import Link from 'next/link'
import { certificateLabel, formatDuration } from '@/lib/format'
import { BuyButtons } from './buy-buttons'
import { CourseCover } from './course-cover'
import { Price } from './price'

export function refundLine(days: number): string {
  return days === 0
    ? 'No refunds on this course.'
    : `Refund within ${days} days if you've watched less than 30% and downloaded no main files.`
}

/**
 * The course page's purchase panel (docs/11 §5): price, buying actions, refund rule in plain
 * words, what's included, certificate.
 */
export function PurchasePanel({ course }: { course: PublicCourseDto }) {
  const firstPreview = course.sections.flatMap((s) => s.lessons).find((l) => l.isPreview)
  const previewHref = course.promo
    ? `/courses/${course.slug}/preview/promo`
    : firstPreview
      ? `/courses/${course.slug}/preview/${firstPreview.id}`
      : null
  const includes = [
    course.totalDurationSec > 0 ? `${formatDuration(course.totalDurationSec)} of lessons` : null,
    `${course.lessonCount} ${course.lessonCount === 1 ? 'lesson' : 'lessons'}`,
    course.resourceCount > 0
      ? `${course.resourceCount} downloadable ${course.resourceCount === 1 ? 'file' : 'files'}`
      : null,
    'Watch on your phone or laptop, any time',
    course.certificateMode === 'none' ? null : certificateLabel[course.certificateMode],
  ].filter((x): x is string => Boolean(x))
  return (
    <div className="overflow-hidden rounded-dialog border border-border bg-surface">
      <div className="relative">
        <CourseCover
          src={course.promo?.thumbnailUrl ?? course.coverUrl}
          alt={course.title}
          priority
          sizes="(min-width: 1024px) 380px, 92vw"
          className="rounded-none"
        />
        {previewHref ? (
          <Link
            href={previewHref as Route}
            className="absolute inset-0 flex items-center justify-center bg-ink/25 text-body font-semibold text-ink-inverse hover:bg-ink/35"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-ink/70 px-4 py-2">
              <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Preview this course
            </span>
          </Link>
        ) : null}
      </div>
      <div className="flex flex-col gap-4 p-6">
        <Price priceKobo={course.priceKobo} compareAtKobo={course.compareAtKobo} size="lg" />
        <BuyButtons courseId={course.id} courseSlug={course.slug} free={course.priceKobo === '0'} />
        {course.priceKobo === '0' ? null : (
          <p className="text-body-sm text-ink-2">
            Pay in naira by card, bank transfer or USSD through Paystack.
          </p>
        )}
        <p className="text-body-sm text-ink">{refundLine(course.refundPolicyDays)}</p>
        <div>
          <h2 className="text-body-sm font-semibold text-ink">This course includes</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-body-sm text-ink-2">
            {includes.map((item) => (
              <li key={item} className="flex gap-2">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="mt-0.5 size-4 shrink-0 text-brand"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
