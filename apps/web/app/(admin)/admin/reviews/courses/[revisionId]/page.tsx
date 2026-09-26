import { toReviewDto } from '@tokslearn/api'
import { getReview } from '@tokslearn/core/courses'
import { isDomainError } from '@tokslearn/core/kernel'
import { Badge } from '@tokslearn/ui/badge'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import Link from 'next/link'
import { type ReactNode, Suspense } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { CourseReviewDecision } from '@/components/admin/course-review-decision'
import { LessonPreview } from '@/components/admin/lesson-preview'
import { staffErrorState } from '@/components/admin/staff-error'
import { RichHtml } from '@/components/rich-html'
import { formatDateTime } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Course review' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const naira = (kobo: string | null) =>
  kobo === null ? '—' : kobo === '0' ? 'Free' : `₦${(BigInt(kobo) / 100n).toLocaleString('en-NG')}`
const levelLabel: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all: 'All levels',
}
const languageLabel: Record<string, string> = {
  en: 'English',
  pcm: 'Nigerian Pidgin',
  yo: 'Yorùbá',
  ig: 'Igbo',
  ha: 'Hausa',
  fr: 'French',
}
const typeLabel: Record<string, string> = {
  video: 'Video',
  article: 'Article',
  resource: 'Files',
  quiz: 'Quiz',
  assignment: 'Assignment',
  live: 'Live class',
}
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
const fieldLabel: Record<string, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  description: 'Description',
  outcomes: 'Outcomes',
  requirements: 'Requirements',
  categoryId: 'Category',
  level: 'Level',
  language: 'Language',
  priceKobo: 'Price',
  compareAtKobo: 'Old price',
  refundPolicyDays: 'Refund window',
  certificateMode: 'Certificate',
  coverFileId: 'Cover image',
}
const changeText = (c: Record<string, string>) => {
  switch (c.kind) {
    case 'section_added':
      return `New section: ${c.title}`
    case 'section_removed':
      return `Section removed: ${c.title}`
    case 'section_renamed':
      return `Section renamed: ${c.before} → ${c.after}`
    case 'lesson_added':
      return `New lesson in ${c.section}: ${c.title}`
    case 'lesson_removed':
      return `Lesson removed from ${c.section}: ${c.title}`
    case 'lesson_renamed':
      return `Lesson renamed in ${c.section}: ${c.before} → ${c.after}`
    case 'video_replaced':
      return `Video replaced in ${c.section}: ${c.title}`
    default:
      return 'Changed'
  }
}
const show = (field: string, v: unknown) => {
  if (v === null || v === undefined || v === '') return '—'
  if (field === 'priceKobo' || field === 'compareAtKobo') return naira(String(v))
  if (field === 'refundPolicyDays') return `${v} days`
  if (field === 'coverFileId') return 'image'
  if (Array.isArray(v)) return v.join('; ')
  const s = String(v)
  return s.length > 160 ? `${s.slice(0, 160)}…` : s
}

// docs/20 §6 `/admin/reviews/courses/[revisionId]`: revision diff, content preview (all lessons
// watchable), checklist, approve or request changes.
export default function CourseReviewPage({ params }: { params: Promise<{ revisionId: string }> }) {
  return (
    <div>
      <Link
        href="/admin/reviews/courses"
        className="inline-flex min-h-11 items-center text-body-sm text-brand underline-offset-4 hover:underline"
      >
        All course reviews
      </Link>
      <Suspense fallback={<Skeleton className="mt-4 h-96 w-full rounded-card" />}>
        <Review params={params} />
      </Suspense>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-body-sm text-ink-2">{label}</dt>
      <dd className="min-w-0 break-words text-body text-ink">{children}</dd>
    </div>
  )
}

async function Review({ params }: { params: Promise<{ revisionId: string }> }) {
  const { revisionId } = await params
  const path = `/admin/reviews/courses/${revisionId}`
  const ctx = await requireSignedInCtx(path)
  let review: ReturnType<typeof toReviewDto>
  try {
    if (!UUID.test(revisionId)) throw new Error('bad id')
    review = toReviewDto(await getReview(ctx, revisionId))
  } catch (error) {
    if (
      !isDomainError(error) ||
      error.code === 'REVISION_NOT_FOUND' ||
      error.code === 'COURSE_NOT_FOUND'
    ) {
      return (
        <EmptyState
          className="mt-6"
          title="We couldn't find that review."
          description="The link may be wrong."
          action={
            <Link href="/admin/reviews/courses" className={buttonClasses({ variant: 'secondary' })}>
              Back to reviews
            </Link>
          }
        />
      )
    }
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }

  const open = review.status === 'submitted'
  const lessons = review.outline.flatMap((s) => s.lessons)
  const minutes = lessons.reduce((sum, l) => sum + l.durationSec, 0)

  return (
    <div className="mt-2 flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start">
        {review.coverUrl ? (
          // biome-ignore lint/performance/noImgElement: staff-only preview of the course cover
          <img
            src={review.coverUrl}
            alt=""
            className="aspect-video w-full max-w-60 rounded-card border border-border object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1-sm text-ink">{review.title}</h1>
            <Badge tone={review.diff.firstVersion ? 'brand' : 'info'}>
              {review.diff.firstVersion ? 'New course' : `Update · version ${review.number}`}
            </Badge>
            {!open ? (
              <Badge tone="neutral">
                {review.status === 'approved' ? 'Approved' : 'Changes requested'}
              </Badge>
            ) : null}
          </div>
          {review.subtitle ? <p className="mt-1 text-body text-ink-2">{review.subtitle}</p> : null}
          <p className="mt-1 text-body-sm text-ink-3">
            By {review.instructorName}
            {review.submittedAt ? ` · submitted ${formatDateTime(review.submittedAt)}` : ''}
          </p>
        </div>
      </div>

      {!review.diff.firstVersion ? (
        <SettingsPanel
          id="changes"
          title="What changed"
          description="Compared with the live version."
        >
          {review.diff.fields.length === 0 && review.diff.outline.length === 0 ? (
            <p className="text-body text-ink-2">Only small edits to existing lessons.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-body text-ink">
              {review.diff.fields.map((f) => (
                <li key={f.field}>
                  <span className="font-medium">{fieldLabel[f.field] ?? f.field}:</span>{' '}
                  <span className="text-ink-3 line-through">{show(f.field, f.before)}</span> →{' '}
                  {show(f.field, f.after)}
                </li>
              ))}
              {review.diff.outline.map((c) => (
                <li key={JSON.stringify(c)}>{changeText(c)}</li>
              ))}
            </ul>
          )}
        </SettingsPanel>
      ) : null}

      <SettingsPanel id="summary" title="Course page">
        <dl className="divide-y divide-border">
          <Row label="Category">{review.categoryName ?? '—'}</Row>
          <Row label="Level and language">
            {levelLabel[review.level] ?? review.level} ·{' '}
            {languageLabel[review.language] ?? review.language}
          </Row>
          <Row label="Price">
            {naira(review.priceKobo)}
            {review.livePriceKobo && review.livePriceKobo !== review.priceKobo
              ? ` (live: ${naira(review.livePriceKobo)})`
              : ''}
          </Row>
          <Row label="Refund window">
            {review.refundPolicyDays === 0 ? 'No refunds' : `${review.refundPolicyDays} days`}
          </Row>
          <Row label="Learners will get">
            <ul className="list-disc pl-5">
              {review.outcomes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </Row>
          <Row label="Description">
            {review.descriptionHtml ? <RichHtml html={review.descriptionHtml} /> : '—'}
          </Row>
        </dl>
      </SettingsPanel>

      <SettingsPanel
        id="content"
        title="Content"
        description={`${lessons.length} lessons · ${clock(minutes)}. Open lessons to check audio, video and files.`}
      >
        <ol className="flex flex-col gap-4">
          {review.outline.map((s, i) => (
            <li key={s.id}>
              <h3 className="text-h4 text-ink">
                Section {i + 1}: {s.title}{' '}
                {s.isNew && !review.diff.firstVersion ? <Badge tone="info">New</Badge> : null}
              </h3>
              <ul className="mt-2 divide-y divide-border rounded-card border border-border">
                {s.lessons.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-body text-ink">{l.title}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-body-sm text-ink-3">
                      {typeLabel[l.type] ?? l.type}
                      {l.isPreview ? <Badge tone="brand">Preview</Badge> : null}
                      {l.isNew && !review.diff.firstVersion ? <Badge tone="info">New</Badge> : null}
                      {l.durationSec > 0 ? (
                        <span className="tabular-nums">{clock(l.durationSec)}</span>
                      ) : null}
                      {l.resourceCount > 0 ? (
                        <span>
                          {l.resourceCount} {l.resourceCount === 1 ? 'file' : 'files'}
                        </span>
                      ) : null}
                    </span>
                    <LessonPreview revisionId={review.revisionId} lessonId={l.id} title={l.title} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </SettingsPanel>

      {open ? (
        <CourseReviewDecision review={review} />
      ) : review.reviewNotes ? (
        <SettingsPanel id="notes" title="Reviewer notes">
          <p className="whitespace-pre-line text-body text-ink">{review.reviewNotes}</p>
        </SettingsPanel>
      ) : null}
    </div>
  )
}
